-- 28 · Convocatorias (2.210): citas para jugar una partida EN VIVO con otro miembro del Clan, con mensajes cortos atados a cada cita.
-- Se ejecuta DESPUÉS de 27_push.sql, en una sola ejecución del editor SQL. Se puede volver a ejecutar sin romper nada.
--
-- Cómo funciona
--   · Quien convoca elige a un miembro, el día y la hora (y, si quiere, variante y reloj) y escribe una nota. El otro responde «¡Va!» (aceptar),
--     «Otra hora» (contrapropuesta: la cita vuelve a quien convocó) o «No puedo» (rechazar). Cualquiera de los dos puede cancelar.
--   · Cada cita tiene un hilo de mensajes cortos (200 caracteres, 40 como máximo). NO hay buzón general: los mensajes solo existen dentro de una cita.
--   · LIMPIEZA (decisión de Arthur): los mensajes se BORRAN en cuanto la cita termina —se cumple la partida en vivo, se cancela, se rechaza o vence—.
--     La cita misma se borra un día después. conv_purgar() lo repasa todo (el cliente la llama al iniciar sesión) y, como red de seguridad, borra
--     cualquier mensaje de más de 7 días.
--   · Privacidad: cada quien ve solo sus citas y sus mensajes (RLS por funciones, el mismo patrón del resto del proyecto). No existe pantalla de
--     administración de mensajes. Quien administra la base puede leerlas desde el panel de Supabase, como cualquier tabla.
--   · Avisos push (tipo «citas», con su interruptor en La Armería): propuesta, respuesta, otra hora, cancelación y mensaje nuevo. Los textos no llevan
--     la hora (el servidor no sabe en qué zona horaria está cada quien): dicen «abre El Clan para ver día y hora».
--   · Los recordatorios («en 10 minutos») llegan en la ronda 2, con pg_cron.

-- 1) Preferencia de aviso «citas» y push_notify con ese tipo ------------------------------------------------------------
alter table public.push_prefs add column if not exists citas boolean not null default true;

create or replace function public.push_set_prefs(p_turno boolean, p_retos boolean, p_fin boolean, p_clan boolean, p_citas boolean)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  insert into push_prefs (user_id, turno, retos, fin, clan, citas)
    values (auth.uid(), coalesce(p_turno, true), coalesce(p_retos, true), coalesce(p_fin, true), coalesce(p_clan, true), coalesce(p_citas, true))
    on conflict (user_id) do update set turno = excluded.turno, retos = excluded.retos, fin = excluded.fin, clan = excluded.clan, citas = excluded.citas;
end $$;
revoke all on function public.push_set_prefs(boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.push_set_prefs(boolean, boolean, boolean, boolean, boolean) to authenticated;
-- (la versión de 4 parámetros de 27_push.sql se conserva: los clientes viejos siguen funcionando y no tocan «citas»)

create or replace function public.push_notify(p_user uuid, p_kind text, p_title_es text, p_body_es text, p_title_en text, p_body_en text, p_url text, p_tag text)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare c push_config%rowtype; pr push_prefs%rowtype; en boolean;
begin
  if p_user is null then return; end if;
  select * into pr from push_prefs where user_id = p_user;
  if not found then return; end if;                                              -- nunca activó las notificaciones
  if (p_kind = 'turno' and not pr.turno) or (p_kind = 'retos' and not pr.retos) or (p_kind = 'fin' and not pr.fin) or (p_kind = 'clan' and not pr.clan)
     or (p_kind = 'citas' and not pr.citas) then return; end if;
  if not exists (select 1 from push_subscriptions where user_id = p_user) then return; end if;
  if exists (select 1 from push_presence where user_id = p_user and seen_at > now() - interval '75 seconds') then return; end if;   -- está conectado: ya le llega el aviso flotante
  select * into c from push_config where id = 1;
  if not found or coalesce(c.url, '') = '' or coalesce(c.secret, '') in ('', 'PENDIENTE') then return; end if;
  en := pr.lang = 'en';
  perform net.http_post(
    url := c.url,
    body := jsonb_build_object('user_id', p_user, 'title', case when en then p_title_en else p_title_es end, 'body', case when en then p_body_en else p_body_es end, 'url', p_url, 'tag', p_tag),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || c.bearer, 'x-push-secret', c.secret)
  );
