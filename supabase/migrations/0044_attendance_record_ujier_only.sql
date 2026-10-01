-- Registrar asistencia a cultos: SOLO `ujier` ("Servidor / Ujier") y
-- SuperAdmin (`apostol`, incluido por has_any_role desde 0036).
-- Decisión del dueño del producto, 2026-10-01 (docs/decisions.md): se
-- retira a administrador, seguimiento, coordinador_ministerio y pastor,
-- que lo conservaban desde 0007/0032. Gestionar cultos, abrir/cerrar el
-- registro y corregir asistencias no cambian (son capacidades aparte).

create or replace function can_record_attendance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array['ujier']::app_role[]);
$$;

comment on function can_record_attendance is
  'Registrar asistencia a cultos: solo ujier y SuperAdmin (apostol). Ver 0044.';
