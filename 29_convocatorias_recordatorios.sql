-- 29 · Convocatorias, ronda 2 (2.211): recordatorios con la voz de claudIA.
-- Se ejecuta DESPUÉS de 28_convocatorias.sql. Se puede volver a ejecutar sin romper nada.
--
-- Cómo funciona
--   · Cada minuto, pg_cron llama a conv_recordar(). Para cada cita PACTADA:
--       - a 10 minutos o menos de la hora: «Tienes una batalla con <el otro> en N minutos…» (una sola vez);
--       - a la hora (y hasta 30 minutos después): «Es la hora. <el otro> ya aguarda en el campo.» (una sola vez).
--     Si la cita se pacta con menos de 10 minutos de margen, el aviso de «en N minutos» sale en el siguiente minuto.
--   · Se envían con push_notify(), así que valen las mismas reglas de siempre: solo a quien activó las notificaciones, solo si el interruptor
--     «Convocatorias» de La Armería está encendido y NO a quien tiene el Tablero a la vista (a esa persona el propio Tablero le avisa en pantalla).
--   · Los textos dicen «en N minutos» (tiempo relativo): no dependen de la zona horaria de cada quien.
--   · También se programa la limpieza diaria conv_purgar() (09:17 UTC = 03:17 de la Ciudad de México), además de la que ya hace el cliente al iniciar sesión.
--
-- Si el bloque de pg_cron del final avisa que no pudo activarla, actívala en el panel (Database → Extensions → pg_cron) y vuelve a ejecutar este archivo.

alter table public.convocatorias add column if not exists remind_10 boolean not null default false;   -- ya se envió «en N minutos»
alter table public.convocatorias add column if not exists remind_0  boolean not null default false;   -- ya se envió «es la hora»

create or replace function public.conv_recordar() returns integer
 language plpgsql security definer set search_path to 'public' as $$
declare c convocatorias%rowtype; n integer := 0; mins integer; url text := '/?panel=clan&tab=convocatorias';
begin
  -- a 10 minutos o menos de la hora
  for c in select * from convocatorias where status = 'pactada' and not remind_10 and starts_at > now() and starts_at <= now() + interval '10 minutes' for update skip locked loop
    mins := greatest(1, ceil(extract(epoch from (c.starts_at - now())) / 60.0)::integer);
    perform push_notify(c.created_by, 'citas', '⚔ Se acerca tu batalla',
      'Tienes una batalla con ' || push_name(c.invited_id) || ' en ' || mins || case when mins = 1 then ' minuto' else ' minutos' end || '. Que tu mente llegue antes que tus piezas.',
      '⚔ Your battle draws near',
      'You have a battle with ' || push_name(c.invited_id) || ' in ' || mins || case when mins = 1 then ' minute' else ' minutes' end || '. Let your mind arrive before your pieces.',
      url, 'conv-rec-' || c.id);
    perform push_notify(c.invited_id, 'citas', '⚔ Se acerca tu batalla',
      'Tienes una batalla con ' || push_name(c.created_by) || ' en ' || mins || case when mins = 1 then ' minuto' else ' minutos' end || '. Que tu mente llegue antes que tus piezas.',
      '⚔ Your battle draws near',
      'You have a battle with ' || push_name(c.created_by) || ' in ' || mins || case when mins = 1 then ' minute' else ' minutes' end || '. Let your mind arrive before your pieces.',
      url, 'conv-rec-' || c.id);
    update convocatorias set remind_10 = true where id = c.id;
    n := n + 1;
  end loop;
  -- a la hora (y hasta 30 minutos después, por si el minuto exacto se pierde)
  for c in select * from convocatorias where status = 'pactada' and not remind_0 and starts_at <= now() and starts_at > now() - interval '30 minutes' for update skip locked loop
    perform push_notify(c.created_by, 'citas', '⚔ Es la hora', 'Es la hora. ' || push_name(c.invited_id) || ' ya aguarda en el campo.',
      '⚔ It is time', 'It is time. ' || push_name(c.invited_id) || ' already waits on the field.', url, 'conv-hora-' || c.id);
    perform push_notify(c.invited_id, 'citas', '⚔ Es la hora', 'Es la hora. ' || push_name(c.created_by) || ' ya aguarda en el campo.',
      '⚔ It is time', 'It is time. ' || push_name(c.created_by) || ' already waits on the field.', url, 'conv-hora-' || c.id);
    update convocatorias set remind_0 = true, remind_10 = true where id = c.id;
    n := n + 1;
  end loop;
  return n;
exception when others then return n;   -- un fallo del recordatorio no debe detener a pg_cron
end $$;
revoke all on function public.conv_recordar() from public, anon, authenticated;   -- solo pg_cron (y quien administra la base) la ejecuta

-- Programación con pg_cron -----------------------------------------------------------------------------------------------
do $$
begin
  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron: % — actívala en Database → Extensions y vuelve a ejecutar este archivo', sqlerrm; end;
  begin
    perform cron.schedule('conv-recordar', '* * * * *', 'select public.conv_recordar()');
    perform cron.schedule('conv-purgar', '17 9 * * *', 'select public.conv_purgar()');
    raise notice 'pg_cron: tareas «conv-recordar» (cada minuto) y «conv-purgar» (diaria) programadas.';
  exception when others then raise notice 'cron.schedule: %', sqlerrm; end;
end $$;
