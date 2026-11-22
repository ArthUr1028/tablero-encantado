-- 32 · El cierre por mate/tablas ya no choca con el trigger sync_game_after_move (2.354)
--
-- Problema (22-nov-2026, partida Asara contra Fernando; afectaba a TODAS las partidas sin reloj desde el 24-oct):
--   El trigger trg_sync_game_after_move (AFTER INSERT en game_moves, vive solo en la base) adelanta games.ply_count y current_fen
--   en las partidas sin reloj en cuanto se inserta la jugada. Cuando el cliente manda después el cierre (status 'finalizada' con
--   ply_count = el de su jugada), el candado de 20_resultado.sql exigía ply_count = anterior + 1, pero el anterior YA era ese
--   valor: rechazaba el mate del que acababa de mover. La partida se quedaba «en_curso» y solo se cerraba si alguien se rendía.
--
-- Arreglo: además de la vía C original (ply_count sube en 1, en SU turno), se acepta la vía C2: la fila ya trae mi jugada
--   (ply_count igual al anterior), esa jugada la hice YO (existe en game_moves con made_by = yo, y la paridad de ply_count lo confirma)
--   y el cierre es mi victoria o tablas. Es más estricto que C: exige que la jugada conste en game_moves a mi nombre.
-- Todo lo demás de guard_resultado queda idéntico a 20_resultado.sql. Se ejecuta de una sola vez; no toca datos.

create or replace function public.guard_resultado() returns trigger
 language plpgsql set search_path to 'public' as $$
declare
  u uuid := auth.uid();
  v_color text;
  v_mueve text;
  v_sync boolean;
begin
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

  -- C) Cerrar la partida con SU jugada (la fila aún no la traía: ply_count sube en 1 en su turno)
  -- C2) Lo mismo cuando trg_sync_game_after_move ya adelantó la fila: ply_count igual, y la última jugada es mía y consta en game_moves
  v_mueve := case when coalesce(old.ply_count, 0) % 2 = 0 then 'w' else 'b' end;
  v_sync := coalesce(old.ply_count, 0) > 0
        and new.ply_count is not distinct from old.ply_count
        and (case when old.ply_count % 2 = 1 then 'w' else 'b' end) = v_color
        and exists (select 1 from public.game_moves m where m.game_id = old.id and m.ply = old.ply_count and m.made_by = u);
  if new.status = 'finalizada'
     and ((new.ply_count = coalesce(old.ply_count, 0) + 1 and v_mueve = v_color) or v_sync) then
    if new.result = '1/2-1/2' and new.winner_id is null then return new; end if;
    if new.result = (case when v_color = 'w' then '1-0' else '0-1' end) and new.winner_id is not distinct from u then
      return new;
    end if;
  end if;

  raise exception 'No puedes declarar ese resultado: solo se puede terminar la partida con tu propia jugada, rindiéndote o aceptando unas tablas.';
end $$;
-- el trigger guard_resultado ya existe y apunta a esta función: no hay que recrearlo.
