-- 30 · Elo del Tablero, visible para el Clan (2.254)
-- Se ejecuta en el editor SQL de Supabase (una sola vez; se puede repetir sin daño).
--
-- El Elo se calcula en el dispositivo de cada jugador (solo contra claudIA, con anclas fijas) y aquí solo se PUBLICA para que el Clan lo vea.
-- Una fila por persona y modalidad. Lo leen los miembros del Clan; cada quien escribe solo la suya.
-- OJO: es un valor que informa el cliente (como el resto de cifras personales); en un Clan de confianza basta. Si algún día hiciera falta
-- blindarlo, habría que recalcularlo en el servidor a partir de las partidas guardadas.

create table if not exists public.club_elo (
  profile_id uuid        not null default auth.uid() references public.profiles(id) on delete cascade,
  variant    text        not null check (variant in ('clasico','capablanca','amazonas','seirawan')),
  rating     integer     not null check (rating between 100 and 3200),
  games      integer     not null default 0 check (games >= 0 and games <= 100000),
  updated_at timestamptz not null default now(),
  primary key (profile_id, variant)
);

alter table public.club_elo enable row level security;
revoke all on public.club_elo from anon, authenticated;
grant select, insert, update on public.club_elo to authenticated;

drop policy if exists "el clan ve el Elo"    on public.club_elo;
drop policy if exists "publico mi Elo"       on public.club_elo;
drop policy if exists "actualizo mi Elo"     on public.club_elo;

create policy "el clan ve el Elo" on public.club_elo for select using (is_club_member(auth.uid()));
create policy "publico mi Elo" on public.club_elo for insert with check (profile_id = auth.uid() and is_club_member(auth.uid()));
create policy "actualizo mi Elo" on public.club_elo for update
  using (profile_id = auth.uid() and is_club_member(auth.uid()))
  with check (profile_id = auth.uid() and is_club_member(auth.uid()));
