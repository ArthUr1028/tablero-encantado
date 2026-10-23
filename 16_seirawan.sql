-- 16 · Seirawan en línea (2.101)
-- Hecho en DOS pasos, cada uno en su propia ejecución del editor SQL (Postgres no deja usar un valor
-- de enum recién agregado dentro de la misma transacción).

-- ============================== PASO 1 · solo esto, ejecútalo primero ==============================
alter type public.game_variant add value if not exists 'seirawan';

-- ============================== PASO 2 · después, esto (en una ejecución aparte) ==============================
-- Idéntica a la función que está hoy en la base; lo ÚNICO que cambia es la línea marcada «-- NUEVO».
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
    when 'seirawan' then 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1'   -- NUEVO
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
