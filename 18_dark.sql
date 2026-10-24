-- 18 · Dark Chess en línea, servidor filtrado (2.108)
-- Se ejecuta en DOS pasos, cada uno en su propia ejecución del editor SQL (Postgres no deja usar un valor
-- de enum recién agregado dentro de la misma transacción).
--
-- Idea: la posición VERDADERA vive en una tabla privada que ningún cliente puede leer. Cada jugador solo recibe
-- «observaciones» (lo que su niebla le deja ver). La única vía de escritura es dark_commit_move(), que solo
-- puede llamar la Edge Function «dark-referee» (rol service_role).

-- ============================== PASO 1 · solo esto, ejecútalo primero ==============================
alter type public.game_variant add value if not exists 'dark';

-- ============================== PASO 2 · después, TODO lo demás (en una ejecución aparte) ==============================

-- 1) Estado verdadero (privado). RLS activada y SIN políticas: nadie con sesión de usuario lo lee.
create table if not exists public.dark_private (
  game_id uuid primary key references public.games(id) on delete cascade,
  fen     text  not null,
  moves   jsonb not null default '[]'::jsonb   -- jugadas reales: [{ply, uci, san, by}] (se revelan al terminar)
);
alter table public.dark_private enable row level security;
revoke all on public.dark_private from anon, authenticated;

-- 2) Observaciones por jugador. Cada quien lee SOLO las suyas (sin subconsultas: política simple).
create table if not exists public.dark_obs (
  game_id    uuid    not null references public.games(id) on delete cascade,
  ply        integer not null,
  viewer     uuid    not null,
  obs        jsonb   not null,
  created_at timestamptz not null default now(),
  primary key (game_id, ply, viewer)
);
alter table public.dark_obs enable row level security;
revoke all on public.dark_obs from anon, authenticated;
grant select on public.dark_obs to authenticated;
drop policy if exists "ver mis observaciones" on public.dark_obs;
create policy "ver mis observaciones" on public.dark_obs for select using (viewer = auth.uid());
do $$ begin
  alter publication supabase_realtime add table public.dark_obs;
exception when duplicate_object then null; end $$;

-- 3) Candados en las tablas existentes: en partidas oscuras los clientes no escriben la posición.
--    Solo pasa lo que viene de dark_commit_move() (que levanta la bandera «tablero.dark_writer» dentro de su transacción).
create or replace function public.dark_guard_games() returns trigger
 language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(current_setting('tablero.dark_writer', true), '') = '1' then return new; end if;
  if new.variant = 'dark' and old.variant is distinct from 'dark' then
    raise exception 'No se puede convertir una partida en oscura.';
  end if;
  if old.variant = 'dark' and (
       new.variant is distinct from old.variant
    or new.current_fen is distinct from old.current_fen
    or new.ply_count is distinct from old.ply_count
    or new.white_time_left_ms is distinct from old.white_time_left_ms
    or new.black_time_left_ms is distinct from old.black_time_left_ms
    or new.turn_started_at is distinct from old.turn_started_at) then
    raise exception 'En Dark Chess la posición y los relojes los lleva el servidor.';
  end if;
  return new;
end $$;
drop trigger if exists dark_guard_games on public.games;
create trigger dark_guard_games before update on public.games for each row execute function public.dark_guard_games();

create or replace function public.dark_guard_moves() returns trigger
 language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(current_setting('tablero.dark_writer', true), '') = '1' then return new; end if;
  if exists (select 1 from games where id = new.game_id and variant = 'dark') then
    raise exception 'En Dark Chess las jugadas no se registran desde el cliente.';
  end if;
  return new;
end $$;
drop trigger if exists dark_guard_moves on public.game_moves;
create trigger dark_guard_moves before insert on public.game_moves for each row execute function public.dark_guard_moves();

-- 4) respond_challenge: idéntica a la que está hoy en la base (16_seirawan.sql); cambian las líneas «-- NUEVO».
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
    when 'seirawan' then 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1'
    when 'dark' then 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 dark'   -- NUEVO
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

  if v_ch.variant = 'dark' then   -- NUEVO: estado verdadero inicial (la posición de salida no es secreto)
    insert into dark_private (game_id, fen) values (v_game_id, v_fen);
  end if;

  update game_challenges set status = 'aceptado', responded_at = now(), game_id = v_game_id where id = p_challenge_id;

  if v_ch.tournament_match_id is not null then
    update tournament_matches
       set status = 'en_juego', game_id = v_game_id
     where id = v_ch.tournament_match_id;
  end if;

  return v_game_id;
end;
$function$;

