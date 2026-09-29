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
| `ujier`                  | **"Servidor / Ujier"**: registrar asistencia a cultos (check-in). Nada más.           |
| `gestion_cultos`         | Crear cultos especiales, reprogramar/cancelar fechas, configurar recurrencias.        |
| `control_checkin`        | Abrir o cerrar el registro de asistencia de un culto.                                 |
| `correccion_asistencia`  | Anular o agregar asistencias fuera de la ventana, con motivo auditado.                |
| `apostol`                | Nivel más alto de **Donaciones y Finanzas**. Único que concede/revoca Finanzas.       |
| `finanzas`               | Registra y consulta donaciones, totales, cartas y exportaciones.                      |

Los cuatro últimos (desde 2026-09-28, migraciones 0031–0032) son
**accesos de asistencia**: valores del mismo enum `app_role`, asignados
en la misma pestaña "Cuenta y permisos" y guardados por la misma
`admin_set_person_roles()` (auditada). No hay un sistema de permisos
paralelo. Ver §6.

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

| Módulo                    | miembro        | maestro       | seguimiento  | intercesor            | coord. ministerio | pastor                     | administrador |
| ------------------------- | -------------- | ------------- | ------------ | --------------------- | ----------------- | -------------------------- | ------------- |
| Directorio de personas    | L propio       | L             | CLA          | CLA                   | CLA               | CLA                        | CLAE          |
| Cursos / categorías       | –              | L             | L            | L                     | CLA               | – (sin catálogo propio)    | CLA           |
| Clases (offerings)        | L              | CLA propio    | L            | L                     | CLA               | CLA propio                 | CLA           |
| Ministerios (catálogo)    | –              | L             | L            | L                     | CLA               | solo los que lidera        | CLA           |
| Membresía de ministerio   | L propia       | L propia      | L            | L                     | CLA               | solo los que lidera        | CLA           |
| Matrícula                 | L propio       | CLA propio    | CLA          | L                     | CLA               | CLA                        | CLA           |
| Asistencia                | L propio       | CLA propio    | L            | L                     | CLA               | CLA                        | CLA           |
| Visitantes / seguimiento  | –              | –             | CLA propio+  | L                     | CLA               | CLA                        | CLA           |
| Asistencia a cultos       | – (muestra QR) | –             | C            | –                     | C                 | C                          | todo          |
| Peticiones de oración     | C, L propio    | –             | –            | CLA asignadas+bandeja | –                 | solo si lidera intercesión | CLA           |
| Notificaciones/plantillas | –              | –             | –            | –                     | L                 | CLA                        | CLA           |
| Encuestas                 | responder      | L, responder  | L, responder | L, responder          | CLA               | CLA                        | CLA           |
| Importación de datos      | –              | –             | CLA          | –                     | CLA               | CLA                        | CLA           |
| Roles de usuarios         | L propio       | L propio      | L propio     | L propio              | L propio          | L propio                   | CLA           |
| Reportes/paneles          | propio         | propio+clases | seguimiento  | oración               | su área           | todo                       | todo          |

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

## 6. Asistencia a cultos (check-in por ujieres)

Desde 2026-09-28 la asistencia a cultos la confirma **personal
autorizado**. El miembro ya **no** puede confirmarse a sí mismo (se
retiró la política `service_checkins_insert_self` de 0017 y el botón
"Confirmar mi asistencia"); solo muestra su QR personal en Mi portal.

### Matriz final

| Capacidad (función SQL)                                     | Roles que la tienen                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Registrar asistencia — `can_record_attendance()`            | `administrador`, `ujier`, y (preservados de 0007) `seguimiento`, `coordinador_ministerio`, `pastor` |
| Gestionar cultos — `can_manage_services()`                  | `administrador`, `gestion_cultos`                                                                   |
| Controlar check-in (abrir/cerrar) — `can_control_checkin()` | `administrador`, `control_checkin`                                                                  |
| Corregir asistencia — `can_correct_attendance()`            | `administrador`, `correccion_asistencia`                                                            |
| Conceder o revocar cualquiera de los anteriores             | solo `administrador` (`admin_set_person_roles`, auditado)                                           |

Qué incluye **registrar asistencia**:

- Ver los cultos (hoy y los abiertos) en **Asistencia** (`/check-in`).
- Buscar personas con datos mínimos: nombre + una pista discreta
  (últimos 4 dígitos del teléfono o email enmascarado). Mínimo 2
  letras, máximo 25 resultados; nunca se descarga el directorio.
- Confirmar asistencia manual o escaneando el QR personal.
- Ver quién ya está registrado en el culto seleccionado (sin ver quién
  lo registró ni los registros anulados: eso es de corrección).

Qué **no** incluye: administración, importaciones, peticiones de
oración, directorio de personas, edición de personas, reportes (el rol
`ujier` no es staff: `is_staff()` no lo incluye). Ser miembro de un
ministerio o tener el título de servidor **no** concede el acceso.

