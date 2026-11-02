-- Pruebas de 26_dark_asincrona.sql. Orden de carga (ver correr.sh): dark_stub, 18, 19, 20, async_originales, 26, este archivo.
\set ON_ERROR_STOP 0
\set W '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
grant execute on all functions in schema public to authenticated;

\echo '--- 1. reto asíncrono Dark de blancas→negras, aceptado por las negras (OK: partida dark, async_days=3, dark_private creado)'
insert into game_challenges (id, created_by, invited_id, variant, mode, creator_color, async_days)
values ('00000000-0000-0000-0000-0000000000a1', :W, :B, 'dark', 'asincrona', 'blancas', 3);
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select respond_async_challenge('00000000-0000-0000-0000-0000000000a1', true) is not null as partida_creada;
reset role;
select variant::text, async_days, time_control_initial_seconds is null as sin_reloj, ply_count,
       exists(select 1 from dark_private p where p.game_id = g.id) as con_dark_private
from games g where g.variant::text = 'dark' and g.async_days = 3;

-- Partida oscura asíncrona de prueba con plazo, vencido o no según el caso.
insert into games (id, variant, mode, status, white_id, black_id, current_fen, ply_count, async_days, turn_started_at)
values ('00000000-0000-0000-0000-0000000000b1','dark','asincrona','en_curso',:W,:B,'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 dark',1,2, now() - interval '3 days');
insert into dark_private (game_id, fen) values ('00000000-0000-0000-0000-0000000000b1','START dark');

\echo '--- 2. turno de NEGRAS (ply 1), plazo vencido; las negras intentan reclamar su propio plazo (FALLA: Es tu turno)'
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select status from claim_async_forfeit('00000000-0000-0000-0000-0000000000b1');
\echo '--- 3. las blancas reclaman (OK: finalizada, 1-0, gana blancas; con la función vieja fallaba porque el FEN dice «w»)'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select status::text, result, winner_id = '11111111-1111-1111-1111-111111111111' as gana_blancas from claim_async_forfeit('00000000-0000-0000-0000-0000000000b1');
\echo '--- 4. tras el reclamo las blancas pueden revelar la partida (OK)'
select jsonb_array_length(dark_reveal('00000000-0000-0000-0000-0000000000b1')->'moves') as jugadas;
reset role;

\echo '--- 5. plazo aún vigente: reclamar es imposible (FALLA: Todavía no vence el plazo)'
insert into games (id, variant, mode, status, white_id, black_id, current_fen, ply_count, async_days, turn_started_at)
values ('00000000-0000-0000-0000-0000000000b2','dark','asincrona','en_curso',:W,:B,'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 dark',1,2, now() - interval '1 day');
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select status from claim_async_forfeit('00000000-0000-0000-0000-0000000000b2');
reset role;

\echo '--- 6. turno de BLANCAS (ply 2), plazo vencido: las blancas no pueden reclamar (FALLA) y las negras sí (OK)'
insert into games (id, variant, mode, status, white_id, black_id, current_fen, ply_count, async_days, turn_started_at)
values ('00000000-0000-0000-0000-0000000000b3','dark','asincrona','en_curso',:W,:B,'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 dark',2,1, now() - interval '2 days');
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select status from claim_async_forfeit('00000000-0000-0000-0000-0000000000b3');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select status::text, result from claim_async_forfeit('00000000-0000-0000-0000-0000000000b3');
reset role;

\echo '--- 7. el candado sigue en pie: un jugador NO puede reescribir turn_started_at de una partida oscura desde el cliente (FALLA)'
insert into games (id, variant, mode, status, white_id, black_id, current_fen, ply_count, async_days, turn_started_at)
values ('00000000-0000-0000-0000-0000000000b4','dark','asincrona','en_curso',:W,:B,'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 dark',0,5, now());
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update games set turn_started_at = now() + interval '10 days' where id = '00000000-0000-0000-0000-0000000000b4';
reset role;
\echo '--- 7b. y la bandera quedó abajo tras aceptar un reto: no hay bandera residual (esperado: vacío)'
select coalesce(current_setting('tablero.dark_writer', true), '') as bandera;

\echo '--- 8. una asíncrona CLÁSICA se acepta igual que siempre (OK: async_days=2, sin dark_private)'
insert into game_challenges (id, created_by, invited_id, variant, mode, creator_color, async_days)
values ('00000000-0000-0000-0000-0000000000a2', :W, :B, 'clasico', 'asincrona', 'blancas', 2);
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select respond_async_challenge('00000000-0000-0000-0000-0000000000a2', true) is not null as partida_creada;
reset role;
select variant::text, async_days, exists(select 1 from dark_private p where p.game_id = g.id) as con_dark_private from games g where g.variant::text = 'clasico' and g.async_days = 2;
