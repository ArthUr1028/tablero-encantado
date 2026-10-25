\set ON_ERROR_STOP 0
\i 22_marcas.sql
insert into games (id, variant, status, white_id, black_id, ply_count) values ('00000000-0000-0000-0000-0000000000aa','dark','en_curso','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',0);
insert into games (id, variant, status, white_id, black_id, ply_count) values ('00000000-0000-0000-0000-0000000000cc','clasico','en_curso','33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444',0);
\echo '--- 1. blanco guarda sus marcas (debe pasar)'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into game_marks (game_id, marks) values ('00000000-0000-0000-0000-0000000000aa', '[{"t":"a","f":12,"to":28,"c":"g"},{"t":"x","s":5,"c":"r","x":"ojo"}]');
select owner, jsonb_array_length(marks) as marcas from game_marks;
\echo '--- 2. negro NO ve las del blanco (esperado: 0)'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as filas_que_ve_el_rival from game_marks;
\echo '--- 3. negro guarda las suyas (debe pasar) y no puede editar ni suplantar'
insert into game_marks (game_id, marks) values ('00000000-0000-0000-0000-0000000000aa', '[]');
update game_marks set marks = '[{"t":"h","s":1,"c":"b"}]' where owner = '11111111-1111-1111-1111-111111111111';
insert into game_marks (game_id, owner, marks) values ('00000000-0000-0000-0000-0000000000aa', '11111111-1111-1111-1111-111111111111', '[]');
\echo '--- 4. un ajeno no escribe en partida donde no juega (debe fallar)'
insert into game_marks (game_id, marks) values ('00000000-0000-0000-0000-0000000000cc', '[]');
\echo '--- 5. formato inválido: no es lista, más de 80, demasiado grande (deben fallar)'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update game_marks set marks = '{"t":"a"}' where owner = '11111111-1111-1111-1111-111111111111';
update game_marks set marks = (select jsonb_agg('{"t":"h","s":1,"c":"g"}'::jsonb) from generate_series(1, 81)) where owner = '11111111-1111-1111-1111-111111111111';
update game_marks set marks = jsonb_build_array(repeat('x', 17000)) where owner = '11111111-1111-1111-1111-111111111111';
\echo '--- 6. 80 marcas exactas sí caben (debe pasar)'
update game_marks set marks = (select jsonb_agg('{"t":"h","s":1,"c":"g"}'::jsonb) from generate_series(1, 80)) where owner = '11111111-1111-1111-1111-111111111111';
select jsonb_array_length(marks) as marcas from game_marks;
\echo '--- 7. blanco limpia sus marcas (debe pasar)'
update game_marks set marks = '[]' where owner = '11111111-1111-1111-1111-111111111111';
delete from game_marks where owner = '11111111-1111-1111-1111-111111111111';
select count(*) as quedan_del_blanco from game_marks where owner = '11111111-1111-1111-1111-111111111111';
\echo '--- 8. sin sesión (anon) no puede nada (debe fallar)'
reset role; set role anon;
select * from game_marks;
\echo '--- 9. borrar la partida se lleva sus marcas (esperado: 0)'
reset role;
delete from games where id = '00000000-0000-0000-0000-0000000000aa';
select count(*) as marcas_huerfanas from game_marks;
