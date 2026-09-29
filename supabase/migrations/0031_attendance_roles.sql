-- Accesos de asistencia a cultos, dentro del sistema de roles existente
-- (app_role + user_roles + admin_set_person_roles). No se crea un sistema
-- de permisos paralelo: cada acceso es un valor más del enum, se otorga y
-- revoca desde "Cuenta y permisos" y queda auditado por
-- admin_set_person_roles() (0030).
--
--   ujier                  "Servidor / Ujier": registrar asistencia (check-in).
--   gestion_cultos         Crear, reprogramar y cancelar cultos; configurar recurrencias.
--   control_checkin        Abrir o cerrar el registro de un culto.
--   correccion_asistencia  Rectificar registros con motivo auditado.
--
-- Van en su propia migración porque Postgres no permite usar un valor de
-- enum recién agregado dentro de la misma transacción que lo agrega; las
-- funciones y políticas que los usan están en 0032.

alter type app_role add value if not exists 'ujier';
alter type app_role add value if not exists 'gestion_cultos';
alter type app_role add value if not exists 'control_checkin';
alter type app_role add value if not exists 'correccion_asistencia';
