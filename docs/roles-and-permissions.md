# Roles y permisos

## 1. Roles mínimos

| Rol (código)             | Descripción                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `miembro`                | Rol por defecto de toda cuenta nueva. Acceso al portal del miembro.                  |
| `maestro`                | Gestiona sus propias clases (asistencia, matrícula) donde es `teacher_person_id`.    |
| `seguimiento`            | Da seguimiento a visitantes; puede crear personas/visitantes.                        |
| `intercesor`             | Atiende peticiones de oración.                                                       |
| `coordinador_ministerio` | Gestiona personas, cursos, clases y **ministerios** de su(s) área(s).                |
| `pastor`                 | Acceso administrativo amplio (equivalente a administrador salvo config del sistema). |
| `administrador`          | Acceso completo, incluida gestión de roles y configuración.                          |

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

| Módulo                    | miembro       | maestro       | seguimiento  | intercesor            | coord. ministerio | pastor | administrador |
| ------------------------- | ------------- | ------------- | ------------ | --------------------- | ----------------- | ------ | ------------- |
| Directorio de personas    | L propio      | L             | CLA          | CLA                   | CLA               | CLA    | CLAE          |
| Cursos / categorías       | L             | L             | L            | L                     | CLA               | CLA    | CLA           |
| Clases (offerings)        | L             | CLA propio    | L            | L                     | CLA               | CLA    | CLA           |
| Ministerios (catálogo)    | L             | L             | L            | L                     | CLA               | CLA    | CLA           |
| Membresía de ministerio   | L propia      | L propia      | L            | L                     | CLA               | CLA    | CLA           |
| Matrícula                 | L propio      | CLA propio    | CLA          | L                     | CLA               | CLA    | CLA           |
| Asistencia                | L propio      | CLA propio    | L            | L                     | CLA               | CLA    | CLA           |
| Visitantes / seguimiento  | –             | –             | CLA propio+  | L                     | CLA               | CLA    | CLA           |
| Check-in servicios        | C propio (QR) | –             | C            | L                     | CLA               | CLA    | CLA           |
| Peticiones de oración     | C, L propio   | –             | –            | CLA asignadas+bandeja | –                 | CLA    | CLA           |
| Notificaciones/plantillas | –             | –             | –            | –                     | L                 | CLA    | CLA           |
| Encuestas                 | responder     | L, responder  | L, responder | L, responder          | CLA               | CLA    | CLA           |
| Importación de datos      | –             | –             | CLA          | –                     | CLA               | CLA    | CLA           |
| Roles de usuarios         | L propio      | L propio      | L propio     | L propio              | L propio          | CLA    | CLA           |
| Reportes/paneles          | propio        | propio+clases | seguimiento  | oración               | su área           | todo   | todo          |

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

Solo `administrador` (y `pastor` para operaciones de lectura/asignación
de roles no administrativos) puede otorgar o revocar roles, desde
`admin/usuarios`. Todo cambio de rol se registra en `audit_log`.
