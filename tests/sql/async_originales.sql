-- Las funciones asíncronas TAL COMO están hoy en la base (13_asincronas.sql no está en el repositorio; copiadas el 2026-11-01).
alter table game_challenges add column if not exists async_days smallint;
CREATE OR REPLACE FUNCTION public.claim_async_forfeit(p_game_id uuid)
 RETURNS games LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_uid uuid := auth.uid(); g public.games%rowtype; v_color text; v_turn text; v_started timestamptz;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión'; end if;
  select * into g from public.games where id = p_game_id for update;
  if not found then raise exception 'Partida no encontrada'; end if;
  if v_uid = g.white_id then v_color := 'w'; elsif v_uid = g.black_id then v_color := 'b';
  else raise exception 'No eres jugador de esta partida'; end if;
  if g.status <> 'en_curso' or g.result is not null then return g; end if;
  if g.async_days is null then raise exception 'Esta partida no tiene plazo por jugada'; end if;
  v_turn := coalesce(nullif(split_part(coalesce(g.current_fen, ''), ' ', 2), ''),
    case when coalesce(g.ply_count, 0) % 2 = 0 then 'w' else 'b' end);
  if v_turn = v_color then raise exception 'Es tu turno: no puedes reclamar el plazo del rival'; end if;
  v_started := coalesce(g.turn_started_at, g.created_at);
  if now() < v_started + make_interval(days => g.async_days) then raise exception 'Todavía no vence el plazo'; end if;
  update public.games set status = 'finalizada', result = case when v_color = 'w' then '1-0' else '0-1' end, winner_id = v_uid
  where id = g.id returning * into g;
  return g;
end;
$function$;
CREATE OR REPLACE FUNCTION public.respond_async_challenge(p_challenge_id uuid, p_accept boolean)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_uid uuid := auth.uid(); v_days smallint; v_game uuid;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión'; end if;
  select async_days into v_days from public.game_challenges where id = p_challenge_id;
  execute format('select public.respond_challenge(p_challenge_id => %L::uuid, p_accept => %L::boolean)', p_challenge_id, p_accept) into v_game;
  if p_accept and v_game is not null and v_days is not null then
    update public.games set async_days = v_days, turn_started_at = now() where id = v_game;
  end if;
  return v_game;
end;
$function$;
grant execute on function public.claim_async_forfeit(uuid), public.respond_async_challenge(uuid, boolean) to authenticated;