exception when others then null;   -- un fallo del aviso jamás debe afectar a lo que lo originó
end $$;
revoke all on function public.push_notify(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;

-- 2) Tablas -----------------------------------------------------------------------------------------------------------
create table if not exists public.convocatorias (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid not null references public.profiles(id) on delete cascade,       -- quien convocó
  invited_id  uuid not null references public.profiles(id) on delete cascade,       -- a quien se convoca
  proposed_by uuid not null references public.profiles(id) on delete cascade,       -- quien hizo la propuesta vigente (el otro es quien responde)
  starts_at   timestamptz not null,
  variant     game_variant,                                                          -- opcional
  time_initial   integer check (time_initial is null or time_initial between 0 and 10800),      -- reloj opcional (segundos)
  time_increment integer check (time_increment is null or time_increment between 0 and 300),
  note        text check (note is null or char_length(note) <= 200),
  status      text not null default 'propuesta' check (status in ('propuesta', 'pactada', 'en_juego', 'cumplida', 'rechazada', 'cancelada', 'vencida')),
  game_id     uuid references public.games(id) on delete set null,
  closed_by   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  closed_at   timestamptz,
  constraint no_autoconvocatoria check (created_by <> invited_id),
  constraint proponente_es_parte check (proposed_by in (created_by, invited_id))
);
create index if not exists convocatorias_creador_idx on public.convocatorias (created_by);
create index if not exists convocatorias_invitado_idx on public.convocatorias (invited_id);
create index if not exists convocatorias_estado_idx on public.convocatorias (status, starts_at);

create table if not exists public.convocatoria_mensajes (
  id              uuid primary key default gen_random_uuid(),
  convocatoria_id uuid not null references public.convocatorias(id) on delete cascade,
  author_id       uuid not null references public.profiles(id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 200),
  created_at      timestamptz not null default now()
);
create index if not exists convocatoria_mensajes_hilo_idx on public.convocatoria_mensajes (convocatoria_id, created_at);

-- 3) Seguridad: solo lectura por política; toda escritura pasa por las funciones de abajo ------------------------------
create or replace function public.conv_es_parte(p_id uuid) returns boolean
 language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from convocatorias where id = p_id and auth.uid() in (created_by, invited_id));
$$;
revoke all on function public.conv_es_parte(uuid) from public, anon;
grant execute on function public.conv_es_parte(uuid) to authenticated;

alter table public.convocatorias enable row level security;
alter table public.convocatoria_mensajes enable row level security;
revoke all on public.convocatorias, public.convocatoria_mensajes from anon, authenticated;
grant select on public.convocatorias, public.convocatoria_mensajes to authenticated;
drop policy if exists "veo mis convocatorias" on public.convocatorias;
create policy "veo mis convocatorias" on public.convocatorias for select using (auth.uid() in (created_by, invited_id));
drop policy if exists "veo los mensajes de mis convocatorias" on public.convocatoria_mensajes;
create policy "veo los mensajes de mis convocatorias" on public.convocatoria_mensajes for select using (public.conv_es_parte(convocatoria_id));

do $$ begin
  begin alter publication supabase_realtime add table public.convocatorias; exception when others then raise notice 'realtime convocatorias: %', sqlerrm; end;
  begin alter publication supabase_realtime add table public.convocatoria_mensajes; exception when others then raise notice 'realtime convocatoria_mensajes: %', sqlerrm; end;
end $$;

