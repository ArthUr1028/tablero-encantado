-- Pruebas de 20_resultado.sql. Orden de carga (ver tests/sql/correr.sh): dark_stub.sql, 18_dark.sql, 19_dark_pausa.sql, 20_resultado.sql, este archivo.
-- «FALLA» = debe salir ERROR; «OK» = debe pasar sin error.
\set ON_ERROR_STOP 0
\set W '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''

-- Partidas clásicas en curso (e1: blancas mueven; e3: negras mueven; e4: turno de blancas, para tablas y rendición; e5: sin nada).
insert into games (id, variant, mode, status, white_id, black_id, current_fen, ply_count) values
 ('00000000-0000-0000-0000-0000000000e1','clasico','tiempo_real','en_curso',:W,:B,'x',0),
 ('00000000-0000-0000-0000-0000000000e3','clasico','tiempo_real','en_curso',:W,:B,'x',1),
 ('00000000-0000-0000-0000-0000000000e4','clasico','tiempo_real','en_curso',:W,:B,'x',0),
 ('00000000-0000-0000-0000-0000000000e5','clasico','tiempo_real','en_curso',:W,:B,'x',0),
 ('00000000-0000-0000-0000-0000000000e6','clasico','tiempo_real','en_curso',:W,:B,'x',0),
 ('00000000-0000-0000-0000-0000000000e7','dark','tiempo_real','en_curso',:W,:B,'x',0),
 ('00000000-0000-0000-0000-0000000000e8','dark','tiempo_real','en_curso',:W,:B,'x',0);
grant select, insert, update on games to authenticated;
-- Imita a claim_timeout y compañía: función del servidor (security definer, dueño postgres) que cierra una partida.
create function public.sim_claim_timeout(p uuid) returns void language plpgsql security definer set search_path to 'public' as $$
begin update games set status='finalizada', result='0-1', winner_id='22222222-2222-2222-2222-222222222222' where id=p; end $$;
grant execute on function public.sim_claim_timeout(uuid) to authenticated;

set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

\echo '--- 1. blancas se declaran vencedoras sin mover (FALLA)'
update games set status='finalizada', result='1-0', winner_id='11111111-1111-1111-1111-111111111111' where id='00000000-0000-0000-0000-0000000000e1';
\echo '--- 2. blancas ponen solo result/winner con la partida en curso (FALLA)'
update games set result='1-0', winner_id='11111111-1111-1111-1111-111111111111' where id='00000000-0000-0000-0000-0000000000e1';
\echo '--- 3. blancas reclaman victoria en turno de NEGRAS, aunque suban ply_count (FALLA)'
update games set ply_count=2, status='finalizada', result='1-0', winner_id='11111111-1111-1111-1111-111111111111' where id='00000000-0000-0000-0000-0000000000e3';
\echo '--- 4. blancas cierran con SU jugada y victoria propia (OK: lo que hace el cliente al dar mate)'
update games set current_fen='mate', ply_count=1, status='finalizada', result='1-0', winner_id='11111111-1111-1111-1111-111111111111' where id='00000000-0000-0000-0000-0000000000e1';
\echo '--- 5. reintento idéntico de esa misma escritura (OK: el cliente reintenta hasta 3 veces)'
update games set current_fen='mate', ply_count=1, status='finalizada', result='1-0', winner_id='11111111-1111-1111-1111-111111111111' where id='00000000-0000-0000-0000-0000000000e1';
\echo '--- 6. partida terminada: cambiar el resultado (FALLA)'
update games set result='0-1', winner_id='22222222-2222-2222-2222-222222222222' where id='00000000-0000-0000-0000-0000000000e1';
\echo '--- 7. partida terminada: reabrirla (FALLA)'
update games set status='en_curso' where id='00000000-0000-0000-0000-0000000000e1';

\echo '--- 8. blancas declaran victoria de las negras como si fuera suya, en su turno: resultado 0-1 con jugada (FALLA)'
update games set ply_count=1, status='finalizada', result='0-1', winner_id='11111111-1111-1111-1111-111111111111' where id='00000000-0000-0000-0000-0000000000e4';
\echo '--- 9. tablas por jugada propia, sin ganador (OK: stalemate/repetición detectados por el cliente)'
update games set ply_count=1, status='finalizada', result='1/2-1/2' where id='00000000-0000-0000-0000-0000000000e4';

