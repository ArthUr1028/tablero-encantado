-- 27 · Notificaciones push (2.200)
-- Se ejecuta DESPUÉS de 18_dark.sql … 26_dark_asincrona.sql, en una sola ejecución del editor SQL.
--
-- Cómo funciona: los disparadores de abajo (en games, game_challenges, club_pending y tournaments) deciden A QUIÉN y QUÉ avisar y llaman a
-- push_notify(), que revisa tus preferencias, que tengas el dispositivo suscrito y que NO estés conectado ahora (latido de presencia de 75 s),
-- y entonces pide a la Edge Function «send-push» (vía pg_net) que mande el Web Push. Ningún disparador puede romper una jugada: todos atrapan sus errores.
-- Nada secreto vive en este archivo (el repositorio es público): la contraseña de la función se guarda aparte en push_config (ver el final).
-- Privacidad en Dark Chess: los textos solo dicen que movió el rival y de quién es el turno; nunca casillas, piezas ni capturas.

do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net: %', sqlerrm; end $$;

-- 1) Tablas ---------------------------------------------------------------------------------------------------------
create table if not exists public.push_config (          -- una sola fila; nadie con sesión la lee
  id     int primary key default 1 check (id = 1),
  url    text not null,
  secret text not null,
  bearer text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
drop policy if exists "ver mis suscripciones" on public.push_subscriptions;
create policy "ver mis suscripciones" on public.push_subscriptions for select using (user_id = auth.uid());

create table if not exists public.push_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  turno   boolean not null default true,
  retos   boolean not null default true,
  fin     boolean not null default true,
  clan    boolean not null default true,
  lang    text    not null default 'es' check (lang in ('es', 'en'))
);
alter table public.push_prefs enable row level security;
revoke all on public.push_prefs from anon, authenticated;
grant select on public.push_prefs to authenticated;
drop policy if exists "ver mis preferencias" on public.push_prefs;
create policy "ver mis preferencias" on public.push_prefs for select using (user_id = auth.uid());

create table if not exists public.push_presence (          -- «está conectado ahora» (latido cada ~45 s con el Tablero a la vista)
  user_id uuid primary key references public.profiles(id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.push_presence enable row level security;
revoke all on public.push_presence from anon, authenticated;

-- 2) Funciones que llama el cliente (cada quien solo toca lo suyo) ---------------------------------------------------
create or replace function public.push_register(p_endpoint text, p_p256dh text, p_auth text, p_lang text default 'es')
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then raise exception 'Suscripción incompleta.'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;   -- si en este aparato entra otra cuenta, el aparato pasa a ella
  insert into push_prefs (user_id, lang) values (auth.uid(), case when p_lang = 'en' then 'en' else 'es' end)
    on conflict (user_id) do update set lang = excluded.lang;
end $$;

create or replace function public.push_unregister(p_endpoint text)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then return; end if;
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;

create or replace function public.push_set_prefs(p_turno boolean, p_retos boolean, p_fin boolean, p_clan boolean)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión.'; end if;
  insert into push_prefs (user_id, turno, retos, fin, clan) values (auth.uid(), coalesce(p_turno, true), coalesce(p_retos, true), coalesce(p_fin, true), coalesce(p_clan, true))
    on conflict (user_id) do update set turno = excluded.turno, retos = excluded.retos, fin = excluded.fin, clan = excluded.clan;
end $$;

create or replace function public.push_heartbeat()
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then return; end if;
  insert into push_presence (user_id, seen_at) values (auth.uid(), now())
    on conflict (user_id) do update set seen_at = excluded.seen_at;
end $$;
revoke all on function public.push_register(text, text, text, text), public.push_unregister(text), public.push_set_prefs(boolean, boolean, boolean, boolean), public.push_heartbeat() from public, anon;
grant execute on function public.push_register(text, text, text, text), public.push_unregister(text), public.push_set_prefs(boolean, boolean, boolean, boolean), public.push_heartbeat() to authenticated;

-- 3) Ayudantes internos (nadie con sesión los ejecuta) ----------------------------------------------------------------
create or replace function public.push_name(p_id uuid) returns text
 language sql stable security definer set search_path to 'public' as $$
  select coalesce(nullif(display_name, ''), nullif(username, ''), 'Alguien') from profiles where id = p_id;
$$;
create or replace function public.push_variant(p_v text, p_lang text) returns text
 language sql immutable as $$
  select case p_v
    when 'clasico' then case when p_lang = 'en' then 'Classic' else 'Clásico' end
    when 'maharaja' then case when p_lang = 'en' then 'Maharaja' else 'Maharajá' end
    when 'capablanca' then 'Capablanca' when 'amazonas' then 'Amazonas' when 'shatranj' then 'Shatranj'
    when 'seirawan' then 'Seirawan' when 'dark' then 'Dark Chess' else p_v end;
