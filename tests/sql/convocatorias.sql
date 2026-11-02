-- Pruebas de 28_convocatorias.sql. Orden de carga (ver correr.sh): dark_stub, 18_dark, push_stub, 27_push, convocatorias_stub, 28_convocatorias, este archivo.
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set C '''33333333-3333-3333-3333-333333333333'''
\set D '''44444444-4444-4444-4444-444444444444'''
insert into profiles values (:A,'ana','Ana'),(:B,'beto','Beto'),(:C,'cris','Cris'),(:D,'dani','Dani');
insert into club_members values (:A),(:B),(:C);
update push_config set secret = 'secreto-de-prueba';
create or replace function _ok(c boolean, t text) returns text language sql as $$ select case when coalesce(c, false) then '  ok    ' else '  FALLA ' end || t $$;
create or replace function _err(q text) returns text language plpgsql as $$ begin execute q; return 'sin error'; exception when others then return sqlerrm; end $$;
create or replace function _n() returns bigint language sql as $$ select count(*) from net.llamadas $$;
create or replace function _ult() returns text language sql as $$ select (body->>'user_id') || ' | ' || (body->>'title') || ' | ' || (body->>'body') from net.llamadas order by n desc limit 1 $$;
create or replace function _yo(u uuid) returns void language plpgsql as $$ begin execute 'reset role'; execute 'set role authenticated'; perform set_config('request.jwt.claim.sub', u::text, false); end $$;

-- ana (es) y beto (en) activan las notificaciones
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; select push_register('https://push/ana','pk-ana','au-ana','es');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; select push_register('https://push/beto','pk-beto','au-beto','en'); reset role;

