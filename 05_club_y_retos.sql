-- ============================================================
-- El Tablero Encantado — Fase 2, paso 3: club y retos directos
-- Correr completo en el SQL Editor de Supabase (proyecto tablero-encantado).
-- ============================================================

-- 1) Unirse al club con un código de invitación.
create or replace function public.redeem_invite(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite club_invites%rowtype;
begin
  if is_club_member(auth.uid()) then
    raise exception 'Ya eres miembro del club.';
  end if;

  select * into v_invite from club_invites where code = p_code for update;
  if not found then
    raise exception 'Ese código no existe.';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'Ese código ya venció.';
  end if;
  if v_invite.uses >= v_invite.max_uses then
    raise exception 'Ese código ya se usó el máximo de veces.';
  end if;

  insert into club_members (profile_id, joined_at, invite_code)
  values (auth.uid(), now(), p_code);

  update club_invites set uses = uses + 1 where code = p_code;
end;
$$;

-- 2) Generar un código de invitación (solo miembros existentes pueden invitar).
create or replace function public.create_invite(p_max_uses integer default 5, p_expires_days integer default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not is_club_member(auth.uid()) then
    raise exception 'Solo un miembro del club puede invitar.';
  end if;
  if p_max_uses < 1 or p_max_uses > 100 then
    raise exception 'max_uses fuera de rango.';
  end if;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  insert into club_invites (code, created_by, max_uses, uses, expires_at, created_at)
  values (
    v_code,
    auth.uid(),
    p_max_uses,
    0,
    case when p_expires_days is null then null else now() + (p_expires_days || ' days')::interval end,
    now()
  );

  return v_code;
end;
$$;

grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.create_invite(integer, integer) to authenticated;

-- 3) Tabla de retos directos entre miembros del club.
create table if not exists public.game_challenges (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  invited_id uuid not null references public.profiles(id),
  variant game_variant not null,
  mode game_mode not null default 'tiempo_real',
  creator_color text not null check (creator_color in ('blancas','negras','aleatorio')),
  time_control_initial_seconds integer,
  time_control_increment_seconds integer,
  status text not null default 'pendiente' check (status in ('pendiente','aceptado','rechazado','cancelado')),
  game_id uuid references public.games(id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_autorreto check (created_by <> invited_id)
);

alter table public.game_challenges enable row level security;

-- Solo SELECT vía política; todo INSERT/UPDATE pasa por las funciones de
-- abajo (mismo patrón que evitó la recursión de club_members: nunca RLS
-- de escritura directa sobre estas tablas).
drop policy if exists "veo mis retos, enviados o recibidos" on public.game_challenges;
create policy "veo mis retos, enviados o recibidos"
  on public.game_challenges for select
  using (auth.uid() = created_by or auth.uid() = invited_id);

-- 4) Enviar un reto.
create or replace function public.send_challenge(
  p_invited_id uuid,
  p_variant game_variant,
  p_creator_color text,
  p_time_initial integer default null,
  p_time_increment integer default null,
  p_mode game_mode default 'tiempo_real'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_club_member(auth.uid()) then
    raise exception 'Debes ser miembro del club para retar.';
  end if;
  if not is_club_member(p_invited_id) then
    raise exception 'Ese jugador no es miembro del club.';
  end if;
  if auth.uid() = p_invited_id then
    raise exception 'No puedes retarte a ti mismo.';
  end if;
  if p_creator_color not in ('blancas','negras','aleatorio') then
    raise exception 'Color inválido.';
  end if;

  insert into game_challenges (created_by, invited_id, variant, mode, creator_color,
    time_control_initial_seconds, time_control_increment_seconds)
  values (auth.uid(), p_invited_id, p_variant, p_mode, p_creator_color, p_time_initial, p_time_increment)
  returning id into v_id;

  return v_id;
end;
$$;

-- 5) Responder a un reto (aceptar crea la partida; rechazar solo lo cierra).
create or replace function public.respond_challenge(p_challenge_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ch game_challenges%rowtype;
  v_white uuid;
  v_black uuid;
  v_fen text;
  v_game_id uuid;
  v_coin boolean;
  v_time_ms bigint;
begin
  select * into v_ch from game_challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Ese reto no existe.';
  end if;
  if v_ch.invited_id <> auth.uid() then
    raise exception 'Este reto no es tuyo.';
  end if;
  if v_ch.status <> 'pendiente' then
    raise exception 'Este reto ya fue respondido.';
  end if;

  if not p_accept then
    update game_challenges set status = 'rechazado', responded_at = now() where id = p_challenge_id;
    return null;
  end if;

  v_coin := random() < 0.5;
  if v_ch.creator_color = 'blancas' or (v_ch.creator_color = 'aleatorio' and v_coin) then
    v_white := v_ch.created_by; v_black := v_ch.invited_id;
  else
    v_white := v_ch.invited_id; v_black := v_ch.created_by;
  end if;

  v_fen := case v_ch.variant
    when 'clasico' then 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    when 'capablanca' then 'rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1'
    when 'maharaja' then 'rnbqkbnr/pppppppp/8/8/8/8/8/4M3 w kq - 0 1'
    when 'amazonas' then 'rnbmkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBMKBNR w KQkq - 0 1'
  end;

  v_time_ms := case when v_ch.time_control_initial_seconds is null then null
                     else v_ch.time_control_initial_seconds::bigint * 1000 end;

  insert into games (variant, mode, status, white_id, black_id, current_fen, ply_count,
    time_control_initial_seconds, time_control_increment_seconds,
    white_time_left_ms, black_time_left_ms, turn_started_at, created_at, updated_at)
  values (v_ch.variant, v_ch.mode, 'en_curso', v_white, v_black, v_fen, 0,
    v_ch.time_control_initial_seconds, v_ch.time_control_increment_seconds,
    v_time_ms, v_time_ms, now(), now(), now())
  returning id into v_game_id;

  update game_challenges set status = 'aceptado', responded_at = now(), game_id = v_game_id where id = p_challenge_id;

  return v_game_id;
end;
$$;

-- 6) Cancelar un reto propio todavía pendiente.
create or replace function public.cancel_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update game_challenges
  set status = 'cancelado', responded_at = now()
  where id = p_challenge_id and created_by = auth.uid() and status = 'pendiente';

  if not found then
    raise exception 'No se pudo cancelar (no es tuyo o ya fue respondido).';
  end if;
end;
$$;

grant execute on function public.send_challenge(uuid, game_variant, text, integer, integer, game_mode) to authenticated;
grant execute on function public.respond_challenge(uuid, boolean) to authenticated;
grant execute on function public.cancel_challenge(uuid) to authenticated;

-- ============================================================
-- Paso manual, una sola vez: siembra tu propia membresía de club.
-- Sin esto, ni tú mismo podrías generar el primer código de invitación
-- (create_invite exige ya ser miembro — problema del huevo y la gallina
-- para el primer miembro). Reemplaza el correo por el tuyo.
-- ============================================================
-- insert into club_members (profile_id, joined_at, invite_code)
-- select id, now(), null from auth.users where email = 'TU_CORREO_AQUI';