$$;

create or replace function public.push_notify(p_user uuid, p_kind text, p_title_es text, p_body_es text, p_title_en text, p_body_en text, p_url text, p_tag text)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare c push_config%rowtype; pr push_prefs%rowtype; en boolean;
begin
  if p_user is null then return; end if;
  select * into pr from push_prefs where user_id = p_user;
  if not found then return; end if;                                              -- nunca activó las notificaciones
  if (p_kind = 'turno' and not pr.turno) or (p_kind = 'retos' and not pr.retos) or (p_kind = 'fin' and not pr.fin) or (p_kind = 'clan' and not pr.clan) then return; end if;
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
exception when others then null;   -- un fallo del aviso jamás debe afectar a la jugada que lo originó
end $$;
revoke all on function public.push_notify(uuid, text, text, text, text, text, text, text), public.push_name(uuid), public.push_variant(text, text) from public, anon, authenticated;

-- 4) Disparadores -----------------------------------------------------------------------------------------------------

-- 4a) games: «es tu turno» y fin de partida
create or replace function public.push_trg_games() returns trigger
 language plpgsql security definer set search_path to 'public' as $$
declare t text; mover uuid; opp uuid; actor uuid; p uuid; q uuid; nm text; asinc boolean; url text;
begin
  url := '/?partida=' || new.id;
  asinc := new.async_days is not null;
  -- Turno: subió ply_count y la partida sigue. En Dark el FEN público no avanza: el turno sale de la paridad (como en el cliente).
  if new.status = 'en_curso' and coalesce(new.ply_count, 0) > coalesce(old.ply_count, 0) then
    t := case when new.variant::text <> 'dark' and split_part(coalesce(new.current_fen, ''), ' ', 2) in ('w', 'b') then split_part(new.current_fen, ' ', 2)
              when coalesce(new.ply_count, 0) % 2 = 0 then 'w' else 'b' end;
    mover := case when t = 'w' then new.white_id else new.black_id end;
    opp   := case when t = 'w' then new.black_id else new.white_id end;
    nm := push_name(opp);
    perform push_notify(mover, 'turno',
      '♞ Es tu turno', nm || ' ha movido: la partida ' || case when asinc then 'asíncrona ' else '' end || 'aguarda tu respuesta.',
      '♞ It is your turn', nm || ' has moved: your ' || case when asinc then 'correspondence ' else '' end || 'game awaits your reply.',
      url, 'turno-' || new.id);
  end if;
  -- Fin: la partida pasó a terminada. Se avisa a quien NO la terminó (quien la terminó ya lo sabe).
  if new.status in ('finalizada', 'abandonada') and old.status not in ('finalizada', 'abandonada') then
    actor := case when auth.uid() in (new.white_id, new.black_id) then auth.uid()
                  when new.winner_id is not null then new.winner_id else null end;
    foreach p in array array[new.white_id, new.black_id] loop
      continue when p is null or p is not distinct from actor;
      q := case when p = new.white_id then new.black_id else new.white_id end;
      nm := push_name(q);
      if new.result = '1/2-1/2' then
        perform push_notify(p, 'fin', '⚔ La contienda ha terminado', 'La partida contra ' || nm || ' terminó en tablas.',
          '⚔ The contest is over', 'Your game against ' || nm || ' ended in a draw.', url, 'fin-' || new.id);
      elsif new.winner_id = p then
        perform push_notify(p, 'fin', '⚔ La contienda ha terminado',
          case when new.status = 'abandonada' then nm || ' se rindió. La victoria es tuya.' else 'La partida contra ' || nm || ' ha terminado. La victoria es tuya.' end,
          '⚔ The contest is over',
          case when new.status = 'abandonada' then nm || ' resigned. Victory is yours.' else 'Your game against ' || nm || ' is over. Victory is yours.' end, url, 'fin-' || new.id);
      else
        perform push_notify(p, 'fin', '⚔ La contienda ha terminado', 'La partida contra ' || nm || ' ha terminado. Esta vez la derrota es tuya.',
          '⚔ The contest is over', 'Your game against ' || nm || ' is over. This time the defeat is yours.', url, 'fin-' || new.id);
      end if;
    end loop;
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists push_games on public.games;
create trigger push_games after update on public.games for each row
  when (new.ply_count is distinct from old.ply_count or new.status is distinct from old.status)
  execute function public.push_trg_games();

-- 4b) game_challenges: reto recibido y reto aceptado (los de torneo se anuncian con el inicio del torneo)
create or replace function public.push_trg_challenges() returns trigger
 language plpgsql security definer set search_path to 'public' as $$
