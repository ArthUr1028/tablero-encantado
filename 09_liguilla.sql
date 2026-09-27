-- ============================================================================
-- 09_liguilla.sql — Torneos de liguilla (todos contra todos, una vuelta)
-- El Tablero Encantado · V122
--
-- Qué hace:
--   1) Agrega columnas a tournaments / tournament_matches / game_challenges.
--   2) Inscripción: solo mientras el torneo está en 'inscripciones' y solo
--      miembros del club (reemplaza la política "inscribirse uno mismo").
--   3) start_tournament(): sortea el orden y genera TODAS las partidas
--      (método del círculo: cada jugador juega una vez con cada otro,
--      colores repartidos lo más parejo posible).
--   4) send_tournament_challenge(): el botón "Jugar" — manda el reto de la
--      partida del torneo (variante, reloj y color ya fijados).
--   5) respond_challenge(): igual que antes, pero un reto de torneo NO se
--      puede rechazar y la partida creada queda enlazada al torneo.
--   6) Trigger en games: al terminar una partida de torneo, el resultado se
--      anota solo en tournament_matches; al cerrarse la última, el torneo
--      pasa a 'finalizado'.
--   7) forfeit_match(): solo el creador; derrota por ausencia.
--
-- Patrón del proyecto: nada de políticas RLS con subconsulta a su propia
-- tabla; toda escritura sensible va por funciones SECURITY DEFINER.
-- Seguro de correr más de una vez.
-- ============================================================================

-- 1) Columnas nuevas ---------------------------------------------------------
alter table tournaments
  add column if not exists format text not null default 'liguilla',
  add column if not exists time_control_initial_seconds integer,
  add column if not exists time_control_increment_seconds integer,
  add column if not exists deadline timestamptz;

alter table tournament_matches
  add column if not exists white_id uuid,
  add column if not exists status text not null default 'pendiente',
  add column if not exists result text;

do $$ begin
  alter table tournament_matches
    add constraint tournament_matches_status_chk
    check (status in ('pendiente','en_juego','jugada','ausencia'));
exception when duplicate_object then null; end $$;

alter table game_challenges
  add column if not exists tournament_match_id uuid;

-- A lo más un reto pendiente por partida de torneo.
create unique index if not exists uq_challenge_tournament_pending
  on game_challenges (tournament_match_id)
  where tournament_match_id is not null and status = 'pendiente';

-- 2) Inscripción ---------------------------------------------------------------
create or replace function tournament_accepts_signups(p_t uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from tournaments where id = p_t and status = 'inscripciones');
$$;

drop policy if exists "inscribirse uno mismo" on tournament_participants;
create policy "inscribirse uno mismo" on tournament_participants
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and is_club_member(auth.uid())
    and tournament_accepts_signups(tournament_id)
  );

drop policy if exists "darse de baja" on tournament_participants;
create policy "darse de baja" on tournament_participants
  for delete to authenticated
  using (profile_id = auth.uid() and tournament_accepts_signups(tournament_id));

-- 3) Iniciar el torneo: sorteo + calendario completo ----------------------------
create or replace function start_tournament(p_tournament_id uuid)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_t tournaments%rowtype;
  v_players uuid[];
  n int; m int; i int; r int; k int;
  cur uuid[];
  a uuid; b uuid; w uuid;
  bal_a int; bal_b int;
  v_count int := 0;
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  select * into v_t from tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Ese torneo no existe.'; end if;
  if v_t.created_by is distinct from auth.uid() then
    raise exception 'Solo quien creó el torneo puede iniciarlo.';
  end if;
  if v_t.status <> 'inscripciones' then
    raise exception 'Este torneo ya empezó.';
  end if;

  select array_agg(profile_id order by random()) into v_players
    from tournament_participants where tournament_id = p_tournament_id;
  n := coalesce(array_length(v_players, 1), 0);
  if n < 3 then
    raise exception 'Hacen falta al menos 3 jugadores inscritos (hay %).', n;
  end if;

  for i in 1..n loop
    update tournament_participants set seed = i
     where tournament_id = p_tournament_id and profile_id = v_players[i];
  end loop;

  -- Método del círculo. Con número impar se agrega un "descanso" (null).
  m := n + (n % 2);
  cur := v_players;
  if n % 2 = 1 then cur := cur || array[null::uuid]; end if;

  for r in 1..(m - 1) loop
    for k in 1..(m / 2) loop
      a := cur[k]; b := cur[m + 1 - k];
      if a is not null and b is not null then
        -- Reparte los colores: blancas para quien lleva MENOS blancas en lo
        -- que va del calendario; si van parejos, alterna por jornada y mesa.
        select 2 * count(*) filter (where white_id = a)
                 - count(*) filter (where player1_id = a or player2_id = a)
          into bal_a from tournament_matches where tournament_id = p_tournament_id;
        select 2 * count(*) filter (where white_id = b)
                 - count(*) filter (where player1_id = b or player2_id = b)
          into bal_b from tournament_matches where tournament_id = p_tournament_id;
        if bal_a < bal_b then w := a;
        elsif bal_b < bal_a then w := b;
        elsif ((r + k) % 2) = 0 then w := a;
        else w := b;
        end if;
        v_count := v_count + 1;
        insert into tournament_matches
          (tournament_id, round, match_number, player1_id, player2_id, white_id, status)
        values
          (p_tournament_id, r, v_count, a, b, w, 'pendiente');
      end if;
    end loop;
    -- rota todos menos el primero
    cur := array[cur[1]] || array[cur[m]] || cur[2:m - 1];
  end loop;

  update tournaments set status = 'en_curso' where id = p_tournament_id;
  return v_count;