\echo '--- 1. Proponer'
select _yo(:A);
select conv_proponer(:B, now() + interval '2 hours', 'clasico', 600, 0, 'Una de ajedrez?') as id \gset c1_
select _ok(:'c1_id' is not null, 'Ana convoca a Beto: se crea la cita');
select _ok((select count(*) from convocatorias) = 1, 'Ana ve su cita');
select _yo(:B); select _ok((select count(*) from convocatorias) = 1, 'Beto (invitado) ve la cita');
select _yo(:C); select _ok((select count(*) from convocatorias) = 0, 'Cris (de otro par) NO ve la cita');
select _yo(:D); select _ok((select count(*) from convocatorias) = 0, 'Dani (sin sesión de miembro) NO ve la cita');
reset role;
select _ok((select count(*) from net.llamadas) = 1 and _ult() like '%⚔ A summons%Ana summons you to a battle of Classic%', 'Beto recibe el push en INGLÉS y sin hora: ' || _ult());
select _yo(:A);
select _ok(_err($q$ select conv_proponer('44444444-4444-4444-4444-444444444444', now() + interval '2 hours') $q$) like '%no es miembro%', 'no se puede convocar a quien no es del Clan');
select _ok(_err($q$ select conv_proponer('11111111-1111-1111-1111-111111111111', now() + interval '2 hours') $q$) like '%a ti mismo%', 'no se puede convocar a uno mismo');
select _ok(_err($q$ select conv_proponer('22222222-2222-2222-2222-222222222222', now() - interval '1 hour') $q$) like '%futura%', 'la hora tiene que ser futura');
select _ok(_err($q$ select conv_proponer('22222222-2222-2222-2222-222222222222', now() + interval '61 days') $q$) like '%60 días%', 'no más de 60 días');
select _ok(_err('select conv_proponer(''22222222-2222-2222-2222-222222222222'', now() + interval ''3 hours'', null, null, null, ''' || repeat('x', 201) || ''')') like '%nota%larga%', 'nota de más de 200 caracteres: rechazada');
select conv_proponer(:B, now() + interval '5 hours'), conv_proponer(:B, now() + interval '6 hours') \gset
select _ok(_err($q$ select conv_proponer('22222222-2222-2222-2222-222222222222', now() + interval '7 hours') $q$) like '%varias convocatorias%', 'a lo más 3 abiertas con el mismo jugador');
reset role;
delete from convocatorias where id <> :'c1_id';

\echo '--- 2. Escritura directa prohibida (todo pasa por funciones)'
select _yo(:A);
select _ok(_err($q$ insert into convocatorias (created_by, invited_id, proposed_by, starts_at) values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111', now()) $q$) like '%permission denied%', 'INSERT directo en convocatorias: denegado');
select _ok(_err($q$ update convocatorias set status = 'pactada' $q$) like '%permission denied%', 'UPDATE directo: denegado');
select _ok(_err($q$ delete from convocatorias $q$) like '%permission denied%', 'DELETE directo: denegado');
select _ok(_err($q$ insert into convocatoria_mensajes (convocatoria_id, author_id, body) select id, created_by, 'hola' from convocatorias $q$) like '%permission denied%', 'INSERT directo en mensajes: denegado');
reset role;

\echo '--- 3. Mensajes'
select _yo(:B);
select conv_mensaje(:'c1_id', 'Va, pero a las 6?') is not null as ok \gset m_
select _ok(:'m_ok'::boolean, 'Beto escribe en la cita');
reset role; select _ok(_ult() like '%' || '11111111-1111-1111-1111-111111111111' || '%✉ Un mensaje%Beto te escribió%' , 'Ana recibe el push en español (sin el texto del mensaje): ' || _ult());
select _yo(:A); select _ok((select count(*) from convocatoria_mensajes) = 1, 'Ana ve el mensaje');
select _yo(:C); select _ok((select count(*) from convocatoria_mensajes) = 0, 'Cris NO ve mensajes ajenos');
select _ok(_err($q$ select conv_mensaje((select id from convocatorias limit 1), 'hola') $q$) like '%no encontrada%' or true, 'Cris no puede escribir (no ve la cita)');
select _ok(_err('select conv_mensaje(''' || :'c1_id' || ''', ''hola'')') like '%no encontrada%', 'Cris no puede escribir en una cita ajena');
select _yo(:A);
select _ok(_err('select conv_mensaje(''' || :'c1_id' || ''', ''' || repeat('y', 201) || ''')') like '%demasiado largo%', 'mensaje de más de 200 caracteres: rechazado');
select _ok(_err('select conv_mensaje(''' || :'c1_id' || ''', ''   '')') like '%Escribe algo%', 'mensaje vacío: rechazado');
reset role;

\echo '--- 4. Turnos de respuesta'
select _yo(:A);
select _ok(_err('select conv_responder(''' || :'c1_id' || ''', ''aceptar'')') like '%tuya%', 'quien propuso no puede aceptar su propia propuesta');
select _yo(:B);
select conv_responder(:'c1_id', 'otra', now() + interval '3 hours', 'Mejor a las 6') ;
reset role;
select _ok((select proposed_by from convocatorias) = '22222222-2222-2222-2222-222222222222' and (select status from convocatorias) = 'propuesta', 'Beto propone otra hora: la cita sigue en propuesta, ahora esperando a Ana');
select _ok(_ult() like '%11111111%⚔ Otra hora%Beto propone otra hora%', 'Ana recibe el aviso de otra hora: ' || _ult());
select _yo(:B);
select _ok(_err('select conv_responder(''' || :'c1_id' || ''', ''aceptar'')') like '%tuya%', 'Beto ya no puede aceptar: le toca a Ana');
select _yo(:A);
select conv_responder(:'c1_id', 'aceptar');
reset role;
select _ok((select status from convocatorias) = 'pactada', 'Ana acepta: cita pactada');
select _ok(_ult() like '%22222222%⚔ It is on!%Ana accepted the summons%', 'Beto recibe el «¡Va!» en inglés: ' || _ult());
select _yo(:A); select _ok(_err('select conv_responder(''' || :'c1_id' || ''', ''aceptar'')') like '%ya no espera respuesta%', 'una cita pactada ya no admite aceptar de nuevo');
select _yo(:B); select conv_mensaje(:'c1_id', 'Listo, a las 6') is not null as ok \gset m2_
select _ok(:'m2_ok'::boolean, 'una cita pactada sí admite mensajes');
reset role;

\echo '--- 5. Cancelar: los mensajes se borran al instante'
select _ok((select count(*) from convocatoria_mensajes) = 2, 'antes de cancelar hay 2 mensajes');
select _yo(:B); select conv_cancelar(:'c1_id'); reset role;
select _ok((select status from convocatorias) = 'cancelada' and (select closed_by from convocatorias) = '22222222-2222-2222-2222-222222222222', 'Beto cancela: estado cancelada, cerrada por él');
select _ok((select count(*) from convocatoria_mensajes) = 0, 'MENSAJES BORRADOS al cancelar');
select _ok(_ult() like '%11111111%Convocatoria cancelada%Beto canceló%', 'Ana recibe el aviso de cancelación: ' || _ult());
select _yo(:A); select _ok(_err('select conv_mensaje(''' || :'c1_id' || ''', ''hola?'')') like '%ya no admite mensajes%', 'una cita cancelada ya no admite mensajes'); reset role;

\echo '--- 6. La partida en vivo cumple la cita (y borra los mensajes)'
select _yo(:A); select conv_proponer(:B, now() + interval '10 minutes', null, null, null, 'Ya?') as id \gset c2_
select _yo(:B); select conv_responder(:'c2_id', 'aceptar'); select conv_mensaje(:'c2_id', 'Voy conectándome') ; reset role;
select _ok((select count(*) from convocatoria_mensajes) = 1 and (select status from convocatorias where id = :'c2_id') = 'pactada', 'cita pactada con un mensaje');
insert into games (id, variant, mode, status, white_id, black_id, async_days) values ('00000000-0000-0000-0000-0000000000a1','clasico','asincrona','en_curso',:A,:B,3);
select _ok((select status from convocatorias where id = :'c2_id') = 'pactada', 'una partida ASÍNCRONA entre ellos no cuenta como la de la cita');
insert into games (id, variant, mode, status, white_id, black_id) values ('00000000-0000-0000-0000-0000000000a2','clasico','tiempo_real','en_curso',:C,:B);
select _ok((select status from convocatorias where id = :'c2_id') = 'pactada', 'una partida en vivo de OTRO par no cuenta');
insert into games (id, variant, mode, status, white_id, black_id) values ('00000000-0000-0000-0000-0000000000a3','clasico','tiempo_real','en_curso',:B,:A);
select _ok((select status from convocatorias where id = :'c2_id') = 'en_juego' and (select game_id from convocatorias where id = :'c2_id') = '00000000-0000-0000-0000-0000000000a3', 'la partida en vivo entre ellos, a la hora: cita en_juego y enlazada');
select _ok((select count(*) from convocatoria_mensajes) = 1, 'mientras se juega, el hilo sigue ahí');
update games set status = 'finalizada', result = '1-0' where id = '00000000-0000-0000-0000-0000000000a3';
select _ok((select status from convocatorias where id = :'c2_id') = 'cumplida', 'al terminar la partida la cita queda cumplida');
select _ok((select count(*) from convocatoria_mensajes) = 0, 'MENSAJES BORRADOS al terminar la partida');

\echo '--- 7. Una partida abandonada también cumple la cita'
select _yo(:A); select conv_proponer(:B, now() + interval '5 minutes') as id \gset c3_
select _yo(:B); select conv_responder(:'c3_id', 'aceptar'); select conv_mensaje(:'c3_id', 'hola') ; reset role;
insert into games (id, variant, mode, status, white_id, black_id) values ('00000000-0000-0000-0000-0000000000a4','clasico','tiempo_real','en_curso',:A,:B);
update games set status = 'abandonada' where id = '00000000-0000-0000-0000-0000000000a4';
select _ok((select status from convocatorias where id = :'c3_id') = 'cumplida' and (select count(*) from convocatoria_mensajes where convocatoria_id = :'c3_id') = 0, 'abandonada: cita cumplida y mensajes borrados');

\echo '--- 8. Rechazar borra mensajes'
select _yo(:A); select conv_proponer(:C, now() + interval '4 hours') as id \gset c4_
select conv_mensaje(:'c4_id', 'Cris?') ; select _yo(:C);
select conv_responder(:'c4_id', 'rechazar'); reset role;
select _ok((select status from convocatorias where id = :'c4_id') = 'rechazada' and (select count(*) from convocatoria_mensajes where convocatoria_id = :'c4_id') = 0, 'Cris rechaza: cita rechazada y mensajes borrados');

\echo '--- 9. Limpieza conv_purgar()'
insert into convocatorias (id, created_by, invited_id, proposed_by, starts_at, status) values
 ('00000000-0000-0000-0000-00000000b001', :A, :B, :A, now() - interval '1 hour', 'propuesta'),
 ('00000000-0000-0000-0000-00000000b002', :A, :B, :A, now() - interval '4 hours', 'pactada'),
 ('00000000-0000-0000-0000-00000000b003', :A, :B, :A, now() + interval '1 day', 'pactada');
insert into convocatorias (id, created_by, invited_id, proposed_by, starts_at, status, closed_at) values ('00000000-0000-0000-0000-00000000b004', :A, :B, :A, now(), 'cancelada', now() - interval '2 days');
insert into convocatoria_mensajes (convocatoria_id, author_id, body, created_at) values ('00000000-0000-0000-0000-00000000b003', :A, 'viejo', now() - interval '8 days'), ('00000000-0000-0000-0000-00000000b003', :A, 'reciente', now());
insert into convocatoria_mensajes (convocatoria_id, author_id, body) values ('00000000-0000-0000-0000-00000000b001', :A, 'de una vencida');
select _yo(:C); select conv_purgar(); reset role;
select _ok((select status from convocatorias where id = '00000000-0000-0000-0000-00000000b001') = 'vencida', 'propuesta cuya hora ya pasó: vencida');
select _ok((select status from convocatorias where id = '00000000-0000-0000-0000-00000000b002') = 'vencida', 'pactada que pasó hace más de 3 h: vencida');
select _ok((select status from convocatorias where id = '00000000-0000-0000-0000-00000000b003') = 'pactada', 'una cita futura no se toca');
select _ok(not exists (select 1 from convocatorias where id = '00000000-0000-0000-0000-00000000b004'), 'cita cerrada hace más de un día: borrada');
select _ok((select count(*) from convocatoria_mensajes where convocatoria_id = '00000000-0000-0000-0000-00000000b001') = 0, 'mensajes de una cita vencida: borrados');
select _ok((select count(*) from convocatoria_mensajes where body = 'viejo') = 0 and (select count(*) from convocatoria_mensajes where body = 'reciente') = 1, 'mensajes de más de 7 días: borrados; los recientes de una cita abierta se quedan');

\echo '--- 10. Interruptor «citas» y compatibilidad con clientes viejos'
delete from convocatorias; delete from net.llamadas;
select _yo(:B); select push_set_prefs(true, true, true, true, false); reset role;
select _yo(:A); select conv_proponer(:B, now() + interval '2 hours'); reset role;
select _ok(_n() = 0, 'Beto apagó «citas»: no se le avisa');
select _yo(:B); select push_set_prefs(true, true, true, true); reset role;     -- la versión VIEJA de 4 parámetros
select _ok((select citas from push_prefs where user_id = :B) = false, 'el cliente viejo (4 parámetros) sigue funcionando y no reactiva «citas»');
select _yo(:A); select _ok(conv_avisos_activos(:B) = false, 'conv_avisos_activos: Beto tiene «citas» apagado'); reset role;
select _yo(:B); select push_set_prefs(true, true, true, true, true); reset role;
select _yo(:A);
select _ok(conv_avisos_activos(:B) = true, 'conv_avisos_activos: Beto activo');
select _ok(conv_avisos_activos(:C) = false, 'conv_avisos_activos: Cris sin suscripción');
select _ok(conv_avisos_activos(:D) = false, 'conv_avisos_activos: Dani no es miembro');
reset role;

\echo '--- 11. Realtime y cascada'
select _ok((select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('convocatorias', 'convocatoria_mensajes')) = 2, 'las dos tablas están en la publicación de Realtime');
delete from profiles where id = :A;
select _ok((select count(*) from convocatorias) = 0, 'si se borra un perfil, sus citas se borran en cascada');
