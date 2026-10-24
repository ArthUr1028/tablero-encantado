-- 19 · Dark Chess: pausa y reanudación (2.108)
-- Se ejecuta DESPUÉS de 18_dark.sql (pasos 1 y 2), en una sola ejecución del editor SQL.
--
-- Por qué hace falta (diagnóstico del 2026-10-24, leyendo las funciones reales de la base):
--  1) pause_game y resume_game cambian los relojes (white/black_time_left_ms, turn_started_at). En una partida oscura
--     esas columnas las bloquea el candado dark_guard_games de 18_dark.sql, así que la pausa fallaba con
--     «En Dark Chess la posición y los relojes los lleva el servidor.»
--  2) pause_game decide de quién es el turno leyendo el FEN de games.current_fen. En Dark ese FEN NO se actualiza
--     (la posición verdadera es secreta y vive en dark_private), se queda en la posición inicial con turno de blancas:
--     las negras no podrían pausar nunca y las blancas podrían pausar en el turno de las negras.
--  3) dark_commit_move no miraba paused_by: quien pausó en su turno podía mover llamando directo a la función, con su
--     reloj detenido, y ganar tiempo para pensar sin gastar reloj.
--
-- Qué cambia (las líneas nuevas están marcadas con «-- NUEVO»; en partidas NO oscuras el comportamiento es idéntico):
--  · pause_game: en Dark el turno sale de la paridad de ply_count; levanta la bandera «tablero.dark_writer» solo para esa transacción.
--  · resume_game: levanta esa misma bandera al reanudar una partida oscura.
--  · claim_pause_abandon: SIN cambios (solo toca status/result/winner_id, que el candado no bloquea). Se versiona aquí
--    porque las tres funciones solo existían en la base (las columnas paused_by, paused_at, white/black_pauses_used
--    vienen de 12_pausa.sql, que no está en el repositorio).
--  · dark_commit_move: rechaza jugadas mientras la partida esté en pausa.

-- 1) pause_game ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pause_game(p_game_id uuid)
 RETURNS games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid        uuid := auth.uid();
  g            public.games%rowtype;
  v_color      text;
  v_turn       text;
  v_elapsed_ms bigint;
  v_left       bigint;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'Partida no encontrada';
  end if;

  if v_uid = g.white_id then
    v_color := 'w';
  elsif v_uid = g.black_id then
    v_color := 'b';
  else
    raise exception 'No eres jugador de esta partida';
  end if;

  if g.status <> 'en_curso' or g.result is not null then
    raise exception 'La partida ya terminó';
  end if;
  if g.time_control_initial_seconds is null then
    raise exception 'La pausa solo existe en partidas con reloj';
  end if;
  if g.paused_by is not null then
    raise exception 'La partida ya está en pausa';
  end if;

  -- De quién es el turno: segundo campo del FEN; si aún no hay FEN, por paridad.
  -- NUEVO: en Dark el FEN público no avanza, el turno sale siempre de la paridad de ply_count.
  v_turn := case
    when g.variant = 'dark' then
      case when coalesce(g.ply_count, 0) % 2 = 0 then 'w' else 'b' end
    else
      coalesce(
        nullif(split_part(coalesce(g.current_fen, ''), ' ', 2), ''),
        case when coalesce(g.ply_count, 0) % 2 = 0 then 'w' else 'b' end
      )
  end;
  if v_turn <> v_color then
    raise exception 'Solo puedes pausar en tu turno';
  end if;

  if (v_color = 'w' and g.white_pauses_used >= 1)
     or (v_color = 'b' and g.black_pauses_used >= 1) then
    raise exception 'Ya usaste tu pausa de esta partida';
  end if;

  -- Tiempo que te queda justo ahora (mismo cálculo que el reloj en vivo).
  if g.turn_started_at is null then
    v_elapsed_ms := 0;
  else
    v_elapsed_ms := (extract(epoch from (now() - g.turn_started_at)) * 1000)::bigint;
  end if;
  v_left := coalesce(case when v_color = 'w' then g.white_time_left_ms else g.black_time_left_ms end, 0)
            - greatest(v_elapsed_ms, 0);
  if v_left <= 0 then
    raise exception 'Tu tiempo ya se agotó';
  end if;

  if g.variant = 'dark' then   -- NUEVO: permite tocar los relojes de una partida oscura (solo esta transacción)
    perform set_config('tablero.dark_writer', '1', true);
  end if;

  update public.games set
    paused_by          = v_uid,
    paused_at          = now(),
    white_time_left_ms = case when v_color = 'w' then v_left else white_time_left_ms end,
    black_time_left_ms = case when v_color = 'b' then v_left else black_time_left_ms end,
    white_pauses_used  = white_pauses_used + (case when v_color = 'w' then 1 else 0 end),
    black_pauses_used  = black_pauses_used + (case when v_color = 'b' then 1 else 0 end),
    turn_started_at    = now() + interval '1 day'
  where id = g.id
  returning * into g;

  return g;