declare nm text; w uuid; asinc boolean; col_es text := ''; col_en text := '';
begin
  if new.tournament_match_id is not null then return null; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pendiente' then return null; end if;
    nm := push_name(new.created_by);
    perform push_notify(new.invited_id, 'retos', '⚔ Te han desafiado',
      nm || ' te desafía a una partida de ' || push_variant(new.variant::text, 'es') || '. ¿Aceptarás el desafío?',
      '⚔ You have been challenged', nm || ' challenges you to a game of ' || push_variant(new.variant::text, 'en') || '. Will you accept?',
      '/?panel=clan', 'reto-' || new.id);
  elsif old.status = 'pendiente' and new.status = 'aceptado' then
    nm := push_name(new.invited_id);
    asinc := new.async_days is not null;
    if new.game_id is not null then
      select white_id into w from games where id = new.game_id;
      if w = new.created_by then col_es := ' Llevas las blancas: es tu turno.'; col_en := ' You have White: it is your turn.';
      elsif w is not null then col_es := ' Llevas las negras: ' || nm || ' mueve primero.'; col_en := ' You have Black: ' || nm || ' moves first.'; end if;
    end if;
    perform push_notify(new.created_by, 'retos', '⚔ Tu reto fue aceptado',
      nm || ' ha aceptado tu reto' || case when asinc then ' asíncrono' else '' end || '.' || col_es,
      '⚔ Your challenge was accepted', nm || ' has accepted your ' || case when asinc then 'correspondence ' else '' end || 'challenge.' || col_en,
      case when new.game_id is not null then '/?partida=' || new.game_id else '/?panel=clan' end, 'reto-' || new.id);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists push_challenges_ins on public.game_challenges;
create trigger push_challenges_ins after insert on public.game_challenges for each row execute function public.push_trg_challenges();
drop trigger if exists push_challenges_upd on public.game_challenges;
create trigger push_challenges_upd after update of status on public.game_challenges for each row when (new.status is distinct from old.status) execute function public.push_trg_challenges();

-- 4c) Clan: alguien pide entrar (se avisa a quien debe confirmarlo)
create or replace function public.push_trg_pending() returns trigger
 language plpgsql security definer set search_path to 'public' as $$
declare nm text;
begin
  if new.invited_by is null then return null; end if;
  nm := push_name(new.profile_id);
  perform push_notify(new.invited_by, 'clan', '🛡 Alguien llama a la puerta del Clan', nm || ' pide entrar al Clan. Confírmalo en El Clan.',
    '🛡 Someone knocks at the Clan''s gate', nm || ' asks to enter the Clan. Confirm it in The Clan.', '/?panel=clan', 'clan-pend-' || new.profile_id);
  return null;
exception when others then return null;
end $$;
drop trigger if exists push_pending on public.club_pending;
create trigger push_pending after insert on public.club_pending for each row execute function public.push_trg_pending();

-- 4d) Torneos: empezó
create or replace function public.push_trg_tournaments() returns trigger
 language plpgsql security definer set search_path to 'public' as $$
declare p uuid;
begin
  if not (old.status = 'inscripciones' and new.status = 'en_curso') then return null; end if;
  for p in select profile_id from tournament_participants where tournament_id = new.id loop
    continue when p is not distinct from auth.uid();
    perform push_notify(p, 'clan', '🏆 El torneo ha comenzado', 'El torneo «' || new.name || '» ha comenzado. Tus partidas te esperan en El Clan.',
      '🏆 The tournament has begun', 'The tournament «' || new.name || '» has begun. Your games await you in The Clan.', '/?panel=clan', 'torneo-' || new.id);
  end loop;
  return null;
exception when others then return null;
end $$;
drop trigger if exists push_tournaments on public.tournaments;
create trigger push_tournaments after update of status on public.tournaments for each row when (new.status is distinct from old.status) execute function public.push_trg_tournaments();

-- 5) Configuración de la función (SIN secretos) -----------------------------------------------------------------------
-- La llave pública (anon) ya está en el index.html; la contraseña queda en «PENDIENTE» hasta que la pongas tú con el UPDATE de abajo.
insert into public.push_config (id, url, secret, bearer) values (1,
  'https://imlnszpxeovtvuzrkbkc.supabase.co/functions/v1/send-push', 'PENDIENTE',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltbG5zenB4ZW92dHZ1enJrYmtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMjcyMTIsImV4cCI6MjEwNTcwMzIxMn0.VxuQvmF0NnD2FjUdV8p1YEbf7EBDsuYmDpEtp_Tzia8')
on conflict (id) do nothing;
