-- El rol `pastor` deja de tener poderes de administrador.
--
-- Motivo (del dueño del producto): en esta iglesia hay muchos pastores de
-- áreas distintas, y varios son "pastores de título" que ahora mismo no
-- tienen nada a su cargo. El rango más alto de la iglesia son los
-- apóstoles. Por eso `pastor` no puede seguir equivaliendo a
-- administrador: debe ser un rol acotado a lo que la persona realmente
-- dirige (sus clases y sus ministerios).
--
-- `is_admin()` se usaba en 13 políticas RLS y significaba
-- "pastor O administrador". Pasa a significar solo `administrador`. Como
-- las políticas la invocan por nombre, cambiar el cuerpo de la función
-- las actualiza todas a la vez, sin tocar cada política.
--
-- Efecto concreto: el pastor deja de poder otorgar/revocar roles,
-- eliminar personas, gestionar plantillas de notificación y leer la
-- bitácora de auditoría. Conserva la lectura del directorio y los
-- reportes generales (decisión del 2026-09-02), y gestiona las clases
-- que imparte y los ministerios que lidera.

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_role('administrador');
$$;

comment on function is_admin is
  'Solo el rol `administrador`. El rol `pastor` fue excluido el 2026-09-02: '
  'ver docs/decisions.md.';