-- 4) Funciones que llama el cliente -----------------------------------------------------------------------------------
create or replace function public.conv_proponer(
  p_invited uuid, p_starts timestamptz, p_variant game_variant default null, p_ti integer default null, p_inc integer default null, p_note text default null
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then raise exception 'Inicia sesión.'; end if;
  if not is_club_member(v_uid) then raise exception 'Debes ser miembro del Clan.'; end if;
  if p_invited is null or not is_club_member(p_invited) then raise exception 'Ese jugador no es miembro del Clan.'; end if;
  if p_invited = v_uid then raise exception 'No puedes convocarte a ti mismo.'; end if;
  if p_starts is null or p_starts < now() + interval '1 minute' then raise exception 'La hora tiene que ser futura.'; end if;
  if p_starts > now() + interval '60 days' then raise exception 'La hora no puede pasar de 60 días.'; end if;
  if v_note is not null and char_length(v_note) > 200 then raise exception 'La nota es demasiado larga (200 caracteres como máximo).'; end if;
  if (select count(*) from convocatorias where created_by = v_uid and status in ('propuesta', 'pactada', 'en_juego')) >= 8 then
    raise exception 'Ya tienes muchas convocatorias abiertas. Cierra alguna antes de crear otra.';
  end if;
  if (select count(*) from convocatorias where status in ('propuesta', 'pactada', 'en_juego')
        and ((created_by = v_uid and invited_id = p_invited) or (created_by = p_invited and invited_id = v_uid))) >= 3 then
    raise exception 'Ya hay varias convocatorias abiertas con ese jugador.';
  end if;
  insert into convocatorias (created_by, invited_id, proposed_by, starts_at, variant, time_initial, time_increment, note)
    values (v_uid, p_invited, v_uid, p_starts, p_variant, p_ti, p_inc, v_note) returning id into v_id;
  return v_id;
end $$;

create or replace function public.conv_responder(p_id uuid, p_accion text, p_starts timestamptz default null, p_note text default null)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); c convocatorias%rowtype; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then raise exception 'Inicia sesión.'; end if;
  select * into c from convocatorias where id = p_id for update;
  if not found or v_uid not in (c.created_by, c.invited_id) then raise exception 'Convocatoria no encontrada.'; end if;
  if c.status <> 'propuesta' then raise exception 'Esta convocatoria ya no espera respuesta.'; end if;
  if c.proposed_by = v_uid then raise exception 'La última propuesta es tuya: espera la respuesta del otro.'; end if;
  if p_accion = 'aceptar' then
    if c.starts_at < now() then raise exception 'La hora propuesta ya pasó. Propón otra.'; end if;
    update convocatorias set status = 'pactada' where id = c.id;
  elsif p_accion = 'otra' then
    if p_starts is null or p_starts < now() + interval '1 minute' then raise exception 'La hora tiene que ser futura.'; end if;
    if p_starts > now() + interval '60 days' then raise exception 'La hora no puede pasar de 60 días.'; end if;
    if v_note is not null and char_length(v_note) > 200 then raise exception 'La nota es demasiado larga (200 caracteres como máximo).'; end if;
    update convocatorias set starts_at = p_starts, proposed_by = v_uid, note = coalesce(v_note, note) where id = c.id;
  elsif p_accion = 'rechazar' then
    update convocatorias set status = 'rechazada', closed_by = v_uid where id = c.id;
  else
    raise exception 'Acción inválida.';
  end if;
end $$;

create or replace function public.conv_cancelar(p_id uuid) returns void
 language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); c convocatorias%rowtype;
begin
  if v_uid is null then raise exception 'Inicia sesión.'; end if;
  select * into c from convocatorias where id = p_id for update;
  if not found or v_uid not in (c.created_by, c.invited_id) then raise exception 'Convocatoria no encontrada.'; end if;
  if c.status not in ('propuesta', 'pactada') then raise exception 'Esta convocatoria ya no se puede cancelar.'; end if;
  update convocatorias set status = 'cancelada', closed_by = v_uid where id = c.id;
end $$;

create or replace function public.conv_mensaje(p_id uuid, p_texto text) returns uuid
 language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); c convocatorias%rowtype; v_txt text := btrim(coalesce(p_texto, '')); v_id uuid;
begin
  if v_uid is null then raise exception 'Inicia sesión.'; end if;
  select * into c from convocatorias where id = p_id;
  if not found or v_uid not in (c.created_by, c.invited_id) then raise exception 'Convocatoria no encontrada.'; end if;
  if c.status not in ('propuesta', 'pactada') then raise exception 'Esta convocatoria ya no admite mensajes.'; end if;
  if v_txt = '' then raise exception 'Escribe algo.'; end if;
  if char_length(v_txt) > 200 then raise exception 'El mensaje es demasiado largo (200 caracteres como máximo).'; end if;
  if (select count(*) from convocatoria_mensajes where convocatoria_id = p_id) >= 40 then raise exception 'El hilo ya está lleno (40 mensajes).'; end if;
  insert into convocatoria_mensajes (convocatoria_id, author_id, body) values (p_id, v_uid, v_txt) returning id into v_id;
  return v_id;