**Por qué se preservan `seguimiento`, `coordinador_ministerio` y
`pastor` para registrar**: ya podían hacer check-in desde 0007; quitarlo
dejaría fuera a operadores legítimos. **No** conservan crear/abrir/
cerrar/borrar cultos ni borrar check-ins (lo tenían en 0007): esas
operaciones ahora son `gestion_cultos`, `control_checkin` y
`correccion_asistencia`, que el administrador asigna explícitamente.

### Dónde se aplica cada barrera

1. **Interfaz**: el menú "Asistencia", los botones de abrir/cerrar,
   "Anular", "Agregar (corrección)" y "Programación de cultos" solo
   aparecen con la capacidad correspondiente
   (`src/lib/auth/attendance.ts`).
2. **Servidor**: cada Server Action (`check-in/actions.ts`,
   `check-in/programacion/actions.ts`) vuelve a leer los roles de la
   base con `requireRole()`.
3. **Base de datos**: toda escritura pasa por funciones `security
definer` que llaman a `can_*()` y validan la ventana de registro. No
   hay políticas de escritura directa en `services`, `service_checkins`,
   `service_series*` ni `service_schedule_settings`.

**Revocación inmediata**: los roles se leen en cada operación (no hay
token con roles embebidos), así que al quitar `ujier` la siguiente
búsqueda o registro falla con "No tienes permiso…", aunque el ujier
tenga la pantalla abierta. Probado en `tests/db/attendance.test.ts`.

**Quién concede y revoca**: `admin_set_person_roles()` registra en
`audit_log` (`update_roles`) el actor, antes/después, añadidos y
quitados; `user_roles.granted_by` guarda quién otorgó cada rol.

## 7. Donaciones y Finanzas (`apostol`, `finanzas`)

Desde 2026-09-28 (0034–0035). Ver [`finance.md`](finance.md).

| Acción                                                          | apostol | finanzas | administrador | pastor | intercesor | ujier / miembro / demás |
| --------------------------------------------------------------- | ------- | -------- | ------------- | ------ | ---------- | ----------------------- |
| Ver donaciones, montos, totales, historial por persona          | ✔       | ✔        | ✘             | ✘      | ✘          | ✘                       |
| Registrar, corregir y anular (con motivo)                       | ✔       | ✔        | ✘             | ✘      | ✘          | ✘                       |
| Exportar CSV                                                    | ✔       | ✔        | ✘             | ✘      | ✘          | ✘                       |
| Emitir y descargar cartas / versiones                           | ✔       | ✔        | ✘             | ✘      | ✘          | ✘                       |
| Editar datos de la iglesia y texto de la carta                  | ✔       | ✔        | ✘             | ✘      | ✘          | ✘                       |
| Aprobar la plantilla (quitar "BORRADOR")                        | ✔       | ✘        | ✘             | ✘      | ✘          | ✘                       |
| Leer la petición del sobre de una donación (auditado)           | ✔       | ✔        | ✘             | ✘      | ✘          | ✘                       |
| Compartir la petición con intercesión (autorización registrada) | ✔       | ✔        | ✘             | ✘      | ✘          | ✘                       |
| Ver la bandeja general de oración                               | ✘ (\*)  | ✘ (\*)   | ✔             | ✘      | ✔          | ✘                       |
| Ver la petición ya compartida (en el módulo de oración)         | ✘ (\*)  | ✘ (\*)   | ✔             | ✘      | ✔          | ✘                       |
| Conceder/revocar Finanzas y Apóstol                             | ✔       | ✘        | ✘             | ✘      | ✘          | ✘                       |
| Leer la auditoría financiera y de lecturas del sobre            | ✔       | ✘        | ✘             | ✘      | ✘          | ✘                       |

(\*) Salvo que además tengan un rol de oración por su cuenta. Intercesión
nunca ve monto, forma de pago ni la donación.

**Reglas**:

- `apostol` **no** es `pastor` ni `administrador`, y no abre ningún otro
  módulo confidencial. Un `administrador` técnico **no** tiene acceso
  financiero.
- `admin_set_person_roles` (la pestaña "Cuenta y permisos") ya no puede
  añadir ni quitar `apostol`/`finanzas`: se muestran solo como lectura.
  Además, un trigger en `user_roles` rechaza cualquier escritura de esos
  roles que no venga de `apostol_set_financial_role()` o del alta inicial.
- Solo un `apostol` concede o revoca (Finanzas → Acceso). No se puede
  quitar el último `apostol` (tampoco borrando su cuenta).
- **Alta inicial**: `bootstrap_first_apostol()` solo desde el SQL Editor de
  Supabase (rol `postgres`), una sola vez, con nota de quién lo autorizó.
  Nunca automática, nunca por nombre ni por email desde la app. Ver
  `finance.md` §7. En este trabajo **no** se asignó a nadie.
- Concesiones y revocaciones quedan en `audit_log` (`grant_financial_role`,
  `revoke_financial_role`, `bootstrap_first_apostol`) sin montos.
- Revocación inmediata: roles leídos en cada operación (probado).
