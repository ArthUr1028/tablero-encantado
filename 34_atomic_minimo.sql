-- 34 · Reto de claudIA: en Atomic bastan 3 jugadas por bando (2.390)
-- Una sola ejecución del editor SQL. Solo cambia el mínimo de jugadas para que una victoria cuente: 6 jugadas sueltas en Atomic, 20 en las demás modalidades.
-- No toca datos existentes.

-- Misma función que dejó 33_atomic_reto.sql; solo cambian las líneas marcadas «-- NUEVO».
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
  v_min   int  := case when p_variant = 'atomic' then 6 else 20 end;   -- NUEVO: en Atomic las partidas son más cortas (3 jugadas por bando)
  v_n     int;
begin
  if v_uid is null or not is_club_member(v_uid) then
    raise exception 'solo para miembros del club';
  end if;
  if p_claim_id is null then
    raise exception 'falta el identificador de la victoria';
  end if;
  if p_variant not in ('clasico','capablanca','maharaja','amazonas','seirawan','shatranj','crazyhouse','atomic','dark') then   -- ya estaba
    raise exception 'variante invalida';
  end if;
  if p_color not in ('w','b') then
    raise exception 'color invalido';
  end if;
  if v_plies < v_min then   -- NUEVO
    return 'sin_efecto';                    -- menos de 10 jugadas por bando (3 en Atomic): no cuenta
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
