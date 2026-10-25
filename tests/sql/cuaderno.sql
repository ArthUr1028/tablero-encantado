\set ON_ERROR_STOP 0
\i 21_cuaderno.sql
insert into games (id, variant, status, white_id, black_id, ply_count) values ('00000000-0000-0000-0000-0000000000aa','dark','en_curso','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',0);
insert into games (id, variant, status, white_id, black_id, ply_count) values ('00000000-0000-0000-0000-0000000000cc','clasico','en_curso','33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444',0);
\echo '--- 1. blanco guarda su nota general y una de la jugada 3 (deben pasar)'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into game_notes (game_id, ply, body) values ('00000000-0000-0000-0000-0000000000aa', 0, 'Plan: abrir por el flanco de rey');
insert into game_notes (game_id, ply, body) values ('00000000-0000-0000-0000-0000000000aa', 3, 'Aqui creo que hay un caballo en f6');
\echo '--- 2. el dueño es siempre él (esperado: 2 filas, owner 1111)'
select owner, ply from game_notes order by ply;
\echo '--- 3. negro NO ve las notas del blanco (esperado: 0 filas)'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as filas_que_ve_el_rival from game_notes;
\echo '--- 4. negro escribe la suya en la misma partida y misma jugada (debe pasar)'
insert into game_notes (game_id, ply, body) values ('00000000-0000-0000-0000-0000000000aa', 3, 'nota del negro');
select owner, ply, body from game_notes;
\echo '--- 5. negro intenta editar la del blanco (0 filas afectadas)'
update game_notes set body = 'hackeada' where owner = '11111111-1111-1111-1111-111111111111';
\echo '--- 6. negro intenta escribir a nombre del blanco (debe fallar)'
insert into game_notes (game_id, owner, ply, body) values ('00000000-0000-0000-0000-0000000000aa', '11111111-1111-1111-1111-111111111111', 5, 'suplantacion');
\echo '--- 7. un ajeno intenta escribir en una partida donde no juega (debe fallar)'
insert into game_notes (game_id, ply, body) values ('00000000-0000-0000-0000-0000000000cc', 0, 'colada');
\echo '--- 8. nota vacia, enorme o jugada fuera de rango (deben fallar)'
insert into game_notes (game_id, ply, body) values ('00000000-0000-0000-0000-0000000000aa', 7, '');
insert into game_notes (game_id, ply, body) values ('00000000-0000-0000-0000-0000000000aa', 7, repeat('x', 4001));
insert into game_notes (game_id, ply, body) values ('00000000-0000-0000-0000-0000000000aa', 1001, 'x');
insert into game_notes (game_id, ply, body) values ('00000000-0000-0000-0000-0000000000aa', -1, 'x');
\echo '--- 9. blanco edita la suya (debe pasar y cambiar updated_at) y la borra (debe pasar)'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update game_notes set body = 'Plan corregido' where ply = 0;
select body from game_notes where ply = 0;
delete from game_notes where ply = 3;
select count(*) as quedan_del_blanco from game_notes;
\echo '--- 10. tope: 400 notas por partida y jugador (la 401 debe fallar)'
reset role;
insert into game_notes (game_id, owner, ply, body) select '00000000-0000-0000-0000-0000000000aa', '11111111-1111-1111-1111-111111111111', g, 'n' from generate_series(1, 399) g;
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into game_notes (game_id, ply, body) values ('00000000-0000-0000-0000-0000000000aa', 500, 'una mas');
select count(*) as total_blanco from game_notes;
\echo '--- 11. sin sesion (anon) no puede nada (debe fallar)'
reset role; set role anon;
select * from game_notes;
\echo '--- 12. borrar la partida se lleva sus notas (esperado: 0)'
reset role;
delete from games where id = '00000000-0000-0000-0000-0000000000aa';
select count(*) as notas_huerfanas from game_notes;
