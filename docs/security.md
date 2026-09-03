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

## 5. Check-in por QR

- El QR de una persona no codifica su `person_id` en texto plano de
  forma permanente. Codifica un token firmado (HMAC-SHA256 con
  `QR_CHECKIN_SECRET`) que incluye `person_id` + `exp` (expiración
  corta). Ver `src/lib/checkin/token.ts`.
- `POST /api/checkin/scan` valida la firma y expiración en el servidor
  antes de crear el `service_checkin`, usando el cliente Supabase de
  servidor con la sesión del operador (respeta RLS, no usa
  `service_role`).
- Si el token expiró, se rechaza con un mensaje claro para regenerar el
  QR (el portal del miembro puede regenerarlo bajo demanda).

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
- `/check-in/publico` sigue accesible a cualquier autenticado: es el
  auto check-in por QR fijo (ver `docs/architecture.md` §5).
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
