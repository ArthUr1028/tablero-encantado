-- Pruebas de 19_dark_pausa.sql. Orden de carga (ver tests/sql/correr.sh): dark_stub.sql, 18_dark.sql, 19_dark_pausa.sql, este archivo.
-- Cada caso dice qué se espera. «FALLA» = debe salir ERROR; «OK» = debe pasar.
\set ON_ERROR_STOP 0
\set W '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''

-- Partida oscura con reloj y FEN público tal como lo deja respond_challenge (turno de blancas para siempre).
insert into games (id, variant, mode, status, white_id, black_id, current_fen, ply_count, time_control_initial_seconds, time_control_increment_seconds, white_time_left_ms, black_time_left_ms, turn_started_at)
values ('00000000-0000-0000-0000-0000000000cc','dark','tiempo_real','en_curso',:W,:B,'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 dark',0,300,2,300000,300000,now());
insert into dark_private (game_id, fen) values ('00000000-0000-0000-0000-0000000000cc','START dark');
-- Partida clásica con reloj, turno de negras en el FEN (la lógica de siempre debe seguir igual).
insert into games (id, variant, mode, status, white_id, black_id, current_fen, ply_count, time_control_initial_seconds, white_time_left_ms, black_time_left_ms, turn_started_at)
values ('00000000-0000-0000-0000-0000000000dd','clasico','tiempo_real','en_curso',:W,:B,'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',1,300,300000,300000,now());
grant select, insert, update on games, game_moves to authenticated;

\echo '--- 1. negras intentan pausar en turno de blancas (FALLA: Solo puedes pausar en tu turno)'
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select paused_by from pause_game('00000000-0000-0000-0000-0000000000cc');
\echo '--- 2. blancas pausan en su turno (OK: paused_by = blancas, turn_started_at en el futuro)'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select paused_by = '11111111-1111-1111-1111-111111111111' as pausa_de_blancas, turn_started_at > now() as reloj_detenido, white_pauses_used from pause_game('00000000-0000-0000-0000-0000000000cc');
\echo '--- 3. jugada con la partida en pausa (FALLA: La partida está en pausa)'
reset role; set role service_role;
select dark_commit_move('00000000-0000-0000-0000-0000000000cc','11111111-1111-1111-1111-111111111111',0,'FEN1','{"ply":1,"uci":"e2e4","san":"e4"}','{"v":"w1"}','{"v":"b1"}',null,null);
\echo '--- 3b. el estado no cambió (esperado: ply_count 0, dark_private sin jugadas)'
reset role;
select ply_count, (select jsonb_array_length(moves) from dark_private where game_id='00000000-0000-0000-0000-0000000000cc') as jugadas from games where id='00000000-0000-0000-0000-0000000000cc';
\echo '--- 4. el cliente edita el reloj durante la pausa (FALLA: los lleva el servidor)'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update games set white_time_left_ms = 999999, turn_started_at = now() where id='00000000-0000-0000-0000-0000000000cc';
\echo '--- 5. negras intentan reanudar (FALLA: Solo quien pausó puede reanudar)'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select paused_by from resume_game('00000000-0000-0000-0000-0000000000cc');
\echo '--- 6. blancas reanudan (OK: paused_by nulo, turn_started_at <= now)'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select paused_by is null as reanudada, turn_started_at <= now() as reloj_corre from resume_game('00000000-0000-0000-0000-0000000000cc');
\echo '--- 7. segunda pausa de blancas (FALLA: Ya usaste tu pausa)'
select paused_by from pause_game('00000000-0000-0000-0000-0000000000cc');
\echo '--- 8. blancas mueven tras reanudar (OK)'
reset role; set role service_role;
select dark_commit_move('00000000-0000-0000-0000-0000000000cc','11111111-1111-1111-1111-111111111111',0,'FEN1','{"ply":1,"uci":"e2e4","san":"e4"}','{"v":"w1"}','{"v":"b1"}',null,null);
reset role;
set role authenticated; \echo '--- 9. es turno de negras: blancas intentan pausar (FALLA: Solo puedes pausar en tu turno)'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select paused_by from pause_game('00000000-0000-0000-0000-0000000000cc');
\echo '--- 10. el FEN público sigue diciendo «w» pero es turno de negras: negras pausan (OK; con la función vieja fallaba)'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select paused_by = '22222222-2222-2222-2222-222222222222' as pausa_de_negras, black_pauses_used from pause_game('00000000-0000-0000-0000-0000000000cc');
\echo '--- 11. negras reanudan (OK)'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select paused_by is null as reanudada from resume_game('00000000-0000-0000-0000-0000000000cc');
reset role;

\echo '--- 12. abandono por pausa agotada: negras pausaron hace 6 min; blancas reclaman (OK: finalizada, gana blancas, 1-0)'
select set_config('tablero.dark_writer','1',false);
update games set paused_by='22222222-2222-2222-2222-222222222222', paused_at=now()-interval '6 minutes', turn_started_at=now()+interval '1 day' where id='00000000-0000-0000-0000-0000000000cc';
select set_config('tablero.dark_writer','',false);
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select status, result, winner_id = '11111111-1111-1111-1111-111111111111' as gana_blancas from claim_pause_abandon('00000000-0000-0000-0000-0000000000cc');
\echo '--- 13. tras el abandono, blancas pueden revelar la partida (OK: 1 jugada)'
select jsonb_array_length(dark_reveal('00000000-0000-0000-0000-0000000000cc')->'moves') as jugadas;
reset role;

\echo '--- 14. reclamo antes de tiempo (FALLA: Todavía no se agota la pausa)'
select set_config('tablero.dark_writer','1',false);
update games set status='en_curso', result=null, winner_id=null, paused_by='22222222-2222-2222-2222-222222222222', paused_at=now()-interval '1 minute' where id='00000000-0000-0000-0000-0000000000cc';
select set_config('tablero.dark_writer','',false);
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select status from claim_pause_abandon('00000000-0000-0000-0000-0000000000cc');
reset role;

\echo '--- 15. reanudar tarde (OK: pierde quien pausó): negras pausaron hace 6 min y reanudan'
select set_config('tablero.dark_writer','1',false);
update games set paused_at=now()-interval '6 minutes' where id='00000000-0000-0000-0000-0000000000cc';
select set_config('tablero.dark_writer','',false);
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select status, result, winner_id = '11111111-1111-1111-1111-111111111111' as gana_blancas from resume_game('00000000-0000-0000-0000-0000000000cc');
reset role;

\echo '--- 16. CLÁSICA sin cambios: negras pausan según el FEN (OK) y blancas no pueden pausar en su contra (FALLA)'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select paused_by from pause_game('00000000-0000-0000-0000-0000000000dd');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select paused_by = '22222222-2222-2222-2222-222222222222' as pausa_de_negras from pause_game('00000000-0000-0000-0000-0000000000dd');
\echo '--- 17. CLÁSICA: reanudar funciona (OK)'
select paused_by is null as reanudada from resume_game('00000000-0000-0000-0000-0000000000dd');
reset role;
\echo '--- 18. la bandera NO queda puesta tras una pausa (esperado: vacío, un cliente no hereda el permiso)'
select coalesce(current_setting('tablero.dark_writer', true), '') as bandera;
