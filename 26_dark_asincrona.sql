-- 26 · Dark Chess en partidas asíncronas (2.194)
-- Se ejecuta DESPUÉS de 18_dark.sql, 19_dark_pausa.sql y 20_resultado.sql, en una sola ejecución del editor SQL.
-- Sin cambios en tablas ni en dark-referee: el árbitro ya funciona sin reloj (time_control_initial_seconds nulo).
--
-- Diagnóstico (2026-11-01, leyendo las funciones reales de la base y probándolas contra un Postgres temporal):
--  · respond_async_challenge NO necesita cambios: acepta por respond_challenge (que desde 18_dark.sql ya crea la partida oscura y su
--    dark_private) y su UPDATE posterior (async_days, turn_started_at = now()) corre en la MISMA transacción, donde now() es idéntico al
--    valor recién insertado, así que el candado dark_guard_games no lo ve como un cambio. send_async_challenge tampoco: envía por
--    send_challenge, que ya acepta 'dark'.
--  · claim_async_forfeit SÍ falla en Dark: decide de quién es el turno con el segundo campo de games.current_fen, y en Dark ese FEN no
--    avanza (la posición verdadera es secreta): siempre dice «w». Las negras podrían reclamar el plazo en SU turno y las blancas no
--    podrían reclamarlo cuando el que tarda es el rival. En Dark el turno sale de la paridad de ply_count.
-- Solo cambia esa función; la línea nueva lleva «-- NUEVO». En partidas que NO son oscuras el comportamiento es idéntico al de hoy.

-- 1) claim_async_forfeit ------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_async_forfeit(p_game_id uuid)
 RETURNS games
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid     uuid := auth.uid();
  g         public.games%rowtype;
  v_color   text;
  v_turn    text;
  v_started timestamptz;
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

  -- Ya terminada (por ejemplo la reclamó el otro cliente antes): se devuelve tal cual.
  if g.status <> 'en_curso' or g.result is not null then
    return g;
  end if;
  if g.async_days is null then
    raise exception 'Esta partida no tiene plazo por jugada';
  end if;

  -- NUEVO: en Dark el FEN público no avanza; el turno sale siempre de la paridad de ply_count.
  v_turn := case
    when g.variant::text = 'dark' then
      case when coalesce(g.ply_count, 0) % 2 = 0 then 'w' else 'b' end
    else
      coalesce(
        nullif(split_part(coalesce(g.current_fen, ''), ' ', 2), ''),
        case when coalesce(g.ply_count, 0) % 2 = 0 then 'w' else 'b' end
      )
  end;
  if v_turn = v_color then
    raise exception 'Es tu turno: no puedes reclamar el plazo del rival';
  end if;

  v_started := coalesce(g.turn_started_at, g.created_at);
  if now() < v_started + make_interval(days => g.async_days) then
    raise exception 'Todavía no vence el plazo';
  end if;

  update public.games set
    status    = 'finalizada',
    result    = case when v_color = 'w' then '1-0' else '0-1' end,
    winner_id = v_uid
  where id = g.id
  returning * into g;

  return g;
end;
$function$;