end;
$function$;

-- 2) resume_game --------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resume_game(p_game_id uuid)
 RETURNS games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid       uuid := auth.uid();
  g           public.games%rowtype;
  v_paused_ms bigint;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'Partida no encontrada';
  end if;
  if v_uid <> g.white_id and v_uid <> g.black_id then
    raise exception 'No eres jugador de esta partida';
  end if;

  if g.status <> 'en_curso' or g.result is not null or g.paused_by is null then
    return g;
  end if;
  if g.paused_by <> v_uid then
    raise exception 'Solo quien pausó puede reanudar';
  end if;

  v_paused_ms := (extract(epoch from (now() - g.paused_at)) * 1000)::bigint;

  if v_paused_ms > 5 * 60 * 1000 + 5000 then
    -- Tarde: abandono por pausa. paused_by se conserva a propósito: así el
    -- cliente distingue esto de una bandera caída.
    update public.games set
      status    = 'finalizada',
      result    = case when v_uid = g.white_id then '0-1' else '1-0' end,
      winner_id = case when v_uid = g.white_id then g.black_id else g.white_id end
    where id = g.id
    returning * into g;
    return g;
  end if;

  if g.variant = 'dark' then   -- NUEVO: permite reiniciar el reloj de una partida oscura (solo esta transacción)
    perform set_config('tablero.dark_writer', '1', true);
  end if;

  update public.games set
    paused_by       = null,
    paused_at       = null,
    turn_started_at = now()
  where id = g.id
  returning * into g;

  return g;
end;
$function$;

-- 3) claim_pause_abandon (SIN cambios; versionada) ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_pause_abandon(p_game_id uuid)
 RETURNS games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid    uuid := auth.uid();
  g        public.games%rowtype;
  v_winner uuid;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;

  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'Partida no encontrada';
  end if;
  if v_uid <> g.white_id and v_uid <> g.black_id then
    raise exception 'No eres jugador de esta partida';
  end if;

  if g.status <> 'en_curso' or g.result is not null or g.paused_by is null then
    return g;
  end if;

  if now() - g.paused_at < interval '5 minutes' then
    raise exception 'Todavía no se agota la pausa';
  end if;

  v_winner := case when g.paused_by = g.white_id then g.black_id else g.white_id end;

  update public.games set
    status    = 'finalizada',
    result    = case when v_winner = g.white_id then '1-0' else '0-1' end,
    winner_id = v_winner
  where id = g.id
  returning * into g;

  return g;
end;
$function$;

-- 4) dark_commit_move: idéntica a la de 18_dark.sql; cambia solo la línea «-- NUEVO» ------------------------------------
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
  if g.paused_by is not null then raise exception 'La partida está en pausa: reanúdala para mover.'; end if;   -- NUEVO
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
revoke all on function public.dark_commit_move(uuid, uuid, integer, text, jsonb, jsonb, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.dark_commit_move(uuid, uuid, integer, text, jsonb, jsonb, jsonb, text, uuid) to service_role;
