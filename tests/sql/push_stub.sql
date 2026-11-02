-- Lo que 27_push.sql espera encontrar y el stub de Dark no trae: perfiles, solicitudes del Clan, torneos y pg_net (simulado: anota cada llamada).
create table profiles (id uuid primary key, username text, display_name text);
alter table game_challenges add column if not exists async_days smallint;
create table club_pending (profile_id uuid primary key, invited_by uuid, created_at timestamptz default now(), expires_at timestamptz);
create table tournaments (id uuid primary key default gen_random_uuid(), name text, status text default 'inscripciones', created_by uuid);
create table tournament_participants (tournament_id uuid, profile_id uuid);
create schema net;
create table net.llamadas (n serial, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
 language plpgsql as $$ begin insert into net.llamadas (url, body, headers) values (url, body, headers); return 1; end $$;
grant usage on schema net to authenticated, service_role;
grant execute on function net.http_post(text, jsonb, jsonb, jsonb, int) to authenticated, service_role;
grant select, insert on club_pending, tournaments, tournament_participants, profiles to authenticated;
grant update on tournaments to authenticated;
