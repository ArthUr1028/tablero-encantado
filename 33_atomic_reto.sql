-- 33 · Atomic en el Reto de claudIA (2.388)
-- Una sola ejecución del editor SQL. No toca datos existentes ni agrega valores al enum de partidas
-- (el Reto guarda la variante como texto en reto_victorias; Atomic en línea contra el Clan será otra migración aparte).

-- 1) La tabla de victorias solo aceptaba 8 variantes: se vuelve a crear la restricción con Atomic.
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
  check (variant = any (array['clasico','capablanca','maharaja','amazonas','seirawan','shatranj','crazyhouse','atomic','dark']));

-- 2) Misma función que hay hoy en la base (31_asara.sql); solo cambian las líneas marcadas «-- NUEVO».
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
  if p_variant not in ('clasico','capablanca','maharaja','amazonas','seirawan','shatranj','crazyhouse','atomic','dark') then   -- NUEVO
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

  -- Misma tabla de niveles que el cliente (RETO_TABLE): Maharajá, Amazonas, Seirawan, Shatranj, Asara, Atomic y Dark = Club;
  -- Clásico y Capablanca = Fuerte. Si una modalidad cambia de escalón, se cambia aquí.
  v_level := case when p_variant in ('maharaja','amazonas','seirawan','shatranj','crazyhouse','atomic','dark') then 'club' else 'fuerte' end;   -- NUEVO

  insert into reto_victorias (user_id, claim_id, variant, level, color, plies, sans)
  values (v_uid, p_claim_id, p_variant, v_level, p_color, v_plies, p_sans)
  on conflict (user_id, claim_id) do nothing;

  get diagnostics v_n = row_count;
  return case when v_n = 0 then 'ya_registrada' else 'ok' end;
end;
$function$;
