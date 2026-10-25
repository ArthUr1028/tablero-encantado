-- 22 · Marcas sobre el tablero (2.131)
-- Se ejecuta en el editor SQL de Supabase (una sola vez; se puede repetir sin daño).
--
-- Flechas, casillas resaltadas, círculos y textos cortos que cada jugador dibuja en SU tablero. Una fila por partida y jugador, con la
-- lista completa de marcas en JSON. Es PRIVADO como el cuaderno: solo el dueño lo lee o lo escribe; el rival jamás lo ve. No toca la
-- partida ni pasa por el árbitro. Una partida que se borra se lleva sus marcas.

create table if not exists public.game_marks (
  game_id    uuid        not null references public.games(id) on delete cascade,
  owner      uuid        not null default auth.uid(),
  marks      jsonb       not null default '[]'::jsonb
             check (jsonb_typeof(marks) = 'array' and jsonb_array_length(marks) <= 80 and pg_column_size(marks) <= 16000),
  updated_at timestamptz not null default now(),
  primary key (game_id, owner)
);

alter table public.game_marks enable row level security;
revoke all on public.game_marks from anon, authenticated;
grant select, insert, update, delete on public.game_marks to authenticated;

drop policy if exists "ver mis marcas"      on public.game_marks;
drop policy if exists "escribir mis marcas" on public.game_marks;
drop policy if exists "editar mis marcas"   on public.game_marks;
drop policy if exists "borrar mis marcas"   on public.game_marks;

create policy "ver mis marcas" on public.game_marks for select using (owner = auth.uid());
create policy "escribir mis marcas" on public.game_marks for insert with check (
  owner = auth.uid()
  and exists (select 1 from public.games g where g.id = game_id and auth.uid() in (g.white_id, g.black_id))
);
create policy "editar mis marcas" on public.game_marks for update
  using (owner = auth.uid())
  with check (owner = auth.uid());
create policy "borrar mis marcas" on public.game_marks for delete using (owner = auth.uid());

create or replace function public.game_marks_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists game_marks_touch on public.game_marks;
create trigger game_marks_touch before insert or update on public.game_marks for each row execute function public.game_marks_touch();
