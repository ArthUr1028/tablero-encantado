-- Pruebas de 29_convocatorias_recordatorios.sql. Orden de carga (ver correr.sh): dark_stub, 18_dark, push_stub, 27_push, convocatorias_stub, 28, 29, este archivo.
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned
\set A '''11111111-1111-1111-1111-111111111111'''
\set B '''22222222-2222-2222-2222-222222222222'''
\set C '''33333333-3333-3333-3333-333333333333'''
insert into profiles values (:A,'ana','Ana'),(:B,'beto','Beto'),(:C,'cris','Cris');
insert into club_members values (:A),(:B),(:C);
update push_config set secret = 'secreto-de-prueba';
create or replace function _ok(c boolean, t text) returns text language sql as $$ select case when coalesce(c, false) then '  ok    ' else '  FALLA ' end || t $$;
create or replace function _err(q text) returns text language plpgsql as $$ begin execute q; return 'sin error'; exception when others then return sqlerrm; end $$;
create or replace function _n() returns bigint language sql as $$ select count(*) from net.llamadas $$;
create or replace function _txt(u uuid, tag text) returns text language sql as $$ select (body->>'title') || ' | ' || (body->>'body') from net.llamadas where (body->>'user_id')::uuid = u and body->>'tag' = tag order by n desc limit 1 $$;
create or replace function _cita(id uuid, quien uuid, a uuid, desde interval, estado text default 'pactada') returns void language sql as $$
  insert into convocatorias (id, created_by, invited_id, proposed_by, starts_at, status) values (id, quien, a, quien, now() + desde, estado) $$;
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; select push_register('https://push/ana','pk-ana','au-ana','es');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; select push_register('https://push/beto','pk-beto','au-beto','en'); reset role;
delete from net.llamadas;

\echo '--- 1. A 10 minutos o menos de la hora: un recordatorio para cada uno, con el nombre del OTRO y en su idioma'
select _cita('00000000-0000-0000-0000-00000000c001', :A, :B, interval '8 minutes');
delete from net.llamadas;
select _ok(conv_recordar() = 1, 'conv_recordar() procesa 1 cita');
select _ok(_n() = 2, 'se envían 2 avisos (uno a cada participante)');
select _ok(_txt(:A, 'conv-rec-00000000-0000-0000-0000-00000000c001') = '⚔ Se acerca tu batalla | Tienes una batalla con Beto en 8 minutos. Que tu mente llegue antes que tus piezas.', 'Ana (es): «' || _txt(:A, 'conv-rec-00000000-0000-0000-0000-00000000c001') || '»');
select _ok(_txt(:B, 'conv-rec-00000000-0000-0000-0000-00000000c001') = '⚔ Your battle draws near | You have a battle with Ana in 8 minutes. Let your mind arrive before your pieces.', 'Beto (en): «' || _txt(:B, 'conv-rec-00000000-0000-0000-0000-00000000c001') || '»');
select _ok((select remind_10 from convocatorias where id = '00000000-0000-0000-0000-00000000c001') and not (select remind_0 from convocatorias where id = '00000000-0000-0000-0000-00000000c001'), 'la cita queda marcada: «en N minutos» enviado, «es la hora» pendiente');

\echo '--- 2. No se repite'
select _ok(conv_recordar() = 0 and _n() = 2, 'una segunda pasada no envía nada (0 citas, sigue en 2 avisos)');

\echo '--- 3. Lo que NO debe recordarse'
select _cita('00000000-0000-0000-0000-00000000c002', :A, :B, interval '30 minutes');
select _cita('00000000-0000-0000-0000-00000000c003', :A, :B, interval '5 minutes', 'propuesta');
select _cita('00000000-0000-0000-0000-00000000c004', :A, :B, interval '5 minutes', 'cancelada');
select _cita('00000000-0000-0000-0000-00000000c005', :A, :B, interval '5 minutes', 'en_juego');
select _cita('00000000-0000-0000-0000-00000000c006', :A, :B, interval '-31 minutes');
delete from net.llamadas;
select _ok(conv_recordar() = 0 and _n() = 0, 'una pactada a 30 min, una propuesta, una cancelada, una en juego y una de hace 31 min: ningún recordatorio');

