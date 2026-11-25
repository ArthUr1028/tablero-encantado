-- 35 · Atomic en línea, contra el Clan (2.391)
-- Hecho en DOS pasos, cada uno en su propia ejecución del editor SQL (Postgres no deja usar un valor
-- de enum recién agregado dentro de la misma transacción). No toca datos existentes. Mismo método que 31_asara.sql.

-- ============================== PASO 1 · solo esto, ejecútalo primero ==============================
alter type public.game_variant add value if not exists 'atomic';

-- ============================== PASO 2 · después, todo lo demás (en una ejecución aparte) ==============================

-- 1) Posición inicial de Atomic (y de Asara, que ya la tenía). respond_challenge solo pone FEN a las variantes que conoce y a estas
--    dos les deja el valor vacío; el disparador la rellena al crear la partida. La marca « atomic» la reconoce el Tablero (ATOMIC_START).
--    Reemplaza a asara_fen_inicial (misma función, mismo disparador, con una rama más).
create or replace function public.asara_fen_inicial() returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.variant::text = 'crazyhouse' and (new.current_fen is null or new.current_fen = '') then
    new.current_fen := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1 zh';
  elsif new.variant::text = 'atomic' and (new.current_fen is null or new.current_fen = '') then   -- NUEVO
    new.current_fen := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 atomic';          -- NUEVO
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
    when 'crazyhouse' then 'Asara'
    when 'atomic' then 'Atomic'   -- NUEVO
    else p_v end;
$$;
