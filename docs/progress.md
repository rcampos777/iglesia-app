# Progreso del proyecto

Última actualización: 2026-09-02.

## Estado general: MVP verificado de punta a punta ✅

El bloqueo de entorno original (sin Docker/Supabase CLI) se resolvió:
el usuario proveyó credenciales de un proyecto Supabase Cloud de
**desarrollo** (`jlmabwnbtwjrtqaxfafx`). Con eso, en esta sesión se:

1. Aplicaron las 16 migraciones contra la base real (`supabase db push`
   vía el connection pooler — el host directo solo tiene IPv6 y no es
   alcanzable desde este entorno de agente, ver `docs/decisions.md`).
2. Encontraron y corrigieron **2 bugs reales de SQL** que solo se
   manifiestan contra Postgres real (no detectables por
   lint/typecheck): `is_minor` como columna generada con `current_date`
   (no inmutable) y un error de orden de dependencias en la política
   RLS `people_select_self` (referenciaba `profiles` antes de que
   existiera). Ver `docs/decisions.md` para el detalle.
3. Corrió `npm run seed` exitosamente: 7 cuentas de prueba (una por
   rol), 40 personas sintéticas, 3 clases con matrícula/asistencia, 1
   servicio con 15 check-ins, 4 seguimientos de visitantes, 4
   peticiones de oración.
4. Se verificó **manualmente en navegador, con sesión real**, cada uno
   de los 14 módulos funcionales — ver la lista de pruebas realizadas
   abajo. Todo funcionó sin errores de consola.

**Lo que queda pendiente** ya no es "¿funciona?" sino pulido y
alcance adicional — ver "Fase 16" abajo.

## Verificación end-to-end realizada (con datos reales, rol por rol)

Como **administrador** (`admin@iglesia.test`):

- Login real, dashboard con conteos reales (47 personas, 4 visitantes en
  seguimiento, 3 clases activas, 4 peticiones abiertas).
- Directorio de personas: listado, búsqueda, detalle/edición.
- Cursos y clases: detalle de "Discipulado I", matrícula con % de
  asistencia calculado correctamente (75%, 100%, 50%...), panel de
  sesiones y asistencia.
- Peticiones de oración: bandeja sin mostrar contenido en la lista,
  detalle con contenido + aviso de auditoría.
- Portal del miembro: código QR generado correctamente (qrcode.react +
  token firmado), formulario de contacto precargado.
- Administración de usuarios: los 7 roles sembrados se muestran
  correctamente; **se otorgó y luego revocó un rol de prueba** —
  confirmado que la escritura contra `user_roles` (RLS + auditoría) y
  la función RPC `list_users_with_roles()` funcionan.
- Reportes: las 5 tarjetas de agregados muestran datos reales
  correctos.
- Check-in: check-in manual registrado exitosamente contra un servicio
  real (16 check-ins tras la prueba).
- Visitantes: listado con estatus reales.
- Importar datos: **flujo completo probado** — captura manual → fila en
  staging → "Aprobar como nuevo" → `promote_import_row()` (RPC) →
  persona nueva visible en el directorio.
- Encuestas: creación de encuesta con pregunta de texto libre → vista de
  resultados (staff) mostrando la pregunta con "sin respuestas".

Como **miembro** (`miembro@iglesia.test`) — **pruebas negativas de
seguridad**:

- Nav lateral correctamente oculta Personas/Check-in/Visitantes/
  Oración/Importar/Reportes/Administración (solo muestra Panel, Cursos
  y clases, Mi portal, Encuestas).
