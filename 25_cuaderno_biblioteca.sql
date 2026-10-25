-- 25 · El cuaderno viaja con la partida guardada y se limpia al terminar (2.149)
-- Se ejecuta de una sola vez; no toca datos existentes.

-- 1) La Antología (partidas_guardadas) puede guardar el cuaderno de la partida: notas por jugada y marcas del tablero.
alter table public.partidas_guardadas
  add column if not exists notes jsonb,
  add column if not exists marks jsonb;

-- 2) Barrido de cuadernos de partidas en línea ya terminadas y antiguas (más de 30 días desde que se crearon): las que terminó el rival
--    mientras estabas fuera conservan tu cuaderno ese tiempo, para que puedas abrirlas y guardarlas en La Antología con sus notas.
--    Solo borra los del propio usuario.
create or replace function public.purgar_cuadernos_terminados()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_n   int := 0;
  v_m   int := 0;
begin
  if v_uid is null then
    return 0;
  end if;
  delete from game_notes n
   using games g
   where n.game_id = g.id and n.owner = v_uid
     and g.status in ('finalizada','abandonada') and g.created_at < now() - interval '30 days';
  get diagnostics v_n = row_count;
  delete from game_marks k
   using games g
   where k.game_id = g.id and k.owner = v_uid
     and g.status in ('finalizada','abandonada') and g.created_at < now() - interval '30 days';
  get diagnostics v_m = row_count;
  return v_n + v_m;
end;
$function$;

revoke all on function public.purgar_cuadernos_terminados() from public, anon;
grant execute on function public.purgar_cuadernos_terminados() to authenticated;