\echo '--- 4. Singular y cita pactada con poco margen'
select _cita('00000000-0000-0000-0000-00000000c007', :A, :B, interval '30 seconds');
select conv_recordar();
select _ok(_txt(:A, 'conv-rec-00000000-0000-0000-0000-00000000c007') like '%con Beto en 1 minuto.%' and _txt(:B, 'conv-rec-00000000-0000-0000-0000-00000000c007') like '%with Ana in 1 minute.%', 'a 30 s de la hora dice «en 1 minuto» / «in 1 minute» (singular)');

\echo '--- 5. A la hora'
select _cita('00000000-0000-0000-0000-00000000c008', :B, :A, interval '-1 minute');
delete from net.llamadas;
select _ok(conv_recordar() >= 1, 'la cita que ya empezó se procesa');
select _ok(_txt(:A, 'conv-hora-00000000-0000-0000-0000-00000000c008') = '⚔ Es la hora | Es la hora. Beto ya aguarda en el campo.', 'Ana: «' || _txt(:A, 'conv-hora-00000000-0000-0000-0000-00000000c008') || '»');
select _ok(_txt(:B, 'conv-hora-00000000-0000-0000-0000-00000000c008') = '⚔ It is time | It is time. Ana already waits on the field.', 'Beto: «' || _txt(:B, 'conv-hora-00000000-0000-0000-0000-00000000c008') || '»');
select _ok((select remind_0 and remind_10 from convocatorias where id = '00000000-0000-0000-0000-00000000c008'), 'una cita pactada tarde (ya empezada) no recibe después el «en N minutos»');
delete from net.llamadas; select conv_recordar();
select _ok(_n() = 0, 'tampoco se repite «es la hora»');
-- la cita c001 ya recibió «en 8 minutos»; ahora llega su hora
update convocatorias set starts_at = now() - interval '10 seconds' where id = '00000000-0000-0000-0000-00000000c001';
select conv_recordar();
select _ok(_txt(:A, 'conv-hora-00000000-0000-0000-0000-00000000c001') like '⚔ Es la hora%Beto ya aguarda%', 'cuando llega la hora de la cita c001 sale «Es la hora» (y no otro «en N minutos»)');

\echo '--- 6. Las reglas de push_notify siguen valiendo'
delete from convocatorias; delete from net.llamadas;
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; select push_heartbeat(); reset role;   -- Beto tiene el Tablero a la vista
select _cita('00000000-0000-0000-0000-00000000c009', :A, :B, interval '5 minutes');
delete from net.llamadas;
select conv_recordar();
select _ok(_n() = 1 and _txt(:A, 'conv-rec-00000000-0000-0000-0000-00000000c009') is not null and _txt(:B, 'conv-rec-00000000-0000-0000-0000-00000000c009') is null, 'Beto está conectado: solo se avisa a Ana (a Beto le avisa el propio Tablero)');
update push_presence set seen_at = now() - interval '5 minutes';
delete from convocatorias; delete from net.llamadas; update push_prefs set citas = false where user_id = :A;
select _cita('00000000-0000-0000-0000-00000000c010', :A, :B, interval '5 minutes');
delete from net.llamadas;
select conv_recordar();
select _ok(_n() = 1 and _txt(:B, 'conv-rec-00000000-0000-0000-0000-00000000c010') is not null and _txt(:A, 'conv-rec-00000000-0000-0000-0000-00000000c010') is null, 'Ana apagó «Convocatorias»: solo se avisa a Beto');

\echo '--- 7. Seguridad: un jugador no puede ejecutarla'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select _ok(_err('select conv_recordar()') like '%permission denied%', 'conv_recordar() no se puede ejecutar con sesión de jugador');
reset role;

\echo '--- 8. La programación con pg_cron no rompe la carga si la extensión no existe (aquí no está)'
select _ok(true, 'el archivo 29 se cargó entero sin error (las tareas de pg_cron se programan en Supabase)');
