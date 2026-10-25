-- 23 · Reloj y entrada a la batalla (2.139)
-- Se ejecuta en el editor SQL de Supabase (una sola vez; se puede repetir sin daño).
--
-- Al empezar una partida en línea con reloj, las blancas ven la entrada a la batalla (humo y frase, ~10 s) y el reloj del servidor ya corre
-- desde que se creó la partida: perderían esos segundos sin poder mover. Esta función deja que las BLANCAS (y solo ellas) reinicien su
-- reloj UNA sola vez, justo cuando termina o saltan la entrada. Para que no se pueda abusar:
--  · solo las blancas, solo con la partida en curso, sin jugadas, sin pausa y con reloj;
--  · una sola vez por partida (columna clock_entry_done);
--  · solo si han pasado menos de 45 s desde que empezó el turno: más tarde el tiempo perdido es suyo, como siempre.
-- Si la función no existe (esta migración sin correr), el cliente lo ignora y todo sigue como antes.

alter table public.games add column if not exists clock_entry_done boolean not null default false;

create or replace function public.clock_entry_start(p_game_id uuid) returns public.games
 language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  g     public.games%rowtype;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión'; end if;
  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'Partida no encontrada'; end if;
  if v_uid <> g.white_id and v_uid <> g.black_id then raise exception 'No eres jugador de esta partida'; end if;
  if v_uid <> g.white_id then return g; end if;
  if g.status <> 'en_curso' or g.result is not null or g.paused_by is not null or g.ply_count <> 0
     or g.clock_entry_done or g.turn_started_at is null or g.time_control_initial_seconds is null then
    return g;
  end if;
  if g.variant = 'dark' then perform set_config('tablero.dark_writer', '1', true); end if;
  if now() - g.turn_started_at > interval '45 seconds' then
    update public.games set clock_entry_done = true where id = g.id returning * into g;   -- tarde: no hay compensación, y no se reintenta
    return g;
  end if;
  update public.games set turn_started_at = now(), clock_entry_done = true where id = g.id returning * into g;
  return g;
end $$;
revoke all on function public.clock_entry_start(uuid) from public, anon;
grant execute on function public.clock_entry_start(uuid) to authenticated;
