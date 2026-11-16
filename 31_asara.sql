-- 31 · Asara (Crazyhouse) en línea y en el Reto de claudIA (2.339)
-- Hecho en DOS pasos, cada uno en su propia ejecución del editor SQL (Postgres no deja usar un valor
-- de enum recién agregado dentro de la misma transacción). No toca datos existentes.

-- ============================== PASO 1 · solo esto, ejecútalo primero ==============================
alter type public.game_variant add value if not exists 'crazyhouse';

-- ============================== PASO 2 · después, todo lo demás (en una ejecución aparte) ==============================

-- 1) Posición inicial de Asara. En lugar de reescribir respond_challenge (que ya es larga y distinta según lo que haya hoy en la base),
--    un disparador rellena la FEN cuando la partida se crea sin ella: respond_challenge solo pone FEN a las variantes que conoce y a
--    Asara le deja el valor vacío. La FEN lleva la reserva «[]» y la marca « zh» que el Tablero reconoce (ZH_START en index.html).
create or replace function public.asara_fen_inicial() returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.variant::text = 'crazyhouse' and (new.current_fen is null or new.current_fen = '') then
    new.current_fen := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1 zh';
  end if;
  return new;
end;
$function$;

drop trigger if exists asara_fen_inicial on public.games;
create trigger asara_fen_inicial before insert on public.games
  for each row execute function public.asara_fen_inicial();

-- 2) Nombre de la variante en los avisos push y en las convocatorias (misma función que hay hoy; solo cambia la línea «-- NUEVO»).
create or replace function public.push_variant(p_v text, p_lang text) returns text
 language sql immutable as $$
  select case p_v
    when 'clasico' then case when p_lang = 'en' then 'Classic' else 'Clásico' end
    when 'maharaja' then case when p_lang = 'en' then 'Maharaja' else 'Maharajá' end
    when 'capablanca' then 'Capablanca' when 'amazonas' then 'Amazonas' when 'shatranj' then 'Shatranj'
    when 'seirawan' then 'Seirawan' when 'dark' then 'Dark Chess'
    when 'crazyhouse' then 'Asara'   -- NUEVO
    else p_v end;
$$;

-- 3) Reto de claudIA en Asara: la tabla de victorias solo aceptaba 7 variantes.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.reto_victorias'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%variant%'
  loop
    execute format('alter table public.reto_victorias drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.reto_victorias
  add constraint reto_victorias_variant_check
  check (variant = any (array['clasico','capablanca','maharaja','amazonas','seirawan','shatranj','crazyhouse','dark']));

-- 4) Misma función que hay hoy en la base (24_reto_shatranj_dark.sql); solo cambian las líneas marcadas «-- NUEVO».
create or replace function public.registrar_victoria_reto(p_claim_id uuid, p_variant text, p_color text, p_sans text[])
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_plies int  := coalesce(array_length(p_sans, 1), 0);
  v_level text;
  v_n     int;
begin
  if v_uid is null or not is_club_member(v_uid) then
    raise exception 'solo para miembros del club';
  end if;
  if p_claim_id is null then
    raise exception 'falta el identificador de la victoria';
  end if;
  if p_variant not in ('clasico','capablanca','maharaja','amazonas','seirawan','shatranj','crazyhouse','dark') then   -- NUEVO
    raise exception 'variante invalida';
  end if;
  if p_color not in ('w','b') then
    raise exception 'color invalido';
  end if;
  if v_plies < 20 then
    return 'sin_efecto';                    -- menos de 10 jugadas: no cuenta
  end if;
  if v_plies > 600 then
    raise exception 'partida demasiado larga';
  end if;
  if exists (select 1 from unnest(p_sans) s where s is null or length(s) > 16) then
    raise exception 'partida invalida';
  end if;

  -- Misma tabla de niveles que el cliente (RETO_TABLE): Maharajá, Amazonas, Seirawan, Shatranj, Asara y Dark = Club;
  -- Clásico y Capablanca = Fuerte. Si una modalidad cambia de escalón, se cambia aquí.
  v_level := case when p_variant in ('maharaja','amazonas','seirawan','shatranj','crazyhouse','dark') then 'club' else 'fuerte' end;   -- NUEVO

  insert into reto_victorias (user_id, claim_id, variant, level, color, plies, sans)
  values (v_uid, p_claim_id, p_variant, v_level, p_color, v_plies, p_sans)
  on conflict (user_id, claim_id) do nothing;

  get diagnostics v_n = row_count;
  return case when v_n = 0 then 'ya_registrada' else 'ok' end;
end;
$function$;