end;
$$;

-- 4) Botón "Jugar": reto de la partida de torneo ---------------------------------
create or replace function send_tournament_challenge(p_match_id uuid)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_m tournament_matches%rowtype;
  v_t tournaments%rowtype;
  v_opp uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  select * into v_m from tournament_matches where id = p_match_id for update;
  if not found then raise exception 'Esa partida no existe.'; end if;
  select * into v_t from tournaments where id = v_m.tournament_id;
  if v_t.status <> 'en_curso' then raise exception 'El torneo no está en curso.'; end if;
  if auth.uid() not in (v_m.player1_id, v_m.player2_id) then
    raise exception 'Esta partida no es tuya.';
  end if;
  if v_m.status <> 'pendiente' then
    raise exception 'Esta partida ya se jugó o está en juego.';
  end if;
  if exists (select 1 from game_challenges
              where tournament_match_id = p_match_id and status = 'pendiente') then
    raise exception 'Ya hay un reto pendiente para esta partida (revisa el panel Club).';
  end if;

  v_opp := case when auth.uid() = v_m.player1_id then v_m.player2_id else v_m.player1_id end;

  insert into game_challenges (created_by, invited_id, variant, mode, creator_color,
    time_control_initial_seconds, time_control_increment_seconds, tournament_match_id)
  values (auth.uid(), v_opp, v_t.variant::text::game_variant,
    coalesce(v_t.mode::text, 'tiempo_real')::game_mode,
    case when v_m.white_id = auth.uid() then 'blancas' else 'negras' end,
    v_t.time_control_initial_seconds, v_t.time_control_increment_seconds, p_match_id)
  returning id into v_id;

  return v_id;
end;
$$;

-- 5) respond_challenge: igual que antes + retos de torneo ---------------------------
create or replace function public.respond_challenge(p_challenge_id uuid, p_accept boolean)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ch game_challenges%rowtype;
  v_white uuid;
  v_black uuid;
  v_fen text;
  v_game_id uuid;
  v_coin boolean;
  v_time_ms bigint;
  v_mstatus text;