- Navegación **directa** a `/personas` (bypaseando el nav oculto): RLS
  restringe correctamente a solo su propio registro ("1 personas
  registradas", sin botón de crear) — confirma que
  `people_select_self`/`people_select_staff` funcionan como se
  diseñaron.
- Navegación directa a `/admin` y a `/oracion`: ambas redirigen a
  `/dashboard` (guard de rol en la página).
- Portal del miembro: ve su propio QR y su propia información,
  correctamente aislado.

Sin errores de consola del navegador en ninguna de las pruebas
anteriores.

## Fases (orden de prioridad del producto)

| #   | Fase                              | Estado                                                                     |
| --- | --------------------------------- | -------------------------------------------------------------------------- |
| 1   | Base del proyecto y documentación | ✅ Hecho                                                                   |
| 2   | Modelo de datos                   | ✅ 16 migraciones aplicadas y verificadas contra Postgres real             |
| 3   | Autenticación                     | ✅ Verificado end-to-end (login/logout real, multi-rol)                    |
| 4   | Roles y permisos                  | ✅ Verificado end-to-end (RLS positivo y negativo, panel admin)            |
| 5   | Directorio central de personas    | ✅ Verificado end-to-end                                                   |
| 6   | Cursos y clases                   | ✅ Verificado end-to-end                                                   |
| 7   | Matrícula, asistencia y progreso  | ✅ Verificado end-to-end                                                   |
| 8   | Importación y deduplicación       | ✅ Verificado end-to-end (solo CSV; Excel/Access ver abajo)                |
| 9   | Visitantes y seguimiento          | ✅ Verificado end-to-end                                                   |
| 10  | Portal del miembro                | ✅ Verificado end-to-end                                                   |
| 11  | Check-in QR                       | ✅ Check-in manual verificado; escaneo QR verificado por código            |
| 12  | Peticiones de oración             | ✅ Verificado end-to-end, incluida auditoría de acceso                     |
| 13  | Emails y encuestas                | 🔶 Encuestas verificadas; emails sin probar (falta Resend real)            |
| 14  | Paneles y reportes                | ✅ Verificado end-to-end                                                   |
| 15  | Revisión de seguridad             | ✅ Auditoría de RLS/guards + pruebas negativas reales en vivo              |
| 16  | Preparación para producción       | 🔶 Ver checklist en `docs/deployment.md` §5                                |
| 18  | **Actividades**                   | ✅ Verificado end-to-end contra Supabase real, incluidas pruebas negativas |
| 17  | **Ministerios**                   | ✅ Verificado end-to-end y desplegado en la app en vivo                    |

## Fase 16 — qué falta para producción

- [ ] Configurar dominio verificado en Resend y probar envío real de
      emails (`RESEND_API_KEY` sigue siendo un placeholder).
- [ ] Parser real de `.xlsx` para importación (hoy solo CSV; Excel/Access
      requieren exportarse a CSV primero).
- [ ] Ampliar la cobertura de Playwright más allá de los smoke tests
      actuales (`tests/e2e/auth.spec.ts`) — ahora que hay un proyecto de
      desarrollo real disponible, se puede escribir la lista completa de
      `docs/testing.md` §3 contra él.
- [ ] Probar el escaneo real de un código QR (ya se probó el check-in
      manual; el escaneo usa la misma función `scanCheckinAction`,
      verificada por revisión de código, pero no por un escaneo real en
      navegador).
- [ ] Crear un proyecto Supabase **separado** para producción (no
      reusar el de desarrollo) y repetir: aplicar migraciones, otorgar
      el primer administrador, checklist de `docs/deployment.md` §5.
- [ ] Generar un `QR_CHECKIN_SECRET` único de producción (el actual es
      solo para desarrollo).
- [ ] **Autorización explícita del usuario antes de publicar** (regla
      dura, no negociable).

## Datos de prueba en el proyecto de desarrollo

Proyecto Supabase: `jlmabwnbtwjrtqaxfafx` (desarrollo). Cuentas de
prueba (contraseña `Iglesia2026!Dev` para todas, ver `scripts/seed.ts`):
`admin@iglesia.test`, `pastor@iglesia.test`, `coordinador@iglesia.test`,
`maestro@iglesia.test`, `seguimiento@iglesia.test`,
`intercesor@iglesia.test`, `miembro@iglesia.test`. Además quedaron dos
registros de la verificación manual de esta sesión ("Prueba Sintética"
en personas, "Encuesta de prueba" en encuestas) — inofensivos y
claramente sintéticos, se pueden borrar sin problema si se quiere un
dataset más limpio.

## Despliegue

- **Repositorio**: [github.com/rcampos777/iglesia-app](https://github.com/rcampos777/iglesia-app)
  (rama `main`). **Autenticación de git: SSH** desde 2026-09-02. El PAT
  anterior dejó de funcionar (GitHub no acepta contraseña de cuenta desde
  2021, y el token estaba vencido); se generó una llave `ed25519` en la
  máquina del usuario y se registró en GitHub, y el remoto se cambió a
  `git@github.com:rcampos777/iglesia-app.git`. Historial previo: push
  directo del usuario vía terminal con un PAT —
  las integraciones de GitHub App vía MCP para Claude y para Vercel
  tenían permisos insuficientes para escribir/crear proyecto por API;
  se resolvió manualmente).
- **App en vivo (vista previa, no "producción" formal)**:
  https://iglesia-app-teal.vercel.app — conectada a GitHub, cada
  `git push` a `main` redespliega automáticamente. Sigue usando el
  proyecto Supabase de **desarrollo** (`jlmabwnbtwjrtqaxfafx`, datos
  sintéticos), no uno de producción separado.
- `RESEND_API_KEY`/`RESEND_FROM_EMAIL` son placeholders en Vercel — los
  emails no funcionan todavía ahí.
- Verificado en el dominio público real: login, dashboard con datos
  reales, y el flujo nuevo de auto check-in (ver bitácora de abajo) — 0
  errores de consola.

## Próxima tarea

Estado al cierre del 2026-09-02: todo lo construido está aplicado contra
el Supabase de desarrollo y desplegado en
https://iglesia-app-teal.vercel.app. Repositorio limpio, sin cambios
pendientes de publicar.

**Bloqueado esperando al usuario:**

1. **Archivo del logo real.** El logo actual es un monograma "CA"
   provisional construido en código. Hace falta el SVG (o PNG ≥1000 px
   con fondo transparente), una versión clara para el menú en carbón, y
   un icono cuadrado. Pasos exactos en `docs/design.md` §4.
2. **La lista de requisitos de la reunión con la Pastora Didi.** Nunca
   llegó. Todo lo construido salió del objetivo principal y de las
   correcciones del usuario sobre la marcha. El usuario confirmó que la
   trayectoria de la persona era parte de esa lista, así que
   probablemente haya más puntos sin cubrir.
3. **Decisión sobre un rol `apostol`.** El usuario mencionó que los
   pastores de la iglesia como tal son apóstoles y son el rango más
   alto. Hoy la cima es `administrador`, que es un rol _técnico_ (gestiona
   el sistema), no eclesial. Falta decidir si se crea un rol eclesial con
   visión completa pero sin la parte de administración de sistema.

**Deuda técnica anterior, sigue vigente:**

- Credenciales reales de Resend (los emails no funcionan todavía).
- Parser real de `.xlsx` para importación (hoy solo CSV).
- Ampliar Playwright más allá de los smoke tests: hoy hay 12 pruebas,
  todas de protección de rutas. Los flujos completos (crear ministerio,
  inscribir en actividad, pasar lista, autorización por ámbito) están
  verificados **manualmente** contra la base real, pero no automatizados.
- Proyecto Supabase **separado** para producción (hoy la app en vivo usa
  el de desarrollo, con datos sintéticos) y `QR_CHECKIN_SECRET` propio.

**Dato personal real pendiente de decisión**: hay un registro real en la
base de desarrollo (`dididbg@gmail.com`, creado 2026-09-01), contra la
regla 7 de `CLAUDE.md`. El usuario confirmó que es real y fue una prueba
suya. Su cuenta quedó confirmada y puede iniciar sesión normalmente. No
se ha borrado nada, a la espera de que el usuario decida.

**Por revisar en el dashboard de Supabase** (no accesible desde el
agente): Authentication → URL Configuration, confirmar que _Site URL_
apunte a `https://iglesia-app-teal.vercel.app` y no a `localhost:3000`.
Es la causa más probable del error que vio una usuaria real al confirmar
su email.

## Bitácora

### 2026-09-02 — Trayectoria de la persona (requisito de la Pastora Didi)

En la ficha de una persona, el staff ahora ve **por dónde ha pasado y
dónde está hoy**: entrada al directorio, primera visita y seguimiento,
ruta de formación (cursos con estado y % de asistencia), ministerios
donde sirve o sirvió, actividades y check-ins — todo en una línea de
tiempo.

**Sin migración**: no hacía falta ninguna tabla nueva. Los datos ya
existían repartidos en cinco módulos; lo que faltaba era juntarlos. Las
políticas RLS existentes ya permiten al staff leerlos todos.

Caso verificado en vivo, con sesión real de **pastor**, sobre una persona
que recorrió la ruta completa: primera visita (5 ene) → directorio →
Discipulado I / Nuevos convertidos **completado** con 100% de asistencia
→ Escuela de líderes / Liderazgo **en progreso** con 50% → empezó a
servir en Ujieres. Es exactamente el "algo tangible de dónde está hoy la
persona" que pidió el usuario.

Nota sobre los datos de prueba: las fechas sintéticas no son coherentes
entre sí (`enrolled_at` de agosto con `completed_at` de mayo), así que la
línea de tiempo de esa persona se ve desordenada. No es un fallo del
código — ordena bien por fecha; es el dato sembrado.

### 2026-09-02 — Módulo de Actividades

Eventos puntuales de la iglesia (retiros, campañas, convivencias), con
inscripción previa y pase de lista posterior — separados a propósito de
`services`, que son los cultos recurrentes con check-in.

- Migración `0024`: `activities` + `activity_participants`, enum
  `activity_status`, función `can_manage_activity()` y un trigger que
  mantiene `attended_at` coherente con `attended`.
- **Enganchado a Ministerios**: si la actividad pertenece a un
  ministerio, su líder la organiza sin necesitar rol de staff. El pastor
  entra solo por esa vía, coherente con el recorte del 2026-09-02.
- UI: `/actividades`, `/actividades/nueva`, `/actividades/[id]` con
  inscripción, cupo, pase de lista y edición. Integrado en el portal
  ("Mis actividades"), reportes y panel.

**Bug real encontrado en vivo**: `0024` dejó políticas RLS mutuamente
recursivas y Postgres abortó al abrir la página. Corregido en `0025`
con funciones `SECURITY DEFINER`. Ver `docs/security.md` §8.e.

**Verificado en vivo**: como administrador, listado con conteos correctos
y **pase de lista con escritura real** (11 → 12 asistentes, confirmado
consultando la base, no solo la UI optimista). Como pastor (lidera solo
Intercesión, sin actividades): ve 0 y las 3 URLs directas de actividades
ajenas lo rechazan. Como miembro: ve sus 2 actividades en el portal y las
3 rutas de `/actividades` lo redirigen a `/portal`. 12/12 Playwright.

### 2026-09-02 — El rol `pastor` deja de ser administrador

A raíz de que el usuario probó una cuenta normal y luego explicó su
realidad organizacional (muchos pastores de área, varios de título sin
nada a su cargo; el rango más alto son los apóstoles), se acotó el rol
`pastor`. Migraciones `0020`–`0023`. Ver `docs/decisions.md` y
`docs/security.md` §8.d.

**Un bug de seguridad encontrado por una prueba negativa**: el primer
blindaje del flag `grants_prayer_access` (`0021`) usaba `revoke update
(columna)`, que en Postgres **no hace nada** si el rol ya tiene `UPDATE`
de tabla. Se descubrió al intentar la escalada con un token real de
`coordinador_ministerio`: el intento no fue rechazado por permisos, sino
que llegó al índice único. Corregido en `0022` con un trigger. Las 6
pruebas negativas se re-ejecutaron y todas quedan bloqueadas.

### 2026-09-02 — Cierre de alcance para el rol `miembro`

El usuario creó una cuenta normal y reportó que veía cosas que no
debería. Auditoría: **8 páginas no redirigían** — el menú las ocultaba,
pero la URL directa funcionaba. RLS limitaba los datos, no el acceso a la
página. Corregido: todas redirigen a `/portal` para quien no es staff.
Ver `docs/security.md` §8.c para el detalle y las excepciones
deliberadas. Verificado en vivo con rol único `miembro`: 11/11 rutas
redirigen y el menú queda en "Panel | Mi portal".

### 2026-09-02 — Desplegado en vivo + bug del enlace de confirmación

- **Push y despliegue**: 3 commits a `main`; Vercel redesplegó y se
  verificó `/ministerios` y `/reportes` **en el dominio público** con
  sesión real de `coordinador@iglesia.test`. Todas las peticiones de red
  en 200, sin errores de consola.
- **Bug real corregido**: la página de login ignoraba por completo el
  parámetro `?error=auth` con el que el callback de auth la redirigía.
  Cuando la confirmación de email fallaba, la persona aterrizaba en el
  formulario sin ninguna explicación. Le pasó a una usuaria real en
  desarrollo. Ahora el callback distingue la causa (error devuelto por
  Supabase, falta de `code`, o fallo del intercambio) y el login explica
  la causa más común: **abrir el enlace en un navegador distinto al del
  registro**, que rompe el intercambio PKCE (el `code_verifier` vive en
  una cookie del navegador original) aunque la cuenta sí quede
  confirmada.
- **Pendiente de revisar en el dashboard de Supabase** (Authentication →
  URL Configuration): confirmar que _Site URL_ apunte a
  `https://iglesia-app-teal.vercel.app` y no a `localhost:3000`. Si
  apunta a localhost, el enlace confirma correctamente pero después manda
  el navegador a una dirección que no existe en el equipo de la persona,
  y se ve como error.

### 2026-09-02 — Ministerios verificado en vivo + bug real corregido (0019)

El usuario proveyó la contraseña de base de datos (tras resetearla en el
dashboard; no afecta a la app, que habla por HTTPS con las llaves API).
Se aplicaron `0018` y `0019` contra el proyecto de desarrollo
(`jlmabwnbtwjrtqaxfafx`, pooler `aws-0-us-east-1`).

**Bug real encontrado al probar en vivo, no detectable por lint/typecheck
ni por pruebas sin sesión** — corregido en `0019`:

`0018` le daba al líder de un ministerio acceso a `ministry_memberships`
de su ministerio, pero la RLS de `people` sigue limitando a un no-staff a
su propio registro. Al iniciar sesión como líder sin rol de staff, su
equipo aparecía como **"? ?" / "sin contacto"** y el selector para
agregar gente salía vacío ("todas las personas ya sirven aquí"): la
función de líder quedaba inservible. `0019` lo resuelve con el mínimo
acceso necesario, en dos piezas:

1. Política `people_select_ministry_leader`: el líder lee el registro de
   las personas **de su ministerio** (incluidas las que ya salieron, para
   que el histórico muestre nombres).
2. RPC `list_people_for_ministry_picker()`: devuelve **solo id + nombre**
   (nunca email, teléfono, dirección ni notas) para poder elegir a quién
   agregar, sin dar lectura del directorio completo.

**Verificación en navegador con sesiones reales:**

- Como `coordinador@iglesia.test`: catálogo con los 5 ministerios y
  conteos correctos, detalle de Alabanza con su equipo, formulario de
  alta, edición, tarjeta "Personas sirviendo por ministerio" en reportes
  (29 = 28 sembradas + 1 de prueba) y "Ministerios activos: 5" en el
  panel.
- Como `miembro@iglesia.test` (**rol único `miembro`, sin staff**),
  hecha líder de Ujieres a propósito para probar la autorización por
  ámbito:
  - ✅ Ve y gestiona **su** ministerio (nombres y contactos correctos
    tras `0019`; selector con 44 personas, excluyendo a las 4 que ya
    sirven).
  - ✅ **No** ve la tarjeta "Editar ministerio" (solo admins).
  - ✅ Prueba negativa: en Medios (que no lidera) ve 0 miembros, sin
    controles de gestión — RLS bloquea.
  - ✅ Prueba negativa clave: `/personas` le muestra **4 personas**
    (ella + su equipo), no las 49 del directorio — la política nueva
    concede exactamente el ámbito previsto, ni una fila más.
  - ✅ Portal muestra "Donde sirvo: Ujieres — Líder".
- Prueba de RLS por API: con `service_role` se ven los 5 ministerios;
  con la llave `anon` sin sesión, `ministries` y `ministry_memberships`
  devuelven `[]`.
- Vista móvil (375px) verificada. 0 errores de consola reales (hubo uno
  transitorio de caché de esquema de PostgREST justo tras crear la
  función, ya resuelto y comprobado por API).

### 2026-09-02 — Módulo de Ministerios

Reunión con la Pastora Didi: la plataforma debe ser el sistema central
para personas, **ministerios**, cursos, clases y actividades. De esos,
ministerios era el hueco completo (no existía tabla, ruta ni tipo);
actividades sigue pendiente (hoy solo existen `services` para check-in).

- **Migración `0018_ministries.sql`**: tablas `ministries` y
  `ministry_memberships` + enum `ministry_member_role`
  (`lider | colider | miembro`) + función `is_ministry_leader()`. RLS
  habilitado con políticas explícitas en ambas (26/26 tablas del
  proyecto tienen RLS).
- **Autorización por ámbito** (novedad en el proyecto): el líder de un
  ministerio gestiona su propio equipo sin necesitar rol de staff
  global. Aplicado en dos capas independientes: política RLS
  `ministry_memberships_write` y guard de servidor
  `requireMinistryManager()`. Ver `docs/decisions.md`.
- **El rol `coordinador_ministerio` por fin tiene ámbito**: existía
  desde `0002_roles.sql` y aparecía en las políticas RLS de medio
  proyecto, pero no había ministerios que coordinar.
- **Histórico preservado**: dar de baja a alguien marca `left_at`, no
  borra la fila. Índice único parcial para permitir reingresos sin
  duplicar membresías activas.
- **UI**: `/ministerios` (catálogo), `/ministerios/nuevo`,
  `/ministerios/[id]` (equipo, cambio de responsabilidad, baja con
  confirmación, histórico, edición para admins).
- **Integraciones**: "Sirve en" en la ficha de persona, "Donde sirvo" en
  el portal del miembro, tarjeta "Personas sirviendo por ministerio" en
  reportes, conteos en el panel (staff y miembro).
- **Seed**: 5 ministerios sintéticos con equipos; el coordinador de
  prueba lidera el primero, para poder verificar en vivo la
  autorización por ámbito. En la base de desarrollo ya poblada se sembró
  con un script puntual (no `npm run seed` completo, que habría
  duplicado 40 personas, clases y seguimientos).
- **Pruebas**: 3 nuevas de Playwright (9/9 pasan). Nota: los binarios de
  navegador de Playwright no estaban instalados en esta máquina; se
  resolvió con `npx playwright install chromium`.
- `typecheck`, `lint`, `format:check` y `build` limpios (29 rutas).

### 2026-08-17 — Despliegue a Vercel + auto check-in con QR fijo

- App desplegada en Vercel (ver "Despliegue" arriba), conectada a
  GitHub para CI/CD automático.
- **Nuevo flujo de check-in** (a pedido del usuario, más simple que el
  QR-por-persona original): la iglesia imprime **un solo QR fijo**
  (apunta a `/check-in/publico`, nunca cambia) para pegar en la
  entrada. Cada persona lo escanea con su propio celular, inicia
  sesión si hace falta, y confirma su propia asistencia a cualquier
  servicio abierto (`is_checkin_open`). Staff controla qué servicio
  está "abierto" con un switch en `/check-in`. El flujo original
  (QR personal + operador escaneando) se mantiene como alternativa
  para niños/visitantes sin cuenta — ver `docs/architecture.md` §5 y
  `docs/decisions.md`.
- Migración `0017_self_checkin.sql`: política RLS
  `service_checkins_insert_self` (persona puede insertar su propio
  check-in solo si el servicio está abierto) — aplicada contra la base
  real.
- Se agregó soporte de `?next=` en login (con validación de que sea
  una ruta interna, nunca una URL externa) para que, al escanear el QR
  sin sesión iniciada, tras loguearse se regrese automáticamente a la
  página de check-in en vez de al dashboard.
- **Verificado en vivo (navegador real, ambos roles)**: como
  `coordinador@iglesia.test`, el servicio "Culto dominical" aparece
  abierto y el QR fijo se genera correctamente; como
  `miembro@iglesia.test`, se confirmó asistencia exitosamente, se
  verificó que persiste tras recargar (confirma escritura real en DB,
  no solo estado optimista de UI), y se verificó el flujo completo de
  `/check-in/publico` sin sesión → redirect a `/login?next=...` →
  login → regreso automático a `/check-in/publico`. 0 errores de
  consola en todo el flujo.
- `npm run typecheck`, `lint`, `format`, `build` limpios (26 rutas).

### 2026-08-16 — sesión de construcción del MVP completo

Se construyó el MVP completo (14 módulos funcionales) en una sola
sesión continua, siguiendo el orden de prioridad del producto:

1. **Fundación**: Next.js 16 (App Router, TS estricto), Tailwind v4 +
   shadcn/ui, `CLAUDE.md`, 11 documentos en `docs/`, `.env.example`,
   `.gitignore` contra datos personales/secretos.
2. **Modelo de datos**: 16 migraciones SQL con RLS y funciones
   auxiliares (`has_role`, `is_staff`, `is_admin`, `current_person_id`,
   `promote_import_row`, `log_prayer_request_access`, `log_audit_event`,
   `update_own_contact_info`, `list_users_with_roles`, `is_minor`).
   **Nota técnica**: los tipos `Row` en `src/types/database.ts` deben
   ser `type`, no `interface` (ver `CLAUDE.md` §10).
3. **Autenticación**: login, registro, recuperar/restablecer
   contraseña, callback de confirmación.
4. **Roles y permisos**: RBAC completo + panel `/admin` para
   otorgar/revocar roles (auditado).
5. **Directorio de personas**: CRUD con detección de posibles
   duplicados (nunca por nombre) que exige confirmación humana.
   6–7. **Cursos, clases, matrícula, asistencia**: categorías
   configurables, clases/cohortes, sesiones, matrícula, toma de
   asistencia, % de progreso.
6. **Importación**: CSV → staging → revisión humana → promoción
   (aprobar nuevo / fusionar / rechazar), sin fusión automática, sin
   notificaciones automáticas. Captura manual reutiliza el mismo
   pipeline.
7. **Visitantes y seguimiento**: seguimiento con bitácora de contactos.
8. **Portal del miembro**: contacto propio (vía RPC restringida a
   columnas específicas), cursos propios con progreso, peticiones de
   oración propias, código QR de check-in.
9. **Check-in QR**: token HMAC firmado de corta vigencia (nunca el
   person_id en crudo), escaneo compatible con lectores QR/barras
   (input de texto), check-in manual.
10. **Peticiones de oración**: bandeja restringida a
    intercesor/pastor/administrador, contenido solo visible en detalle
    (auditado), listado sin contenido.
11. **Emails y encuestas**: envío vía Resend con registro en
    `notification_log`, encuestas con preguntas de texto/opción única.
12. **Reportes**: paneles agregados por rol (personas, matrícula,
    asistencia, seguimiento, oración) con `StatBarList` (barras de un
    solo color, sin librería externa).
13. **Seguridad**: auditoría de RLS (24/24 tablas), auditoría de
    guards de autorización (1:1 en cada Server Action), sanitización de
    filtros PostgREST, fix de accesibilidad en `CardTitle`.

Verificado en cada módulo durante la construcción: `npm run typecheck`,
`npm run lint`, `npm run format:check`, `npm run build` — todos
limpios. 6 pruebas Playwright pasan.

**Más tarde en la misma sesión**: el usuario proveyó credenciales de un
proyecto Supabase Cloud de desarrollo. Se aplicaron las migraciones
(encontrando y corrigiendo 2 bugs reales de SQL en el proceso — ver
`docs/decisions.md`), se sembraron datos sintéticos, y se verificó
manualmente en navegador con sesión real cada módulo, con múltiples
roles, incluidas pruebas negativas de seguridad (RLS bloqueando acceso
no autorizado). Ver la sección "Verificación end-to-end realizada"
arriba para el detalle completo.

**Commits**: 18 commits atómicos, uno por módulo/hito, con mensajes
descriptivos (ver `git log`).
