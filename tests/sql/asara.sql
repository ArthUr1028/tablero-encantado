\set ON_ERROR_STOP 0
-- tablas mínimas del Reto (no están en dark_stub.sql) y la comprobación de socio
create table reto_victorias (id bigserial primary key, user_id uuid, claim_id uuid, variant text check (variant in ('clasico','capablanca','maharaja','amazonas','seirawan')),
  level text, color text, plies int, sans text[], created_at timestamptz default now(), unique (user_id, claim_id));
create function is_club_member(u uuid) returns boolean language sql as $$ select true $$;
create function push_variant(p_v text, p_lang text) returns text language sql immutable as $$ select p_v $$;
\i 24_reto_shatranj_dark.sql
-- PASO 1 y PASO 2 de 31_asara.sql, cada uno en su propia sesión de psql no hace falta aquí (autocommit), pero se corren en orden
\i 31_asara.sql
\echo '--- 1. el valor existe en el enum (esperado: crazyhouse)'
select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'game_variant' and enumlabel = 'crazyhouse';
\echo '--- 2. aceptar un reto de Asara crea la partida con la FEN de Asara (reserva vacía y marca zh)'
insert into game_challenges (id, created_by, invited_id, variant, mode, creator_color) values ('00000000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','crazyhouse','tiempo_real','blancas');
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.respond_challenge('00000000-0000-0000-0000-0000000000a1', true) is not null as partida_creada;
reset role;
select variant, current_fen, status from games where variant::text = 'crazyhouse';
\echo '--- 3. las demás variantes no cambian (clásico conserva su FEN)'
insert into game_challenges (id, created_by, invited_id, variant, mode, creator_color) values ('00000000-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','clasico','tiempo_real','blancas');
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.respond_challenge('00000000-0000-0000-0000-0000000000a2', true) is not null as partida_creada;
reset role;
select variant, current_fen from games where variant::text = 'clasico';
\echo '--- 4. una partida que ya trae FEN no se pisa (esperado: la FEN que se puso)'
insert into games (variant, mode, status, white_id, black_id, current_fen) values ('crazyhouse','tiempo_real','en_curso','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[Pn] b KQkq - 0 1 zh');
select current_fen from games where current_fen like '%[Pn]%';
\echo '--- 5. nombre en avisos'
select push_variant('crazyhouse','es') as es;
\echo '--- 6. el Reto registra una victoria en Asara (esperado: ok, club) y de nuevo ya_registrada'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.registrar_victoria_reto('00000000-0000-0000-0000-0000000000b1', 'crazyhouse', 'w', (select array_agg('N@e4'::text) from generate_series(1,24)));
select public.registrar_victoria_reto('00000000-0000-0000-0000-0000000000b1', 'crazyhouse', 'w', (select array_agg('N@e4'::text) from generate_series(1,24)));
select variant, level, plies from reto_victorias where variant = 'crazyhouse';
\echo '--- 7. variante inventada (debe fallar) y la del Clásico sigue siendo fuerte'
select public.registrar_victoria_reto('00000000-0000-0000-0000-0000000000b2', 'atomic', 'w', (select array_agg('e4'::text) from generate_series(1,24)));
select public.registrar_victoria_reto('00000000-0000-0000-0000-0000000000b3', 'clasico', 'w', (select array_agg('e4'::text) from generate_series(1,24)));
select variant, level from reto_victorias where variant = 'clasico';