-- 5) Lectura del estado privado para el árbitro y escritura atómica de una jugada.
--    Ambas SOLO para service_role (la Edge Function). Un usuario con sesión no puede ejecutarlas.
create or replace function public.dark_get_state(p_game uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare g games%rowtype; p dark_private%rowtype;
begin
  select * into g from games where id = p_game;
  if not found or g.variant <> 'dark' then raise exception 'No es una partida oscura.'; end if;
  select * into p from dark_private where game_id = p_game;
  if not found then raise exception 'Partida oscura sin estado inicial.'; end if;
  return jsonb_build_object('fen', p.fen, 'moves', p.moves, 'ply', g.ply_count, 'status', g.status,
    'white_id', g.white_id, 'black_id', g.black_id);
end $$;

-- p_move: {ply, uci, san, by}.  p_obs_w / p_obs_b: observaciones de cada bando.
-- p_result/p_winner: nulos si la partida sigue. Devuelve {ok:true} | {timeout:true}.
create or replace function public.dark_commit_move(
  p_game uuid, p_mover uuid, p_expected_ply integer, p_new_fen text, p_move jsonb,
  p_obs_w jsonb, p_obs_b jsonb, p_result text, p_winner uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  g games%rowtype; v_white boolean; v_left bigint; v_elapsed bigint; v_inc bigint;
  v_wl bigint; v_bl bigint; v_status game_status := 'en_curso';
begin
  perform set_config('tablero.dark_writer', '1', true);   -- solo dura esta transacción
  select * into g from games where id = p_game for update;
  if not found or g.variant <> 'dark' then raise exception 'No es una partida oscura.'; end if;
  if g.status <> 'en_curso' then raise exception 'La partida ya terminó.'; end if;
  if coalesce(g.ply_count, 0) <> p_expected_ply then raise exception 'La partida cambió: recarga.'; end if;
  v_white := (p_expected_ply % 2 = 0);
  if p_mover is distinct from (case when v_white then g.white_id else g.black_id end) then
    raise exception 'No es tu turno.';
  end if;

  v_wl := g.white_time_left_ms; v_bl := g.black_time_left_ms;
  if g.time_control_initial_seconds is not null then
    v_elapsed := floor(extract(epoch from (now() - coalesce(g.turn_started_at, now()))) * 1000)::bigint;
    v_left := (case when v_white then v_wl else v_bl end) - v_elapsed;
    if v_left <= 0 then   -- se le acabó el tiempo al mover: pierde, la jugada no cuenta
      update games set status = 'finalizada', result = case when v_white then '0-1' else '1-0' end,
        winner_id = case when v_white then g.black_id else g.white_id end,
        white_time_left_ms = case when v_white then 0 else v_wl end,
        black_time_left_ms = case when v_white then v_bl else 0 end,
        draw_offered_by = null, updated_at = now() where id = p_game;
      return jsonb_build_object('timeout', true);
    end if;
    v_inc := coalesce(g.time_control_increment_seconds, 0)::bigint * 1000;
    if v_white then v_wl := v_left + v_inc; else v_bl := v_left + v_inc; end if;
  end if;

  update dark_private set fen = p_new_fen, moves = moves || jsonb_build_array(p_move) where game_id = p_game;
  insert into dark_obs (game_id, ply, viewer, obs) values
    (p_game, p_expected_ply + 1, g.white_id, p_obs_w),
    (p_game, p_expected_ply + 1, g.black_id, p_obs_b);

  if p_result is not null then v_status := 'finalizada'; end if;
  update games set ply_count = p_expected_ply + 1, turn_started_at = now(),
    white_time_left_ms = v_wl, black_time_left_ms = v_bl, draw_offered_by = null,
    status = v_status, result = p_result, winner_id = p_winner, updated_at = now()
  where id = p_game;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.dark_get_state(uuid) from public, anon, authenticated;
revoke all on function public.dark_commit_move(uuid, uuid, integer, text, jsonb, jsonb, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.dark_get_state(uuid) to service_role;
grant execute on function public.dark_commit_move(uuid, uuid, integer, text, jsonb, jsonb, jsonb, text, uuid) to service_role;

-- 6) Revelación al terminar: solo los dos jugadores y solo cuando la partida ya no está en curso.
create or replace function public.dark_reveal(p_game uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare g games%rowtype; p dark_private%rowtype;
begin
  select * into g from games where id = p_game;
  if not found or g.variant <> 'dark' then raise exception 'No es una partida oscura.'; end if;
  if auth.uid() is distinct from g.white_id and auth.uid() is distinct from g.black_id then
    raise exception 'Esta partida no es tuya.';
  end if;
  if g.status = 'en_curso' or g.status = 'esperando_rival' then
    raise exception 'La partida sigue en curso: aún no se puede revelar.';
  end if;
  select * into p from dark_private where game_id = p_game;
  return jsonb_build_object('fen', p.fen, 'moves', p.moves, 'result', g.result);
end $$;
revoke all on function public.dark_reveal(uuid) from public, anon;
grant execute on function public.dark_reveal(uuid) to authenticated;
