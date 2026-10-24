create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create publication supabase_realtime;
create type game_status as enum ('esperando_rival','en_curso','finalizada','abandonada');
create type game_variant as enum ('clasico','capablanca','maharaja','amazonas','seirawan');
create type game_mode as enum ('asincrona','tiempo_real');
create table games (id uuid primary key default gen_random_uuid(), async_days smallint, black_id uuid, black_time_left_ms bigint,
 created_at timestamptz default now(), current_fen text, draw_offered_by uuid, mode game_mode, ply_count int default 0,
 result text, status game_status default 'esperando_rival', time_control_increment_seconds int, time_control_initial_seconds int,
 tournament_match_id uuid, turn_started_at timestamptz, updated_at timestamptz default now(), variant game_variant, white_id uuid,
 white_time_left_ms bigint, winner_id uuid,
 paused_by uuid, paused_at timestamptz, white_pauses_used int not null default 0, black_pauses_used int not null default 0);
create table game_moves (id bigserial primary key, fen_after text, game_id uuid, made_at timestamptz default now(), made_by uuid, ply int, san text);
create table game_challenges (id uuid primary key default gen_random_uuid(), created_by uuid, invited_id uuid, variant game_variant, mode game_mode,
 creator_color text, status text default 'pendiente', responded_at timestamptz, game_id uuid, tournament_match_id uuid,
 time_control_initial_seconds int, time_control_increment_seconds int);
create table tournament_matches (id uuid primary key, status text, game_id uuid);
grant usage on schema public, auth to anon, authenticated, service_role;
grant select, insert, update on games, game_moves to authenticated;
alter table games enable row level security; alter table game_moves enable row level security;
create policy g_sel on games for select using (auth.uid() in (white_id, black_id));
create policy g_upd on games for update using (auth.uid() in (white_id, black_id));
create policy m_ins on game_moves for insert with check (auth.uid() = made_by);
create policy m_sel on game_moves for select using (game_id in (select id from games where auth.uid() in (white_id, black_id)));
grant usage on all sequences in schema public to authenticated;