end $$;

-- ¿tiene ese miembro las notificaciones de citas activas? (para avisar al convocar: «aún no activó los avisos»)
create or replace function public.conv_avisos_activos(p_user uuid) returns boolean
 language sql stable security definer set search_path to 'public' as $$
  select is_club_member(auth.uid()) and is_club_member(p_user)
     and exists (select 1 from push_subscriptions where user_id = p_user)
     and coalesce((select citas from push_prefs where user_id = p_user), false);
$$;

-- Limpieza: vence lo que ya pasó, borra mensajes de citas cerradas (y cualquiera de más de 7 días) y las citas cerradas hace más de un día.
create or replace function public.conv_purgar() returns void
 language plpgsql security definer set search_path to 'public' as $$
begin
  update convocatorias set status = 'vencida' where status = 'propuesta' and starts_at < now();
  update convocatorias set status = 'vencida' where status = 'pactada' and starts_at + interval '3 hours' < now();
  update convocatorias set status = 'vencida' where status = 'en_juego' and updated_at < now() - interval '2 days';
  delete from convocatoria_mensajes m using convocatorias c
    where c.id = m.convocatoria_id and c.status in ('cumplida', 'rechazada', 'cancelada', 'vencida');
  delete from convocatoria_mensajes where created_at < now() - interval '7 days';
  delete from convocatorias where status in ('cumplida', 'rechazada', 'cancelada', 'vencida') and closed_at < now() - interval '1 day';
end $$;

revoke all on function public.conv_proponer(uuid, timestamptz, game_variant, integer, integer, text), public.conv_responder(uuid, text, timestamptz, text),
  public.conv_cancelar(uuid), public.conv_mensaje(uuid, text), public.conv_avisos_activos(uuid), public.conv_purgar() from public, anon;
grant execute on function public.conv_proponer(uuid, timestamptz, game_variant, integer, integer, text), public.conv_responder(uuid, text, timestamptz, text),
  public.conv_cancelar(uuid), public.conv_mensaje(uuid, text), public.conv_avisos_activos(uuid), public.conv_purgar() to authenticated;

-- 5) Disparadores -----------------------------------------------------------------------------------------------------

-- 5a) Al cerrarse una cita (cumplida, rechazada, cancelada o vencida) se borran SUS MENSAJES en el mismo instante.
create or replace function public.conv_trg_antes() returns trigger
 language plpgsql security definer set search_path to 'public' as $$
begin
  new.updated_at := now();
  if new.status in ('cumplida', 'rechazada', 'cancelada', 'vencida') and old.status not in ('cumplida', 'rechazada', 'cancelada', 'vencida') then
    new.closed_at := coalesce(new.closed_at, now());
    delete from convocatoria_mensajes where convocatoria_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists conv_antes on public.convocatorias;
create trigger conv_antes before update on public.convocatorias for each row execute function public.conv_trg_antes();

-- 5b) Una partida EN VIVO entre los dos que empieza cerca de la hora pactada es «la» partida de la cita; al terminar, la cita se cumple.
create or replace function public.conv_trg_games_ins() returns trigger
 language plpgsql security definer set search_path to 'public' as $$
begin
  if new.async_days is not null or new.white_id is null or new.black_id is null then return null; end if;
  update convocatorias set status = 'en_juego', game_id = new.id
   where status = 'pactada'
     and ((created_by = new.white_id and invited_id = new.black_id) or (created_by = new.black_id and invited_id = new.white_id))
     and starts_at between now() - interval '3 hours' and now() + interval '30 minutes';
  return null;
exception when others then return null;   -- jamás debe romper el inicio de una partida
end $$;
drop trigger if exists conv_games_ins on public.games;
create trigger conv_games_ins after insert on public.games for each row execute function public.conv_trg_games_ins();

create or replace function public.conv_trg_games_fin() returns trigger
 language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status::text in ('finalizada', 'abandonada') and old.status::text not in ('finalizada', 'abandonada') then
    update convocatorias set status = 'cumplida' where game_id = new.id and status = 'en_juego';
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists conv_games_fin on public.games;
create trigger conv_games_fin after update of status on public.games for each row when (new.status is distinct from old.status) execute function public.conv_trg_games_fin();

