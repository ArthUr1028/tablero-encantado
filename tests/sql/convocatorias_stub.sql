-- Lo que 28_convocatorias.sql espera y los stubs de Dark/push no traen: miembros del Clan y is_club_member().
create table club_members (profile_id uuid primary key);
create function is_club_member(p uuid) returns boolean language sql stable security definer as $$ select exists (select 1 from club_members where profile_id = p) $$;
grant execute on function is_club_member(uuid) to authenticated, anon;
