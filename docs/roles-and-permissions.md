# Roles y permisos

## 1. Roles mínimos

| Rol (código)             | Descripción                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `miembro`                | Rol por defecto de toda cuenta nueva. Acceso al portal del miembro.                   |
| `maestro`                | Gestiona sus propias clases (asistencia, matrícula) donde es `teacher_person_id`.     |
| `seguimiento`            | Da seguimiento a visitantes; puede crear personas/visitantes.                         |
| `intercesor`             | Atiende peticiones de oración.                                                        |
| `coordinador_ministerio` | Gestiona personas, cursos, clases y **ministerios** de su(s) área(s).                 |
| `pastor`                 | **Acotado** (desde 2026-09-02): sus clases y los ministerios que lidera. No es admin. |
| `administrador`          | Único rol con acceso completo: gestión de roles, configuración y todo lo demás.       |

Un usuario puede tener **varios roles** a la vez (tabla `user_roles`,
clave compuesta `(user_id, role)`). La UI y las políticas RLS combinan
los permisos de todos los roles que tenga.

## 2. Principio rector

**Mínimo acceso necesario.** Ante la duda entre restringir o permitir, se
restringe y se documenta la limitación en `docs/assumptions.md` para
revisión posterior.

## 3. Matriz de permisos por módulo

Leyenda: **C**rear, **L**eer, **A**ctualizar, **E**liminar. `propio` =
solo sobre registros propios o asignados a uno.

| Módulo                    | miembro       | maestro       | seguimiento  | intercesor            | coord. ministerio | pastor                     | administrador |
| ------------------------- | ------------- | ------------- | ------------ | --------------------- | ----------------- | -------------------------- | ------------- |
| Directorio de personas    | L propio      | L             | CLA          | CLA                   | CLA               | CLA                        | CLAE          |
| Cursos / categorías       | –             | L             | L            | L                     | CLA               | – (sin catálogo propio)    | CLA           |
| Clases (offerings)        | L             | CLA propio    | L            | L                     | CLA               | CLA propio                 | CLA           |
| Ministerios (catálogo)    | –             | L             | L            | L                     | CLA               | solo los que lidera        | CLA           |
| Membresía de ministerio   | L propia      | L propia      | L            | L                     | CLA               | solo los que lidera        | CLA           |
| Matrícula                 | L propio      | CLA propio    | CLA          | L                     | CLA               | CLA                        | CLA           |
| Asistencia                | L propio      | CLA propio    | L            | L                     | CLA               | CLA                        | CLA           |
| Visitantes / seguimiento  | –             | –             | CLA propio+  | L                     | CLA               | CLA                        | CLA           |
| Check-in servicios        | C propio (QR) | –             | C            | L                     | CLA               | CLA                        | CLA           |
| Peticiones de oración     | C, L propio   | –             | –            | CLA asignadas+bandeja | –                 | solo si lidera intercesión | CLA           |
| Notificaciones/plantillas | –             | –             | –            | –                     | L                 | CLA                        | CLA           |
| Encuestas                 | responder     | L, responder  | L, responder | L, responder          | CLA               | CLA                        | CLA           |
| Importación de datos      | –             | –             | CLA          | –                     | CLA               | CLA                        | CLA           |
| Roles de usuarios         | L propio      | L propio      | L propio     | L propio              | L propio          | L propio                   | CLA           |
| Reportes/paneles          | propio        | propio+clases | seguimiento  | oración               | su área           | todo                       | todo          |

**El rol `pastor` NO es administrador** (decisión 2026-09-02): en esta
iglesia hay muchos pastores de áreas distintas y varios sin nada a su
cargo; el rango más alto son los apóstoles. El pastor ve el directorio y
los reportes generales, pero en **Cursos** solo las clases que imparte
(no el catálogo de cursos/categorías, que no tiene concepto de "propio")
y en **Ministerios** solo los que lidera — tanto el catálogo como la
membresía de ese ministerio. No crea ministerios nuevos (eso es de
administrador/coordinador: primero se crea, luego se designa al pastor
como líder). No otorga roles, no elimina personas, no ve la bitácora de
auditoría y no lee peticiones de oración salvo que lidere el ministerio
de intercesión. El flujo previsto es: el administrador crea el
ministerio, pone al pastor como líder, y ese pastor gestiona su propia
gente.

**Corrección 2026-09-05**: la decisión del 2026-09-02 quedó
correctamente reflejada en `is_admin()` (0023) y en los guards de
servidor de `ministerios/actions.ts`, pero **no** en la RLS de cursos,
clases, matrícula, asistencia y ministerios (0005/0006/0018 seguían
dándole a `pastor` acceso global vía `has_any_role(array[...])`
directo). `0028_pastor_scope.sql` lo alinea. Esta tabla también tenía un
error propio: la fila "Membresía de ministerio" decía `CLA` para pastor
cuando la intención documentada (y la instrucción de negocio) siempre
fue "solo los que lidera" — se corrige aquí.

**Excepción por ámbito (ministerios)**: además de los roles de la matriz,
el **líder de un ministerio concreto** (designado en
`ministries.leader_person_id`, o con membresía activa `lider`/`colider`)
puede gestionar la membresía **de ese ministerio y solo de ese**, sin
necesitar un rol global de staff. Esto es intencional y aplica el
principio de menor privilegio: un líder de alabanza administra su equipo
sin obtener acceso al directorio completo ni a otros ministerios. Se
implementa con la función `is_ministry_leader(ministry_id)`, usada tanto
en la política RLS `ministry_memberships_write` como en el guard de
servidor `requireMinistryManager()`.

"seguimiento CLA propio+" = puede gestionar cualquier `visitor_follow_up`,
no solo las asignadas a sí mismo, dado que su función es precisamente
distribuir y trabajar el seguimiento del equipo.

## 4. Aplicación técnica

- **Base de datos**: cada tabla tiene políticas RLS que reflejan esta
  matriz (ver `supabase/migrations/*.sql` y `docs/data-model.md`).
- **Servidor**: cada Server Action / Route Handler vuelve a validar el
  rol antes de operar (defensa en profundidad), usando los helpers de
  `src/lib/auth/`.
- **Cliente**: la UI oculta/deshabilita acciones no permitidas, pero esto
  es solo cosmético — nunca es la única barrera.

## 5. Gestión de roles

Solo `administrador` puede consultar o modificar roles (desde
2026-09-06; antes de `0023` pastor también podía). Se gestiona desde la
pestaña **"Cuenta y permisos"** del perfil de cada persona
(`Personas → [persona] → Cuenta y permisos`), no desde una lista de
botones: los cambios se preparan en la UI y se aplican todos juntos con
"Guardar cambios" (transacción única, todo o nada). La lista de
`Administración` (`/admin`) es ahora solo un directorio con búsqueda y
paginación — nombre, email de acceso, estatus y un enlace "Ver
permisos" que abre esa misma pestaña. Todo cambio de rol se registra en
`audit_log` con el estado anterior y posterior. Ver
`0030_permissions_management.sql` y `docs/security.md` §8.j para el
detalle de las protecciones (último administrador a prueba de
condiciones de carrera, detección de ediciones desactualizadas, cierre
de la escritura directa a `user_roles`).
