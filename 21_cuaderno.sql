-- 21 · Cuaderno de anotaciones (2.126)
-- Se ejecuta en el editor SQL de Supabase (una sola vez; se puede repetir sin daño).
--
-- Cada jugador tiene SU cuaderno por partida: una nota general (ply = 0) y una nota por jugada (ply = n). Es PRIVADO: solo el dueño lo
-- lee o lo escribe; el rival no puede verlo ni siquiera terminada la partida. Una partida que se borra se lleva sus notas.
-- No pasa por el árbitro ni toca la partida: en Dark no puede delatar nada, porque el servidor no manda a nadie más que sus propias notas.

create table if not exists public.game_notes (
  game_id    uuid        not null references public.games(id) on delete cascade,
  owner      uuid        not null default auth.uid(),
  ply        integer     not null check (ply between 0 and 1000),   -- 0 = nota general de la partida
  body       text        not null check (char_length(body) between 1 and 4000),
  updated_at timestamptz not null default now(),
  primary key (game_id, owner, ply)
);

alter table public.game_notes enable row level security;
revoke all on public.game_notes from anon, authenticated;
grant select, insert, update, delete on public.game_notes to authenticated;

drop policy if exists "ver mis notas"      on public.game_notes;
drop policy if exists "escribir mis notas" on public.game_notes;
drop policy if exists "editar mis notas"   on public.game_notes;
drop policy if exists "borrar mis notas"   on public.game_notes;

create policy "ver mis notas" on public.game_notes for select using (owner = auth.uid());

-- Solo se escribe en partidas propias (la política de «games» ya limita esta subconsulta a las partidas donde juegas).
create policy "escribir mis notas" on public.game_notes for insert with check (
  owner = auth.uid()
  and exists (select 1 from public.games g where g.id = game_id and auth.uid() in (g.white_id, g.black_id))
);
create policy "editar mis notas" on public.game_notes for update
  using (owner = auth.uid())
  with check (owner = auth.uid());
create policy "borrar mis notas" on public.game_notes for delete using (owner = auth.uid());

-- Tope por partida y jugador (que nadie llene la base desde la consola): 400 notas.
create or replace function public.game_notes_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.game_notes where game_id = new.game_id and owner = new.owner) >= 400 then
    raise exception 'Demasiadas notas en esta partida.';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists game_notes_guard on public.game_notes;
create trigger game_notes_guard before insert or update on public.game_notes for each row execute function public.game_notes_guard();