-- 5c) Avisos push
create or replace function public.conv_trg_push() returns trigger
 language plpgsql security definer set search_path to 'public' as $$
declare otro uuid; nm text; v_es text := ''; v_en text := ''; url text := '/?panel=clan&tab=convocatorias';
begin
  if tg_op = 'INSERT' then
    if new.variant is not null then v_es := ' de ' || push_variant(new.variant::text, 'es'); v_en := ' of ' || push_variant(new.variant::text, 'en'); end if;
    nm := push_name(new.created_by);
    perform push_notify(new.invited_id, 'citas', '⚔ Una convocatoria',
      nm || ' te convoca a una batalla' || v_es || '. Abre El Clan para ver día y hora y responder.',
      '⚔ A summons', nm || ' summons you to a battle' || v_en || '. Open the Clan to see the day and time and reply.',
      url, 'conv-' || new.id);
  elsif old.status = 'propuesta' and new.status = 'pactada' then
    otro := case when old.proposed_by = new.created_by then new.invited_id else new.created_by end;   -- quien aceptó
    nm := push_name(otro);
    perform push_notify(old.proposed_by, 'citas', '⚔ ¡Va!', nm || ' aceptó la convocatoria. La batalla queda pactada.',
      '⚔ It is on!', nm || ' accepted the summons. The battle is set.', url, 'conv-' || new.id);
  elsif old.status = 'propuesta' and new.status = 'rechazada' then
    otro := case when old.proposed_by = new.created_by then new.invited_id else new.created_by end;
    nm := push_name(otro);
    perform push_notify(old.proposed_by, 'citas', '⚔ Esta vez no', nm || ' no puede en esa hora. La convocatoria se cerró.',
      '⚔ Not this time', nm || ' cannot make it. The summons was closed.', url, 'conv-' || new.id);
  elsif old.status = 'propuesta' and new.status = 'propuesta' and new.proposed_by is distinct from old.proposed_by then
    otro := case when new.proposed_by = new.created_by then new.invited_id else new.created_by end;   -- a quien le toca responder ahora
    nm := push_name(new.proposed_by);
    perform push_notify(otro, 'citas', '⚔ Otra hora', nm || ' propone otra hora para la batalla. Respóndele en El Clan.',
      '⚔ Another time', nm || ' proposes another time for the battle. Reply in the Clan.', url, 'conv-' || new.id);
  elsif new.status = 'cancelada' and old.status in ('propuesta', 'pactada') and new.closed_by is not null then
    otro := case when new.closed_by = new.created_by then new.invited_id else new.created_by end;
    nm := push_name(new.closed_by);
    perform push_notify(otro, 'citas', '⚔ Convocatoria cancelada', nm || ' canceló la convocatoria.',
      '⚔ Summons cancelled', nm || ' cancelled the summons.', url, 'conv-' || new.id);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists conv_push_ins on public.convocatorias;
create trigger conv_push_ins after insert on public.convocatorias for each row execute function public.conv_trg_push();
drop trigger if exists conv_push_upd on public.convocatorias;
create trigger conv_push_upd after update on public.convocatorias for each row execute function public.conv_trg_push();

create or replace function public.conv_trg_push_msg() returns trigger
 language plpgsql security definer set search_path to 'public' as $$
declare c convocatorias%rowtype; otro uuid; nm text;
begin
  select * into c from convocatorias where id = new.convocatoria_id;
  if not found then return null; end if;
  otro := case when new.author_id = c.created_by then c.invited_id else c.created_by end;
  nm := push_name(new.author_id);
  perform push_notify(otro, 'citas', '✉ Un mensaje', nm || ' te escribió sobre vuestra batalla. Ábrelo en El Clan.',
    '✉ A message', nm || ' wrote to you about your battle. Open it in the Clan.', '/?panel=clan&tab=convocatorias', 'conv-msg-' || new.convocatoria_id);
  return null;
exception when others then return null;
end $$;
drop trigger if exists conv_push_msg on public.convocatoria_mensajes;
create trigger conv_push_msg after insert on public.convocatoria_mensajes for each row execute function public.conv_trg_push_msg();
