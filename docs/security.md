# Seguridad

## 1. Modelo de amenazas (resumen)

| Amenaza                                                     | Mitigación                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Un usuario ve/edita datos de otra persona sin permiso       | RLS en toda tabla + revalidación en servidor                                                        |
| Escalación de privilegios (un miembro se autoasigna un rol) | `user_roles` solo escribible por `administrador`/`pastor` vía RLS; nunca expuesto a escritura libre |
| Fuga de peticiones de oración                               | RLS estricta + auditoría de acceso + emails sin contenido                                           |
| QR de check-in reutilizado/falsificado                      | Token HMAC firmado de corta vigencia, no el `person_id` en crudo                                    |
| Import masivo crea duplicados o pisa datos reales           | Staging obligatorio + revisión humana + sin fusión automática                                       |
| Fuga de datos reales en un entorno de desarrollo            | Prohibido por convención (`docs/testing.md`) + `.gitignore` bloquea archivos de datos               |
| Secretos en el repositorio                                  | `.gitignore` + revisión de `git status`/`git diff` antes de commitear                               |
| Uso indebido de la `service_role key`                       | Aislada en `src/lib/supabase/admin.ts`, nunca en código de cliente, uso justificado caso por caso   |

## 2. Row Level Security (RLS)

- **Todas** las tablas expuestas tienen `alter table ... enable row level
security;` en la misma migración donde se crean.
- Las políticas usan funciones auxiliares (`has_role`, `has_any_role`,
  `is_staff`, `is_admin`, `current_person_id`) para evitar duplicar lógica
  y mantenerla auditable en un solo lugar (`0002_roles.sql`,
  `0004_profiles.sql`).
- Ninguna política usa `using (true)` para escritura. Las de lectura
  amplia (`auth.uid() is not null`) se reservan para catálogos no
  sensibles (categorías de curso, cursos, clases, servicios).

## 3. Autorización en el servidor

- Cada Server Action valida el rol del usuario **antes** de intentar la
  operación (ver `src/lib/auth/require-role.ts`), para poder devolver un
  error claro en español — la RLS es la última línea de defensa, no la
  primera experiencia de error del usuario.
- Ninguna ruta de API confía en un `role` u otro dato de autorización
  enviado por el cliente en el body/query; siempre se deriva de la
  sesión (`auth.uid()`) en el servidor.

## 4. Peticiones de oración

- Acceso de lectura restringido por RLS a: intercesor, pastor,
  administrador, la persona asignada, o el autor (si no es anónimo).
- Toda lectura de **detalle** de una petición pasa por
  `src/lib/data/prayer-requests.ts`, que llama a
  `log_prayer_request_access(id)` (función `security definer`) para
  dejar constancia en `prayer_request_access_log`. Postgres no dispara
  triggers en `SELECT`, así que esta auditoría depende de que toda
  lectura de detalle pase por esa función — es una invariante de la capa
  de aplicación, documentada aquí para que no se rompa accidentalmente
  agregando un `select` directo desde un componente cliente.