\echo '--- 10. blancas se rinden con resultado a favor de las negras (OK)'
update games set status='abandonada', result='0-1', winner_id='22222222-2222-2222-2222-222222222222' where id='00000000-0000-0000-0000-0000000000e5';
\echo '--- 11. «rendirse» con victoria para sí mismo (FALLA)'
update games set status='abandonada', result='1-0', winner_id='11111111-1111-1111-1111-111111111111' where id='00000000-0000-0000-0000-0000000000e6';
\echo '--- 12. rendir al rival: blancas escriben que las NEGRAS abandonan, con victoria blanca (FALLA)'
update games set status='abandonada', result='1-0', winner_id='11111111-1111-1111-1111-111111111111' where id='00000000-0000-0000-0000-0000000000e6';

\echo '--- 13. blancas ponen la oferta de tablas a nombre de las negras (FALLA)'
update games set draw_offered_by='22222222-2222-2222-2222-222222222222' where id='00000000-0000-0000-0000-0000000000e6';
\echo '--- 14. blancas aceptan unas tablas que nadie ofreció (FALLA)'
update games set status='finalizada', result='1/2-1/2', winner_id=null where id='00000000-0000-0000-0000-0000000000e6';
\echo '--- 15. blancas ofrecen tablas a su nombre (OK) y luego intentan aceptar su propia oferta (FALLA)'
update games set draw_offered_by='11111111-1111-1111-1111-111111111111' where id='00000000-0000-0000-0000-0000000000e6';
update games set status='finalizada', result='1/2-1/2', winner_id=null, draw_offered_by=null where id='00000000-0000-0000-0000-0000000000e6';
\echo '--- 16. las negras aceptan la oferta de las blancas (OK)'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update games set status='finalizada', result='1/2-1/2', winner_id=null, draw_offered_by=null where id='00000000-0000-0000-0000-0000000000e6';

\echo '--- 17. negras en SU turno cierran con victoria negra (OK) y con victoria blanca (FALLA)'
update games set ply_count=2, status='finalizada', result='1-0', winner_id='11111111-1111-1111-1111-111111111111' where id='00000000-0000-0000-0000-0000000000e3';
update games set ply_count=2, status='finalizada', result='0-1', winner_id='22222222-2222-2222-2222-222222222222' where id='00000000-0000-0000-0000-0000000000e3';

\echo '--- 18. un tercero no puede tocar la partida (esperado: UPDATE 0, la política ya no le deja ver la fila)'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
with t as (update games set status='finalizada', result='1-0', winner_id='33333333-3333-3333-3333-333333333333' where id='00000000-0000-0000-0000-0000000000e5' returning 1) select count(*) as filas_tocadas from t;

\echo '--- 19. función del servidor (security definer) cierra una partida a nombre de un jugador (OK: el candado no la afecta)'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select sim_claim_timeout('00000000-0000-0000-0000-0000000000e7');
reset role;
select status, result from games where id='00000000-0000-0000-0000-0000000000e7';
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

\echo '--- 20. Dark: rendirse sigue funcionando (OK)'
update games set status='abandonada', result='0-1', winner_id='22222222-2222-2222-2222-222222222222' where id='00000000-0000-0000-0000-0000000000e8';

\echo '--- 21. escrituras que no tocan el final siguen igual (OK): reparar jugada (fen, ply, reloj) y ofrecer/retirar tablas en una partida nueva'
reset role;
insert into games (id, variant, mode, status, white_id, black_id, current_fen, ply_count, white_time_left_ms, black_time_left_ms)
  values ('00000000-0000-0000-0000-0000000000e9','clasico','tiempo_real','en_curso',:W,:B,'x',0,300000,300000);
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update games set current_fen='y', ply_count=1, turn_started_at=now(), white_time_left_ms=290000 where id='00000000-0000-0000-0000-0000000000e9';
update games set draw_offered_by=null where id='00000000-0000-0000-0000-0000000000e9';
reset role;

\echo '--- 23. Dark: reclamar un mate propio subiendo ply_count (FALLA: lo bloquea el candado de 18_dark.sql, la posición la lleva el servidor)'
reset role;
insert into games (id, variant, mode, status, white_id, black_id, current_fen, ply_count) values ('00000000-0000-0000-0000-0000000000ea','dark','tiempo_real','en_curso',:W,:B,'x',0);
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update games set ply_count=1, status='finalizada', result='1-0', winner_id='11111111-1111-1111-1111-111111111111' where id='00000000-0000-0000-0000-0000000000ea';
reset role;

\echo '--- 22. estado final de cada partida (esperado: e1 1-0, e3 0-1, e4 1/2-1/2, e5 0-1, e6 1/2-1/2, e7 0-1, e8 0-1, e9 en_curso, ea en_curso)'
select right(id::text, 2) as partida, status, result from games order by id;
