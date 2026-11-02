-- Pruebas de 27_push.sql. Orden de carga (ver correr.sh): dark_stub, 18_dark, push_stub, 27_push, este archivo.
\set ON_ERROR_STOP 0
\set W '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set C '''33333333-3333-3333-3333-333333333333'''
insert into profiles values (:W,'ana','Ana'),(:B,'beto','Beto'),(:C,'cris',null);
update push_config set secret = 'secreto-de-prueba';
create or replace function _n() returns bigint language sql as $$ select count(*) from net.llamadas $$;
create or replace function _ult() returns text language sql as $$ select (body->>'user_id') || ' | ' || (body->>'title') || ' | ' || (body->>'body') || ' | ' || (body->>'url') || ' | ' || (body->>'tag') from net.llamadas order by n desc limit 1 $$;

\echo '--- 1. sin suscripción ni preferencias no se avisa a nadie (esperado: 0 llamadas)'
insert into games (id, variant, mode, status, white_id, black_id, current_fen, ply_count)
 values ('00000000-0000-0000-0000-0000000000a1','clasico','tiempo_real','en_curso',:W,:B,'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',0);
update games set ply_count = 1, current_fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' where id = '00000000-0000-0000-0000-0000000000a1';
select _n() as llamadas;

\echo '--- 2. Ana (es) y Beto (en) activan las notificaciones; un tercero sin sesión no puede (FALLA: Inicia sesión)'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select push_register('https://push/ana','pk-ana','au-ana','es');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select push_register('https://push/beto','pk-beto','au-beto','en');
reset role; set role anon; set request.jwt.claim.sub = '';
select push_register('https://push/x','pk','au','es');
reset role;
select (select count(*) from push_subscriptions) as suscripciones, (select count(*) from push_prefs) as preferencias;

\echo '--- 3. turno: las blancas mueven y le toca a Beto (OK: 1 llamada a Beto, en inglés)'
update games set ply_count = 3, current_fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2' where id = '00000000-0000-0000-0000-0000000000a1';
select _n() as llamadas, _ult();

\echo '--- 4. si Ana está conectada ahora, no se le avisa (esperado: sin llamadas nuevas); si lleva 2 min ausente, sí (OK, en español)'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; select push_heartbeat(); reset role;
update games set ply_count = 4, current_fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3' where id = '00000000-0000-0000-0000-0000000000a1';
select _n() as llamadas_tras_presente;
update push_presence set seen_at = now() - interval '2 minutes';
update games set ply_count = 6, current_fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4' where id = '00000000-0000-0000-0000-0000000000a1';
select _n() as llamadas_tras_ausente, _ult();

\echo '--- 5. Dark: el FEN público dice «w» pero es turno de negras (ply 1): el aviso va a Beto y NO revela nada (OK)'
insert into games (id, variant, mode, status, white_id, black_id, current_fen, ply_count, async_days)
 values ('00000000-0000-0000-0000-0000000000d1','dark','asincrona','en_curso',:W,:B,'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 dark',0, 3);
select set_config('tablero.dark_writer','1',false);
update games set ply_count = 1 where id = '00000000-0000-0000-0000-0000000000d1';
select set_config('tablero.dark_writer','',false);
select _ult();
select _ult() !~* '(dark|pe[oó]n|caballo|torre|alfil|dama|rey|e4|captur)' as sin_fugas;

\echo '--- 6. preferencias: Beto apaga «turno» (esperado: ya no recibe el aviso de turno, pero sí otros tipos)'
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select push_set_prefs(false, true, true, true);
reset role;
select _n() as antes_del_6;
select set_config('tablero.dark_writer','1',false);
update games set ply_count = 2 where id = '00000000-0000-0000-0000-0000000000d1';   -- turno de Ana: sí se avisa
select _n() as tras_turno_de_ana;
update games set ply_count = 3 where id = '00000000-0000-0000-0000-0000000000d1';   -- turno de Beto, con «turno» apagado: no se avisa
select set_config('tablero.dark_writer','',false);
select _n() as tras_turno_de_beto_igual;

\echo '--- 7. fin: Beto se rinde en la partida clásica; avisa a Ana, no a Beto (OK: 1 llamada a Ana, rindió)'
update push_presence set seen_at = now() - interval '5 minutes';
select _n() as antes;
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update games set status='abandonada', result='1-0', winner_id=:W where id = '00000000-0000-0000-0000-0000000000a1';
reset role;
select _n() as despues, _ult();

\echo '--- 8. fin sin sesión (árbitro de Dark) con ganador: avisa al perdedor, no al ganador (OK)'
select _n() as antes;
update games set status='finalizada', result='1-0', winner_id=:W where id = '00000000-0000-0000-0000-0000000000d1';
select _n() as despues, _ult();

\echo '--- 9. retos: Ana reta a Beto (OK: aviso a Beto) pero un reto de torneo no avisa (esperado: sin llamada)'
insert into game_challenges (id, created_by, invited_id, variant, mode, creator_color) values ('00000000-0000-0000-0000-0000000000c1',:W,:B,'dark','asincrona','blancas');
select _n() as tras_reto, _ult();
insert into game_challenges (id, created_by, invited_id, variant, mode, creator_color, tournament_match_id) values ('00000000-0000-0000-0000-0000000000c2',:W,:B,'clasico','tiempo_real','blancas','00000000-0000-0000-0000-0000000000f1');
select _n() as tras_reto_torneo_igual;
\echo '--- 9b. Beto acepta (partida con blancas de Ana): avisa a Ana que lleva las blancas y le toca (OK)'
insert into games (id, variant, mode, status, white_id, black_id, current_fen, ply_count) values ('00000000-0000-0000-0000-0000000000a2','clasico','tiempo_real','en_curso',:W,:B,'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',0);
update game_challenges set status='aceptado', game_id='00000000-0000-0000-0000-0000000000a2', async_days = 3 where id = '00000000-0000-0000-0000-0000000000c1';
select _ult();

\echo '--- 10. Clan: Cris pide entrar con Ana como invitadora (OK: aviso a Ana); torneo: empieza y avisa a los inscritos menos a quien lo inicia'
insert into club_pending (profile_id, invited_by) values (:C, :W);
select _ult();
insert into tournaments (id, name, status, created_by) values ('00000000-0000-0000-0000-0000000000e1','Copa de Otoño','inscripciones',:W);
insert into tournament_participants values ('00000000-0000-0000-0000-0000000000e1',:W),('00000000-0000-0000-0000-0000000000e1',:B);
select _n() as antes;
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update tournaments set status='en_curso' where id='00000000-0000-0000-0000-0000000000e1';
reset role;
select _n() as despues, _ult();

\echo '--- 11. un fallo del envío NUNCA rompe la jugada (OK: la jugada se guarda)'
alter function net.http_post(text, jsonb, jsonb, jsonb, int) rename to http_post_roto;
update games set ply_count = 2 where id = '00000000-0000-0000-0000-0000000000a2';
select ply_count as jugada_guardada from games where id = '00000000-0000-0000-0000-0000000000a2';
alter function net.http_post_roto(text, jsonb, jsonb, jsonb, int) rename to http_post;

\echo '--- 12. seguridad: un jugador no puede ejecutar push_notify (FALLA), leer push_config (FALLA) ni ver las preferencias de otro (0 filas)'
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select push_notify(:B,'turno','a','b','c','d','/','t');
select * from push_config;
select count(*) as filas_ajenas from push_prefs where user_id = '11111111-1111-1111-1111-111111111111';
select count(*) as mis_filas from push_prefs where user_id = '22222222-2222-2222-2222-222222222222';
reset role;
\echo '--- 13. cerrar sesión en el aparato: push_unregister borra solo la suya (OK: queda la de Ana)'
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select push_unregister('https://push/ana'); select push_unregister('https://push/beto');
reset role;
select endpoint from push_subscriptions;