- Los emails relacionados con una petición (ej. "tienes una nueva
  petición asignada") **nunca** incluyen `content`; solo un aviso
  genérico con link a la app, donde el acceso vuelve a pasar por RLS +
  auditoría.

## 5. Check-in por QR y asistencia a cultos

- El QR de una persona no codifica su `person_id` en texto plano de
  forma permanente. Codifica un token firmado (HMAC-SHA256 con
  `QR_CHECKIN_SECRET`) que incluye `person_id` + `exp` (5 minutos). Ver
  `src/lib/checkin/token.ts`. Mi portal lo renueva solo cada 4 minutos.
- **El QR solo identifica a la persona; no concede nada a quien lo
  escanea.** `scanAttendanceAction` exige primero que el operador
  tenga la capacidad de registrar asistencia, valida firma y expiración
  en el servidor, y recién entonces llama a `record_service_attendance()`
  con la sesión del operador (sin `service_role`).
- **Desde 2026-09-28 no hay auto check-in**: se retiró la política
  `service_checkins_insert_self` (0017) y la escritura directa en
  `service_checkins` y `services`. Toda escritura pasa por funciones
  `security definer` que validan la capacidad (`can_record_attendance()`
  etc.) y la ventana de registro (`service_checkin_state()`): un culto
  pendiente, cerrado o cancelado no acepta registros ordinarios.
- Una sola asistencia vigente por persona y culto: índice único parcial
  `service_checkins_one_active_uidx` + `ON CONFLICT DO NOTHING`. Dos
  ujieres que registran a la misma persona a la vez obtienen
  "registrado" y "ya registrado"; un reintento tras un corte de red no
  duplica.
- Las correcciones nunca borran: `void_service_attendance()` marca el
  registro como anulado con motivo, y `correct_attendance_add()` agrega
  fuera de la ventana con motivo. Ambas escriben en `audit_log` (actor,
  motivo, datos originales). Solo `correccion_asistencia` o
  `administrador`.
- La búsqueda para check-in (`search_people_for_checkin`) devuelve
  nombre + una pista discreta (últimos 4 dígitos del teléfono o email
  enmascarado), mínimo 2 letras y máximo 25 filas. **Límite conocido**:
  un ujier con paciencia podría recorrer nombres probando combinaciones
  de letras; no hay límite de frecuencia. Los datos expuestos son solo
  nombre y pista, por diseño.
- El método (`qr`/`manual`) lo fija la Server Action. Un ujier que
  llamara la función SQL directamente con la anon key podría declarar
  otro método para una persona que igual está autorizado a registrar:
  es un dato informativo, no una barrera.
- El generador de cultos (`generate_service_occurrences`) no es
  ejecutable por `anon` ni `authenticated`; corre con pg_cron dentro de
  la base (sin endpoint HTTP). La app solo puede invocar
  `ensure_service_occurrences()`, que exige una capacidad de asistencia
  y es idempotente.

## 5.a Inscripción en línea (0040)

- El público (`anon`) no tiene políticas sobre las tablas: solo ejecuta
  `public_registration_activity` (campos públicos) y
  `submit_activity_registration` (valida fecha, cupo con bloqueo de fila,
  mayoría de edad, términos y email duplicado).
- `activity_registrations` contiene datos de salud: lectura y cambios solo
  con `can_manage_activity`; borrar solo `is_admin()`. Los emails nunca
  llevan datos médicos.
- Crear una persona desde el público solo ocurre si no hay coincidencia;
  si la hay, un organizador confirma (`link_activity_registration`,
  auditado). Un organizador sin rol de staff solo puede vincular a las
  personas sugeridas.
- Envíos sin sesión (forma pública y cron) usan `service_role` solo para
  leer esa inscripción/actividad y escribir `notification_log`.
- `/api/cron/*` exige `Authorization: Bearer $CRON_SECRET`.
- Pruebas: `tests/db/registrations.test.ts`.

## 5.b Donaciones y Finanzas

Detalle en `docs/finance.md` y matriz en `docs/roles-and-permissions.md` §7.

- Solo `apostol`/`finanzas` (`has_finance_access()`); `administrador` no.
  RLS de lectura en todas las tablas financieras, **ninguna** política de
  escritura: todo pasa por funciones `security definer` que validan el
  acceso primero y responden "No autorizado." sin datos. Las rutas de
  PDF/CSV responden 404 sin acceso y `no-store`.
- Sin fugas por métricas: el panel general, los reportes, `audit_log` (que
  lee el administrador) y la búsqueda de personas no incluyen montos. La
  auditoría financiera va a `finance_audit_log` (solo `apostol`).
- Autoasignación bloqueada: trigger `user_roles_guard_financial` + regla en
  `admin_set_person_roles`. Último `apostol` protegido.
- Dinero en centavos `bigint`; sin punto flotante en servidor ni cliente.
- Petición del sobre: tabla sin políticas; lectura solo por función
  auditada; nunca en listados/reportes/exportaciones/cartas/errores/logs.
  Compartir con intercesión exige autorización registrada por el operador.
- Historial inmutable (`donation_revisions`, `finance_audit_log`,
  `donation_prayer_note_access_log`) y donaciones no borrables (triggers).
- CSV protegido contra inyección de fórmulas.
- **Límites conocidos**: (1) Con la `service_role key` o el rol `postgres`
  se puede todo, como en el resto del sistema. (2) Si un administrador
  intentara borrar una persona con donaciones llamando a la API directo
  (la app no tiene esa función), el error de clave foránea de Postgres
  mencionaría `donations`. (3) La búsqueda de personas para Finanzas
  expone nombre y una pista, como la de check-in.

## 5.c Certificaciones de ministros (0042–0043)

- Mismo acceso que Finanzas (`has_finance_access()`): RLS en
  `certification_types` y `person_certifications`; borrar solo
  `is_apostol()`. El listado con nombres sale de `certifications_list()`
  (security definer, valida acceso) porque Finanzas no lee `people`.
- Documentos en el bucket **privado** `certificaciones` (PDF/JPG/PNG/WebP,
  10 MB) con políticas de `storage.objects` solo para
  `has_finance_access()`. Ruta `<persona>/<uuid>.<ext>`, validada por
  `CHECK` en la base y por Zod en el servidor.
- Abrir un documento: `GET /certificaciones/[id]/documento` → guard de rol
  → `certification_log_file_view()` (registra en `finance_audit_log`) →
  redirect a URL firmada de 60 s con `no-store` y `no-referrer`. Es un
  enlace normal, sin prefetch, para que no se registren aperturas falsas.
- Crear/cambiar/borrar se auditan por trigger en `finance_audit_log`, sin
  el contenido del documento.

## 6. Importación de datos

Ver `docs/import-process.md` para el flujo completo. Resumen de
controles: staging obligatorio, validación Zod, matching asistido sin
auto-fusión, sin notificaciones automáticas, y todas las promociones
pasan por `promote_import_row()` que respeta RLS (solo roles
autorizados pueden invocarla con éxito).

## 7. Manejo de secretos

- `.env.local` (no versionado) contiene todos los secretos reales.
- `.env.example` documenta las variables sin valores reales.
- La `service_role key` de Supabase solo se usa server-side, en
  operaciones explícitamente marcadas como administrativas.
- `QR_CHECKIN_SECRET` y `RESEND_API_KEY` nunca se exponen a
  `NEXT_PUBLIC_*`.

## 8. Auditoría realizada (2026-08-16)

- **RLS**: confirmado programáticamente que las 24 tablas creadas en
  `supabase/migrations/` tienen `enable row level security` (coinciden
  1:1 con las tablas creadas).
- **Guards de autorización**: confirmado que cada función exportada en
  cada archivo `"use server"` del área autenticada invoca
  `requireRole`/`requireAuth` antes de operar.
- **Inyección de filtros PostgREST**: se encontró y corrigió
  interpolación sin sanitizar de entradas de usuario (búsqueda del
  directorio, matching de duplicados de importación) en filtros
  `.or()`/`.ilike()`. RLS ya acotaba el impacto real — un filtro
  manipulado no puede saltarse RLS, Postgres la sigue aplicando
  siempre — pero se corrigió con `src/lib/supabase/filter-utils.ts`
  para evitar romper consultas o alterar de forma inesperada qué filas
  ya visibles para el usuario se listan.
- **Verificado en la práctica contra Postgres real** (misma sesión, más
  tarde, con credenciales de un proyecto Supabase de desarrollo): login
  real con cada rol de prueba; como `miembro`, navegación **directa** a
  `/personas` (bypaseando el nav oculto) quedó correctamente acotada por
  RLS a un solo registro (el propio); `/admin` y `/oracion` redirigieron
  correctamente. Otorgar/revocar un rol vía `/admin` quedó auditado
  correctamente en `audit_log`. Ver `docs/progress.md` para el detalle
  completo de la verificación end-to-end.
- **Pendiente**: pruebas de carga, límites de tasa, y el checklist de
  producción completo (`docs/deployment.md` §5) contra un proyecto
  Supabase separado para producción.

## 8.b Ministerios (2026-09-02)

- **RLS**: las dos tablas nuevas (`ministries`, `ministry_memberships`)
  tienen RLS habilitado con políticas explícitas. Re-verificado: 26/26
  tablas creadas en `supabase/migrations/` tienen `enable row level
security`.
- **Autorización por ámbito**: `ministry_memberships` es la primera
  tabla del proyecto cuya escritura no depende solo del rol global, sino
  también de _qué_ ministerio se toca (`is_ministry_leader()`). El guard
  de servidor `requireMinistryManager()` espeja exactamente la política
  RLS `ministry_memberships_write` — defensa en profundidad, no
  reemplazo.
- **Lectura restringida de membresía**: el catálogo de ministerios es
  legible por cualquier usuario autenticado (la gente necesita saber
  dónde puede servir), pero _quién sirve_ solo lo ven staff, el líder de
  ese ministerio, y la propia persona respecto de sí misma. Un usuario
  con solo rol `miembro` no puede enumerar el equipo de un ministerio.
- **Recursión RLS**: `is_ministry_leader()` consulta
  `ministry_memberships`, que a su vez usa la función en su política.
  No hay recursión porque la función es `SECURITY DEFINER` y corre como
  dueño de la tabla (mismo patrón que `has_role()` / `current_person_id()`).

### Acceso del líder de ministerio a `people` (0019)

Al probar `0018` en vivo se detectó que un líder sin rol de staff no
podía ver los nombres de su propio equipo (RLS de `people` lo limita a su
registro). Se resolvió **sin** ensanchar el acceso al directorio:

- `people_select_ministry_leader`: lectura del registro completo **solo**
  de las personas que pertenecen (o pertenecieron) a un ministerio que
  esa persona lidera. Verificado en vivo: un líder no-staff ve 4 personas
  en `/personas` (él mismo + su equipo), no las 49 del directorio.
- `list_people_for_ministry_picker()`: para el selector de "agregar
  persona" devuelve **solo `id`, `first_name`, `last_name`** — nunca
  email, teléfono, dirección ni notas. `security definer` con `revoke all
from public` + `grant execute to authenticated`, y comprobación interna
  de que quien llama es staff o lidera algún ministerio.

## 8.c Cierre de páginas sin guard (2026-09-02)

Auditoría a raíz de un reporte del usuario: una cuenta con solo el rol
`miembro` podía **entrar por URL directa** a páginas que el menú le
ocultaba. RLS ya limitaba los _datos_ (por ejemplo `/personas` le mostraba
solo su propio registro), pero la página cargaba igual y exponía
catálogos completos de cursos, ministerios y encuestas.

Se encontraron **8 páginas sin redirección** y se cerraron:
`/personas`, `/personas/[id]`, `/personas/nueva`, `/cursos`,
`/cursos/clases/[id]`, `/ministerios`, `/ministerios/[id]` y
`/encuestas`. Todas redirigen ahora a `/portal` para quien no es staff.

Excepciones deliberadas, documentadas para que nadie las "corrija" por
error:

- `/encuestas/[id]` sigue accesible a cualquier autenticado: es donde un
  miembro **responde** una encuesta. Los resultados agregados sí están
  limitados a roles de gestión dentro de la misma página.
- `/check-in/publico` sigue accesible a cualquier autenticado: era el
  destino del antiguo QR fijo de la entrada. Desde 2026-09-28 **ya no
  registra asistencia**; solo muestra el QR personal de quien lo abre.
- `/ministerios/[id]` admite además al **líder de ese ministerio** aunque
  no sea staff, para no romper la autorización por ámbito de `0018`.

Verificado en vivo con una sesión de rol único `miembro`: las 11 rutas
restringidas redirigen, y el menú queda en "Panel | Mi portal".

## 8.d Escalada de privilegios en `grants_prayer_access` (2026-09-02)

Al introducir el flag que designa el ministerio de intercesión (0020) se
probó la escalada **con un token de sesión real** de
`coordinador_ministerio`, y la prueba encontró un fallo en la primera
versión del blindaje:

- `0021` usaba `revoke update (grants_prayer_access) on ministries from
authenticated`. **No funciona**: en Postgres el privilegio `UPDATE` a
  nivel de tabla implica todas las columnas, y revocar una columna suelta
  no lo quita. El intento del coordinador no fue rechazado por permisos,
  sino que llegó hasta el índice único (`23505`) — señal de que sí tenía
  permiso de escribir la columna. Solo el hecho de que ya hubiera un
  ministerio marcado evitó la escalada.
- `0022` lo resuelve con un **trigger** `before insert or update` que
  rechaza cualquier cambio del flag hecho por quien no sea
  `administrador`, venga por donde venga (app, API directa, SQL).

Pruebas negativas re-ejecutadas contra la base real, todas bloqueadas
con `42501`:

| Intento                              | Rol         | Resultado            |
| ------------------------------------ | ----------- | -------------------- |
| `PATCH` marcando su ministerio       | coordinador | ❌ bloqueado         |
| `INSERT` de un ministerio ya marcado | coordinador | ❌ bloqueado         |
| RPC `set_prayer_ministry`            | coordinador | ❌ bloqueado         |
| Leer `prayer_requests`               | coordinador | ❌ 0 filas           |
| Otorgarse rol `administrador`        | pastor      | ❌ bloqueado por RLS |
| Leer `audit_log`                     | pastor      | ❌ 0 filas           |

Camino legítimo verificado: el administrador mueve la designación por
RPC y queda registrado en `audit_log`.

**Lección**: para restringir UNA columna, el privilegio por columna no
sirve si el rol ya tiene `UPDATE` de tabla. Usar trigger (o revocar la
tabla y conceder columna por columna).

## 8.e Recursión de políticas en Actividades (2026-09-02)

`0024` creó políticas mutuamente recursivas: `activities_select`
consultaba `activity_participants` (para que una persona vea las
actividades en las que está inscrita) y `activity_participants_select`
consultaba `activities` (para que el líder del ministerio vea a los
inscritos). Postgres lo detectó en cuanto se abrió `/actividades` con
sesión real:

    ERROR: infinite recursion detected in policy for relation "activities"

`0025` rompe el ciclo en ambas direcciones con funciones
`SECURITY DEFINER` (`is_activity_participant`, `activity_ministry_id`),
que corren como dueño de la tabla y no re-evalúan RLS — mismo patrón que
`is_ministry_leader()`.

**Regla general para este proyecto**: si la política de A consulta B y la
de B consulta A, hay que meter al menos una de las dos consultas en una
función `SECURITY DEFINER`.

## 8.f Identidad de cuenta: person_id ya no se puede falsificar ni cambiar (2026-09-05)

Auditoría de la Fase 1 (identidad y acceso) encontró dos fallos reales,
ninguno visible por `lint`/`typecheck`/`build`, ambos explotables sin
pasar por la app:

- `handle_new_auth_user()` confiaba en `raw_user_meta_data.person_id`
  — el campo `data` del endpoint público `POST /auth/v1/signup`, que
  cualquiera puede rellenar con la `anon key` sin usar `registerAction`.
  Alguien que conociera el `id` de una persona en el directorio podía
  "ser" esa persona registrándose. Corregido: el trigger ahora exige
  `raw_app_meta_data.person_id`, que solo la Admin API (service_role)
  puede escribir.
- `profiles_update_own` no restringía columnas: cualquier usuario podía
  `PATCH /rest/v1/profiles` y reasignar su propia cuenta a cualquier
  persona del directorio sin cuenta todavía. Corregido con un trigger
  (`prevent_profile_person_id_change`) que bloquea todo cambio de
  `person_id` salvo por `admin_relink_profile()` (exige administrador,
  audita en `audit_log`).

Ver `supabase/migrations/0027_identity_protection.sql` para el detalle
completo y `scripts/verify-security-phase1.ts` para las pruebas de
regresión (pendientes de correr contra la base real — ver `docs/progress.md`).

## 8.g Invitación verificable al portal (2026-09-05)

Nueva tabla `portal_invitations` + funciones `create_portal_invitation()`
/ `revoke_portal_invitation()`: la vía prevista desde `0004_profiles.sql`
para activar el portal de una persona YA EXISTENTE sin crear otro
expediente y sin fusionar por coincidencia de nombre/teléfono/email no
verificado, pero que nunca se había construido. Solo se guarda el hash
del token (sha256); el valor crudo se muestra una sola vez a quien la
crea (staff con acceso de escritura sobre `people`), para compartirlo
por un canal separado (WhatsApp, en persona) — este proyecto no envía
emails reales todavía (`RESEND_API_KEY` pendiente, ver `.env.local`).
UI en la ficha de persona (`InvitePortalCard`), aceptación pública en
`/activar-portal`.

## 8.h Ámbito real del rol pastor en RLS (2026-09-05)

La decisión del 2026-09-02 ("pastor administra solo lo que lidera/imparte")
quedó bien reflejada en `is_admin()` (0023) y en los guards de servidor
de `ministerios/actions.ts`, pero **ocho políticas RLS** en
`course_categories`, `courses`, `class_offerings`, `class_sessions`,
`enrollments`, `attendance_records`, `ministries` y
`ministry_memberships` seguían dándole a cualquier `pastor` acceso de
escritura global (no acotado). `0028_pastor_scope.sql` lo corrige:
pastor queda con el mismo ámbito que `maestro`
(`teacher_person_id = current_person_id()`) en cursos, y el mismo que
cualquier líder no-staff (`leader_person_id`/`is_ministry_leader()`) en
ministerios. Además se le quitó a `pastor` la capacidad de **crear**
ministerios nuevos (el flujo documentado es que administrador/coordinador
lo crea y luego designa al pastor como líder).

## 8.i Escalada de acceso a oración vía membresía, no solo vía el flag (2026-09-05)

`0021`/`0022` protegieron correctamente quién puede marcar
`ministries.grants_prayer_access`. Pero `is_prayer_reader()` también
concede lectura a cualquier `lider`/`colider` **activo** del ministerio
marcado — y nada protegía ESA membresía: un `coordinador_ministerio`
(rol global) o el propio líder del ministerio de intercesión podían
agregarse a sí mismos o a un tercero como colíder mediante una edición
ordinaria de `ministry_memberships`, obteniendo lectura de TODAS las
peticiones de oración sin pasar por `set_prayer_ministry()` ni dejar
ningún rastro dedicado. `0029_prayer_membership_guard.sql` cierra esta
vía con un trigger: solo `administrador` puede crear/ascender/reactivar
una membresía `lider`/`colider` en un ministerio con
`grants_prayer_access = true`. La revocación (bajar a `miembro`) sigue
abierta a cualquiera con permiso de escritura sobre esa membresía — solo
otorgar el acceso requiere admin. También se protegió reactivar
`is_active` en el ministerio marcado, por el mismo motivo.

## 8.j Gestión de permisos: guardado transaccional y cierre de escritura directa (2026-09-06)

Se mueve la gestión de roles de la "pared de botones" de `/admin`
(otorgar/quitar rol = escritura inmediata por fila, sin resumen ni
transacción) a la pestaña "Cuenta y permisos" del perfil de cada
persona (`0030_permissions_management.sql`), con un guardado
transaccional explícito. Cambios de fondo:

- `admin_set_person_roles(p_person_id, p_expected_roles, p_new_roles, p_reason)`
  aplica el conjunto completo de roles deseado en una sola función
  `plpgsql` (todo o nada), compara `p_expected_roles` contra el estado
  real en la base para detectar ediciones desactualizadas (rechaza con
  `STALE_ROLES:` en vez de sobrescribir en silencio), y audita
  antes/después/agregados/quitados con `log_audit_event`. Es un no-op
  (sin escritura ni auditoría) si `p_expected_roles == p_new_roles`.
- **Último administrador**: la garantía real y a prueba de condiciones
  de carrera vive en un trigger `BEFORE DELETE` sobre `user_roles`
  (`user_roles_guard_last_admin_trg`), que serializa con
  `pg_advisory_xact_lock` de alcance de **transacción** (se libera solo
  al hacer commit/rollback). Esto cubre cualquier vía de borrado, no
  solo la RPC nueva. El chequeo dentro de `admin_set_person_roles` es
  solo un atajo de mensaje más claro, documentado explícitamente como
  NO la garantía de concurrencia.
- **Cierre de la vía antigua**: se retira `user_roles_all_admin` (RLS)
  y se reemplaza por una política de solo lectura
  (`user_roles_select_admin`). A partir de esta migración, `user_roles`
  ya **no acepta ninguna escritura por PostgREST** — la única vía es una
  función `security definer` (`admin_set_person_roles` o
  `grant_default_role` de `0004`). Las Server Actions viejas
  (`grantRoleAction`/`revokeRoleAction` en `admin/actions.ts`) se
  eliminaron del código; aunque no se hubieran eliminado, la RLS ya
  rechazaría el INSERT/DELETE directo.
- `admin_get_account_for_person(p_person_id)` expone el email de
  **autenticación** (`auth.users.email`) y su estado de verificación
  para la sección "Cuenta" — nunca `people.email` (el de contacto), que
  puede estar lleno sin que exista ninguna cuenta.
- `list_users_with_roles` gana búsqueda (`p_search`) y paginación
  (`p_limit`/`p_offset`), y ahora también devuelve `person_id` (para
  saber a qué ficha ir y para detectar cuentas sin perfil asociado, que
  se muestran tal cual, sin vincularse automáticamente).

Todas las funciones nuevas repiten el guard `if not is_admin()` en el
propio cuerpo (defensa en profundidad, independiente de la Server
Action que las llama). `Mi portal` no cambia: sigue sin ninguna vía para
que un miembro edite sus propios roles o su `person_id` (ver `0015` y
`0027`).

## 8.k Pastor y maestro: solo personas a su cargo (2026-10-01, 0045)

- `has_directory_access()` (administrador, seguimiento, intercesor,
  coordinador, + apostol) sustituye a `is_staff()` en la lectura de
  `people`, `profiles`, `enrollments`, `attendance_records`,
  `ministry_memberships`, `activities`, `activity_participants`,
  `service_checkins` y en `list_service_attendance()`.
- `is_in_my_care(person_id)` (security definer): miembro de un ministerio
  que lidero o alumno (actual o pasado) de una clase que imparto. Da
  lectura del historial de esas personas.
- `class_offerings`/`class_sessions` ya no son legibles por cualquier
  usuario autenticado: `can_see_class()` (directorio, mi clase, estoy
  matriculado, o un alumno a mi cargo pasó por ella).
- `people` UPDATE: el pastor solo sobre su gente o lo que creó; el
  maestro no edita personas.
- Visitantes/notas de seguimiento e importación ya no incluyen `pastor`.
- La lista para matricular (`list_people_for_class_enrollment`) expone
  solo id y nombre, y solo a quien imparte esa clase (o gestión).
- **Sin cambio**: encuestas y notificaciones siguen con `is_staff()`;
  `list_people_for_ministry_picker` (0019) sigue dando nombres a staff y
  líderes para agregar miembros.
- Pruebas: `tests/db/scope.test.ts`.

## 8.l Borrar personas creadas por error (2026-10-01, 0046)

- Solo `apostol` (`delete_person`, `person_delete_blockers`, security
  definer con `is_apostol()`); motivo obligatorio; `audit_log`
  `person.delete` con nombre y motivo.
- Rechaza si la persona tiene cualquier registro ligado (matrícula,
  asistencia, ministerios, actividades, inscripciones, check-ins,
  seguimiento, oración, donaciones, cartas, certificaciones, encuestas, o
  es maestro/líder/responsable). Bitácoras que solo la mencionan (emails,
  filas de importación) se desligan; invitaciones caen en cascada.
- Borra su cuenta (`auth.users` → profile y roles en cascada) en la misma
  transacción. No permite la propia cuenta ni cuentas con SuperAdmin o
  Finanzas (primero se revocan en Finanzas → Acceso). Cualquier otra
  referencia no prevista (FK) aborta todo con "tiene registros".

## 8.m Auditoría de privacidad y seguridad (2026-10-01)

Informe completo: `docs/audit/2026-10-privacidad-seguridad.md` (inventario,
proveedores, marco legal con fuentes, hallazgos H-01–H-20, pruebas y
preguntas para revisión legal). Corregido: Next.js 16.3.8 (RCE
críticos), cabeceras de seguridad (`next.config.ts`), `0047` (bitácora
de emails y respuestas de encuestas ya no visibles a todo el staff),
escapado de HTML en emails del personal, secreto de cron en tiempo
constante, aviso de datos en la forma pública de inscripción.
Pendientes: política de privacidad, retención, exportación de datos,
anonimización y baja de iglesia, registro público, MFA, contratos (DPA)
y plan de incidentes.

## 8.n CAPTCHA (Cloudflare Turnstile, 2026-10-01)

- Widget en login, registro, recuperar contraseña y la forma pública de
  inscripción (`src/components/captcha/turnstile.tsx`). Token de un solo
  uso; el widget se reinicia después de cada envío.
- **Auth** (login, registro, recuperar): el token se pasa a Supabase
  (`captchaToken`), que lo verifica **si** su CAPTCHA está activo en el
  panel (Authentication → Attack Protection). Solo así se protegen
  también las llamadas directas a la API de Auth.
- **Inscripción pública**: el servidor verifica el token
  (`src/lib/captcha.ts`, `siteverify`) y luego llama a
  `submit_activity_registration` con la llave de servicio; `0048` le
  quitó el permiso a `anon` y `authenticated` (ya no se puede llamar
  directo con la llave pública).
- Sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY` el CAPTCHA no aparece (solo
  desarrollo). Con site key pero sin secreto, la inscripción **falla
  cerrada**.
- Pruebas: `tests/db/registrations.test.ts` (anon ya no puede inscribir
  directo). Navegador: login con token, envío sin token rechazado y
  widget reiniciado.

## 8.o Aviso de privacidad y borrado del propio perfil (2026-10-03, 0049)

- `accept_privacy_notice`: solo actualiza el perfil de `auth.uid()`;
  versión validada con formato de fecha.
- `delete_my_account`: security definer sobre `auth.uid()` (nunca recibe
  un id), confirmación literal `BORRAR`, rechaza SuperAdmin/Finanzas; el
  guard del último administrador sigue aplicando. Según lo ligado: borra,
  anonimiza o deja pendiente de revisión (donaciones, cartas,
  certificaciones). La cuenta se borra o, si una referencia lo impide, se
  vacía y bloquea (sin contraseña, identidades ni sesiones).
- `anonymize_person`: solo `apostol`, motivo obligatorio, no la propia
  cuenta ni SuperAdmin/Finanzas; `audit_log`.
- Funciones internas `_person_links`, `_anonymize_person`,
  `_remove_auth_user` sin `execute` para `anon`/`authenticated`.
- Bitácora `person.self_delete` sin actor ni nombre (no conserva el dato
  que se pidió borrar).
- Límites: copias de seguridad, emails ya enviados y logs de proveedores
  (`docs/privacy.md` §5). Ver detalle en `docs/privacy.md`.

## 9. Datos de menores

Por ahora el modelo solo ofrece la función `is_minor(birth_date)`
(calculada al vuelo) como dato informativo. No se implementa manejo especial de
consentimiento parental, contactos de emergencia, ni restricciones
adicionales de visualización de menores — se documenta como decisión
pendiente en `docs/assumptions.md` hasta recibir requisitos explícitos
del usuario (regla explícita: "no implementes información detallada de
menores sin requisitos explícitos").

## 10. Checklist de revisión de seguridad antes de producción

Ver la sección correspondiente en `docs/deployment.md`.
