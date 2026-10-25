\set ON_ERROR_STOP 0
\i 23_reloj_entrada.sql
insert into games (id, variant, status, white_id, black_id, ply_count, time_control_initial_seconds, turn_started_at) values
 ('00000000-0000-0000-0000-0000000000a1','clasico','en_curso','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',0,300, now() - interval '12 seconds'),
 ('00000000-0000-0000-0000-0000000000a2','dark','en_curso','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',0,300, now() - interval '12 seconds'),
 ('00000000-0000-0000-0000-0000000000a3','clasico','en_curso','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',0,300, now() - interval '3 minutes'),
 ('00000000-0000-0000-0000-0000000000a4','clasico','en_curso','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',0,null, now() - interval '12 seconds'),
 ('00000000-0000-0000-0000-0000000000a5','clasico','en_curso','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',2,300, now() - interval '12 seconds');
\echo '--- 1. las blancas reinician su reloj (esperado: segundos_perdidos ~0, hecho = t)'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select (extract(epoch from now() - turn_started_at))::int as segundos_perdidos, clock_entry_done as hecho from clock_entry_start('00000000-0000-0000-0000-0000000000a1');
\echo '--- 2. una segunda vez no hace nada (esperado: segundos_perdidos = 0 pero ya no cambia; probamos moviendo el reloj atras)'
reset role; update games set turn_started_at = now() - interval '20 seconds' where id = '00000000-0000-0000-0000-0000000000a1';
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select (extract(epoch from now() - turn_started_at))::int as segundos_perdidos_sigue_en_20 from clock_entry_start('00000000-0000-0000-0000-0000000000a1');
\echo '--- 3. partida oscura: tambien funciona (candado de Dark) (esperado: ~0)'
select (extract(epoch from now() - turn_started_at))::int as segundos_perdidos, clock_entry_done as hecho from clock_entry_start('00000000-0000-0000-0000-0000000000a2');
\echo '--- 4. el NEGRO no puede (esperado: sigue en ~12, hecho = f)'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select (extract(epoch from now() - turn_started_at))::int as segundos, clock_entry_done as hecho from clock_entry_start('00000000-0000-0000-0000-0000000000a4');
\echo '--- 5. tarde (3 min): sin compensacion (esperado: ~180, hecho = t)'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select (extract(epoch from now() - turn_started_at))::int as segundos, clock_entry_done as hecho from clock_entry_start('00000000-0000-0000-0000-0000000000a3');
\echo '--- 6. sin reloj o con jugadas hechas: no cambia (esperado: ~12 y f, ~12 y f)'
select (extract(epoch from now() - turn_started_at))::int as segundos, clock_entry_done as hecho from clock_entry_start('00000000-0000-0000-0000-0000000000a4');
select (extract(epoch from now() - turn_started_at))::int as segundos, clock_entry_done as hecho from clock_entry_start('00000000-0000-0000-0000-0000000000a5');
\echo '--- 7. un ajeno no puede (debe fallar) y sin sesion (debe fallar)'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select * from clock_entry_start('00000000-0000-0000-0000-0000000000a1');
reset role; set role anon;
select * from clock_entry_start('00000000-0000-0000-0000-0000000000a1');
