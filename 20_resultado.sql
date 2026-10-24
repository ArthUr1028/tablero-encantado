-- 20 · Candado del resultado de las partidas, para TODAS las variantes (2.108)
-- Se ejecuta DESPUÉS de 18_dark.sql y 19_dark_pausa.sql, en una sola ejecución del editor SQL.
--
-- Problema: la política de actualización de «games» deja a cada jugador cambiar cualquier columna de su partida, así que
-- desde la consola del navegador se podía escribir result/winner_id/status y declararse vencedor «porque sí», reabrir una
-- partida perdida, inventar unas tablas que el rival no ofreció, o rendir al rival.
--
-- Qué hace: un trigger BEFORE UPDATE que mira SOLO lo que escribe un jugador desde el cliente (rol «authenticated»).
-- Las funciones del servidor (claim_timeout, claim_pause_abandon, claim_async_forfeit, forfeit_match, dark_commit_move…)
-- son SECURITY DEFINER: dentro de ellas current_user es el dueño, no «authenticated», así que NO se ven afectadas.
-- Esta función es SECURITY INVOKER a propósito; si la volvieras definer, el candado dejaría de distinguir.
--
-- Lo que un jugador SÍ puede escribir (exactamente lo que hace el cliente hoy):
--   A) Rendirse: status 'abandonada' con el resultado en CONTRA suyo (blancas → 0-1, negras → 1-0) y el rival como ganador.
--   B) Aceptar tablas: 'finalizada', '1/2-1/2', sin ganador, y SOLO si el rival tenía una oferta pendiente.
--   C) Su propia jugada: ply_count sube en 1, es SU turno (paridad de ply_count) y cierra la partida con un resultado que no
--      le perjudica: su victoria (1-0 blancas / 0-1 negras, él como ganador) o tablas (sin ganador).
--   D) Ofrecer tablas (draw_offered_by = él) o retirar la oferta (nulo). Nunca poner la oferta a nombre del rival.
-- Todo lo demás que toque status/result/winner_id se rechaza, y una partida terminada ya no puede cambiar su resultado.
--
-- LÍMITE CONOCIDO (honesto): en la jugada (C) el servidor no puede comprobar que de verdad hay mate o tablas, porque las
-- reglas del ajedrez viven en el cliente. Un tramposo todavía podría reclamar un mate falso en SU turno, junto con una jugada.
-- En Dark Chess eso no existe: el árbitro del servidor decide el resultado y el candado de 18_dark.sql impide tocar ply_count.
-- Cerrarlo del todo en las demás variantes exige extender el árbitro (dark-referee) a todas ellas.

create or replace function public.guard_resultado() returns trigger
 language plpgsql set search_path to 'public' as $$
declare
  u uuid := auth.uid();
  v_color text;
  v_mueve text;
begin
  -- Solo vigilamos escrituras directas de jugadores; el servidor (definer), postgres y service_role pasan.
  if current_user not in ('authenticated', 'anon') then return new; end if;

  -- D) La oferta de tablas solo puede quedar a nombre propio o en nulo.
  if new.draw_offered_by is distinct from old.draw_offered_by
     and new.draw_offered_by is not null and new.draw_offered_by is distinct from u then
    raise exception 'No puedes ofrecer tablas en nombre de tu rival.';
  end if;

  -- Una partida terminada no cambia de estado ni de resultado.
  if old.status in ('finalizada', 'abandonada')
     and (new.status is distinct from old.status or new.result is distinct from old.result
          or new.winner_id is distinct from old.winner_id) then
    raise exception 'La partida ya terminó: el resultado no se puede cambiar.';
  end if;

  -- ¿Este UPDATE toca el final de la partida?
  if not (new.result is distinct from old.result
          or new.winner_id is distinct from old.winner_id
          or (new.status is distinct from old.status and new.status in ('finalizada', 'abandonada'))) then
    return new;
  end if;

  if u is not distinct from old.white_id then v_color := 'w';
  elsif u is not distinct from old.black_id then v_color := 'b';
  else raise exception 'No eres jugador de esta partida.';
  end if;

  -- A) Rendirse
  if new.status = 'abandonada'
     and new.result = (case when v_color = 'w' then '0-1' else '1-0' end)
     and new.winner_id is not distinct from (case when v_color = 'w' then old.black_id else old.white_id end) then
    return new;
  end if;

  -- B) Aceptar unas tablas que ofreció el rival
  if new.status = 'finalizada' and new.result = '1/2-1/2' and new.winner_id is null
     and old.draw_offered_by is not null and old.draw_offered_by is distinct from u then
    return new;
  end if;

  -- C) Cerrar la partida con SU jugada
  v_mueve := case when coalesce(old.ply_count, 0) % 2 = 0 then 'w' else 'b' end;
  if new.status = 'finalizada' and new.ply_count = coalesce(old.ply_count, 0) + 1 and v_mueve = v_color then
    if new.result = '1/2-1/2' and new.winner_id is null then return new; end if;
    if new.result = (case when v_color = 'w' then '1-0' else '0-1' end) and new.winner_id is not distinct from u then
      return new;
    end if;
  end if;

  raise exception 'No puedes declarar ese resultado: solo se puede terminar la partida con tu propia jugada, rindiéndote o aceptando unas tablas.';
end $$;

drop trigger if exists guard_resultado on public.games;
create trigger guard_resultado before update on public.games for each row execute function public.guard_resultado();