begin
  select * into v_ch from game_challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Ese reto no existe.';
  end if;
  if v_ch.invited_id <> auth.uid() then
    raise exception 'Este reto no es tuyo.';
  end if;
  if v_ch.status <> 'pendiente' then
    raise exception 'Este reto ya fue respondido.';
  end if;

  -- V122: una partida de torneo no se rechaza (si no, el torneo se traba).
  if v_ch.tournament_match_id is not null then
    if not p_accept then
      raise exception 'Una partida de torneo no se puede rechazar: acéptala cuando puedas jugar, antes del plazo.';
    end if;
    select status into v_mstatus from tournament_matches
      where id = v_ch.tournament_match_id for update;
    if v_mstatus is distinct from 'pendiente' then
      raise exception 'Esta partida de torneo ya no está disponible.';
    end if;
  end if;

  if not p_accept then
    update game_challenges set status = 'rechazado', responded_at = now() where id = p_challenge_id;
    return null;
  end if;

  v_coin := random() < 0.5;
  if v_ch.creator_color = 'blancas' or (v_ch.creator_color = 'aleatorio' and v_coin) then
    v_white := v_ch.created_by; v_black := v_ch.invited_id;
  else
    v_white := v_ch.invited_id; v_black := v_ch.created_by;
  end if;

  v_fen := case v_ch.variant
    when 'clasico' then 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    when 'capablanca' then 'rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1'
    when 'maharaja' then 'rnbqkbnr/pppppppp/8/8/8/8/8/4M3 w kq - 0 1'
    when 'amazonas' then 'rnbmkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBMKBNR w KQkq - 0 1'
  end;

  v_time_ms := case when v_ch.time_control_initial_seconds is null then null
                     else v_ch.time_control_initial_seconds::bigint * 1000 end;

  insert into games (variant, mode, status, white_id, black_id, current_fen, ply_count,
    time_control_initial_seconds, time_control_increment_seconds,
    white_time_left_ms, black_time_left_ms, turn_started_at, created_at, updated_at,
    tournament_match_id)
  values (v_ch.variant, v_ch.mode, 'en_curso', v_white, v_black, v_fen, 0,
    v_ch.time_control_initial_seconds, v_ch.time_control_increment_seconds,
    v_time_ms, v_time_ms, now(), now(), now(),
    v_ch.tournament_match_id)
  returning id into v_game_id;

  update game_challenges set status = 'aceptado', responded_at = now(), game_id = v_game_id where id = p_challenge_id;

  if v_ch.tournament_match_id is not null then
    update tournament_matches
       set status = 'en_juego', game_id = v_game_id
     where id = v_ch.tournament_match_id;
  end if;

  return v_game_id;
end;
$function$;

-- 6) Resultado automático + cierre del torneo ---------------------------------------
create or replace function finish_tournament_if_done(p_t uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if exists (select 1 from tournament_matches where tournament_id = p_t)
     and not exists (select 1 from tournament_matches
                      where tournament_id = p_t and status in ('pendiente','en_juego')) then
    update tournaments set status = 'finalizado' where id = p_t and status = 'en_curso';
  end if;
end;
$$;

create or replace function sync_tournament_result()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_t uuid;
begin
  if new.tournament_match_id is null or new.result is null then return new; end if;
  if new.result not in ('1-0', '0-1', '1/2-1/2') then return new; end if;
  if tg_op = 'UPDATE' and old.result is not distinct from new.result then return new; end if;

  update tournament_matches
     set status = 'jugada', result = new.result, winner_id = new.winner_id, game_id = new.id
   where id = new.tournament_match_id and status in ('en_juego', 'pendiente')
  returning tournament_id into v_t;

  if v_t is not null then perform finish_tournament_if_done(v_t); end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_tournament_result on games;
create trigger trg_sync_tournament_result
  after insert or update of result on games
  for each row execute function sync_tournament_result();

-- 7) Derrota por ausencia (solo el creador) -----------------------------------------
--    p_winner_id = uno de los dos jugadores, o null si ninguno se presentó
--    (0 puntos para ambos).
create or replace function forfeit_match(p_match_id uuid, p_winner_id uuid default null)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_m tournament_matches%rowtype;
  v_t tournaments%rowtype;
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  select * into v_m from tournament_matches where id = p_match_id for update;
  if not found then raise exception 'Esa partida no existe.'; end if;
  select * into v_t from tournaments where id = v_m.tournament_id;
  if v_t.created_by is distinct from auth.uid() then
    raise exception 'Solo quien creó el torneo puede dar una partida por ausencia.';
  end if;
  if v_t.status <> 'en_curso' then raise exception 'El torneo no está en curso.'; end if;
  if v_m.status <> 'pendiente' then
    raise exception 'Solo se puede dar por ausencia una partida pendiente (sin partida en juego).';
  end if;
  if p_winner_id is not null and p_winner_id not in (v_m.player1_id, v_m.player2_id) then
    raise exception 'Ese jugador no está en esta partida.';
  end if;

  update tournament_matches
     set status = 'ausencia',
         winner_id = p_winner_id,
         result = case when p_winner_id is null then null
                       when p_winner_id = white_id then '1-0' else '0-1' end
   where id = p_match_id;

  -- Cierra cualquier reto pendiente de esa partida.
  update game_challenges set status = 'rechazado', responded_at = now()
   where tournament_match_id = p_match_id and status = 'pendiente';

  perform finish_tournament_if_done(v_m.tournament_id);
end;
$$;
