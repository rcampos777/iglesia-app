-- Accesos financieros, dentro del mismo sistema de roles (app_role).
--
--   apostol   Nivel más alto del módulo de Donaciones y Finanzas. Único que
--             concede o revoca `finanzas` (y `apostol`). NO equivale a
--             administrador ni a pastor, y no abre otros módulos
--             confidenciales (oración, auditoría general, roles técnicos).
--   finanzas  Registra y consulta donaciones, reportes, exportaciones y
--             cartas.
--
-- Un `administrador` técnico NO obtiene acceso financiero. Las reglas de
-- asignación y las funciones que usan estos valores están en 0035 (Postgres
-- no permite usar un valor de enum en la misma transacción que lo agrega).

alter type app_role add value if not exists 'apostol';
alter type app_role add value if not exists 'finanzas';
