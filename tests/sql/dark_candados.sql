\set ON_ERROR_STOP 0
insert into games (id, variant, mode, status, white_id, black_id, current_fen, ply_count, time_control_initial_seconds, time_control_increment_seconds, white_time_left_ms, black_time_left_ms, turn_started_at)
values ('00000000-0000-0000-0000-0000000000aa','dark','tiempo_real','en_curso','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','START dark',0,300,2,300000,300000,now());
insert into dark_private (game_id, fen) values ('00000000-0000-0000-0000-0000000000aa','START dark');
insert into games (id, variant, status, white_id, black_id, current_fen, ply_count) values ('00000000-0000-0000-0000-0000000000bb','clasico','en_curso','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','x',0);
grant select, insert, update on games, game_moves to authenticated;

\echo '--- 1. servicio: jugada blanca ok'
set role service_role;
select dark_commit_move('00000000-0000-0000-0000-0000000000aa','11111111-1111-1111-1111-111111111111',0,'FEN1','{"ply":1,"uci":"e2e4","san":"e4"}','{"v":"w1"}','{"v":"b1"}',null,null);
\echo '--- 2. servicio: mismo ply otra vez (debe fallar)'
select dark_commit_move('00000000-0000-0000-0000-0000000000aa','11111111-1111-1111-1111-111111111111',0,'FEN1','{}','{}','{}',null,null);
\echo '--- 3. servicio: blancas mueven en turno de negras (debe fallar)'
select dark_commit_move('00000000-0000-0000-0000-0000000000aa','11111111-1111-1111-1111-111111111111',1,'FEN2','{}','{}','{}',null,null);
\echo '--- 4. servicio: negras mueven y termina con victoria'
select dark_commit_move('00000000-0000-0000-0000-0000000000aa','22222222-2222-2222-2222-222222222222',1,'FEN2','{"ply":2,"uci":"e7e5","san":"e5"}','{"v":"w2"}','{"v":"b2"}','0-1','22222222-2222-2222-2222-222222222222');
reset role;
select ply_count, status, result, white_time_left_ms, black_time_left_ms from games where id='00000000-0000-0000-0000-0000000000aa';

\echo '--- 5. jugador blanco: NO puede leer dark_private'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select * from dark_private;
\echo '--- 6. blanco ve solo SUS observaciones (esperado: 2 filas, todas w)'
select ply, obs from dark_obs order by ply;
\echo '--- 7. blanco intenta cambiar current_fen en partida oscura (debe fallar)'
update games set current_fen='robado' where id='00000000-0000-0000-0000-0000000000aa';
\echo '--- 8. blanco intenta editar ply_count / reloj (debe fallar)'
update games set ply_count=99 where id='00000000-0000-0000-0000-0000000000aa';
update games set white_time_left_ms=999999 where id='00000000-0000-0000-0000-0000000000aa';
\echo '--- 9. blanco inserta game_moves en partida oscura (debe fallar)'
insert into game_moves (game_id, ply, san, fen_after, made_by) values ('00000000-0000-0000-0000-0000000000aa',3,'Nf3','x','11111111-1111-1111-1111-111111111111');
\echo '--- 10. blanco ofrece tablas en partida oscura (debe pasar)'
update games set draw_offered_by='11111111-1111-1111-1111-111111111111' where id='00000000-0000-0000-0000-0000000000aa';
\echo '--- 11. partida clásica sigue igual: actualizar fen y insertar jugada (deben pasar)'
update games set current_fen='nuevo', ply_count=1 where id='00000000-0000-0000-0000-0000000000bb';
insert into game_moves (game_id, ply, san, fen_after, made_by) values ('00000000-0000-0000-0000-0000000000bb',1,'e4','x','11111111-1111-1111-1111-111111111111');
\echo '--- 12. blanco no puede ejecutar dark_commit_move ni dark_get_state (deben fallar)'
select dark_get_state('00000000-0000-0000-0000-0000000000aa');
select dark_commit_move('00000000-0000-0000-0000-0000000000aa','11111111-1111-1111-1111-111111111111',2,'x','{}','{}','{}',null,null);
\echo '--- 13. reveal terminada: blanco ok (2 jugadas)'
select jsonb_array_length(dark_reveal('00000000-0000-0000-0000-0000000000aa')->'moves');
\echo '--- 14. tercero NO puede revelar'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select dark_reveal('00000000-0000-0000-0000-0000000000aa');
reset role;
select set_config('tablero.dark_writer','1',false);
\echo '--- 15. reveal durante la partida (debe fallar)'
update games set status='en_curso', result=null where id='00000000-0000-0000-0000-0000000000aa';
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select dark_reveal('00000000-0000-0000-0000-0000000000aa');
reset role;
\echo '--- 16. caída de bandera: reloj de negras agotado, mueve negras'
select set_config('tablero.dark_writer','1',false);
update games set black_time_left_ms=1000, turn_started_at=now()-interval '10 seconds', ply_count=1 where id='00000000-0000-0000-0000-0000000000aa';
select set_config('tablero.dark_writer','',false);
set role service_role;
select dark_commit_move('00000000-0000-0000-0000-0000000000aa','22222222-2222-2222-2222-222222222222',1,'F','{}','{}','{}',null,null);
reset role;
select status, result, winner_id, ply_count from games where id='00000000-0000-0000-0000-0000000000aa';
