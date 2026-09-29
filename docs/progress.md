# Progreso del proyecto

Última actualización: 2026-09-28.

## Estado general: MVP verificado de punta a punta ✅

### 2026-09-05 — Auditoría de identidad/autorización/auditoría (Fase 1 completa, código; verificación en vivo pendiente)

Encargo del usuario: auditar identidad, autorización y auditoría en
`Iglesia-App` "contrastando todo con el código y las migraciones — no
asumas que algo funciona porque está documentado como terminado". Se
siguió el loop pedido (investigar → definir qué debe permitirse/bloquearse
→ prueba que reproduce el fallo → corrección mínima completa → revisar
efectos secundarios → documentar) para las 3 tareas de la Fase 1.

**Problema → cambio → pruebas → resultado → pendientes**, por tarea:

**1.A Identidad (`profiles.person_id`)**

- _Problema_: (1) `handle_new_auth_user()` confiaba en
  `raw_user_meta_data.person_id`, escribible por cualquiera con la anon
  key vía el endpoint público de signup — suplantación de identidad sin
  intervención humana. (2) `profiles_update_own` no restringía columnas:
  cualquier usuario podía reasignar su propia cuenta a otra persona sin
  cuenta todavía vía PATCH directo. (3) No existía ninguna invitación
  verificable, pese a que `0004_profiles.sql` la daba por sentada desde
  agosto.
- _Cambio_: `0027_identity_protection.sql` — trigger usa
  `raw_app_meta_data` (solo Admin API); trigger + `admin_relink_profile()`
  bloquean cambios de `person_id` fuera de un RPC auditado; tabla
  `portal_invitations` + `create_portal_invitation()` /
  `revoke_portal_invitation()`. UI: `InvitePortalCard` en la ficha de
  persona, ruta pública `/activar-portal` (`activar-portal/actions.ts`
  usa `service_role` — único punto donde se crea una cuenta sin sesión
  previa, justificado igual que otros usos en `admin.ts`).
- _Pruebas_: `scripts/verify-security-phase1.ts` (`npm run
verify:phase1`) cubre suplantación, auto-reasignación bloqueada, y el
  camino legítimo de invitación de punta a punta.
- _Resultado_: `typecheck`/`lint`/`format:check` limpios. **No se pudo
  correr contra Postgres real en este entorno** — ver "Pendientes"
  abajo.
- _Pendientes_: aplicar `0027` (`supabase db push`) y correr
  `npm run verify:phase1` contra el proyecto de desarrollo.

**1.B Ámbito del rol pastor**

- _Problema_: la decisión del 2026-09-02 (pastor acotado a sus clases y
  sus ministerios) se aplicó en `is_admin()` (0023) y en los guards de
  servidor de `ministerios/actions.ts`, pero **nunca en la RLS** de
  `course_categories`, `courses`, `class_offerings`, `class_sessions`,
  `enrollments`, `attendance_records`, `ministries` y
  `ministry_memberships` — 8 políticas seguían dándole a cualquier
  pastor acceso de escritura global. La propia matriz en
  `docs/roles-and-permissions.md` tenía un error: decía `CLA` para
  pastor en "Membresía de ministerio" cuando la decisión real era "solo
  los que lidera".
- _Cambio_: `0028_pastor_scope.sql` acota pastor al mismo patrón que
  `maestro` (`teacher_person_id`) en cursos y al mismo que cualquier
  líder no-staff (`is_ministry_leader`/`leader_person_id`) en
  ministerios. `cursos/actions.ts` y `ministerios/actions.ts` ajustados
  para que el guard de servidor y la RLS coincidan (antes el guard de
  ministerios ya estaba bien y la RLS no; ahora ambos están alineados).
  Se le quita a pastor la creación de ministerios nuevos (el flujo
  documentado es admin/coordinador crea → designa pastor como líder).
  Matriz de `docs/roles-and-permissions.md` corregida.
- _Pruebas_: `verify-security-phase1.ts` cubre edición de ministerio
  propio vs. ajeno, y de clase propia vs. ajena.
- _Resultado_: mismo estado que 1.A (código verde, DB real pendiente).
- _Pendientes_: mismos que 1.A.

**1.C Escalada de acceso a oración vía membresía**

- _Problema_: `0021`/`0022` protegían bien la columna
  `grants_prayer_access`, pero `is_prayer_reader()` también concede
  lectura a cualquier `lider`/`colider` activo del ministerio marcado —
  y nada protegía ESA membresía. Un `coordinador_ministerio` (rol
  global) o el propio líder de intercesión podían auto-concederse o
  conceder a un tercero ese acceso confidencial con una edición
  ordinaria de `ministry_memberships`, sin pasar por
  `set_prayer_ministry()` ni dejar auditoría dedicada.
- _Cambio_: `0029_prayer_membership_guard.sql` — trigger que exige
  `administrador` para crear/ascender/reactivar una membresía
  `lider`/`colider` en un ministerio marcado; la revocación (bajar a
  `miembro`) sigue abierta a cualquiera con permiso normal. También se
  protegió reactivar `is_active` en el ministerio marcado, por el mismo
  motivo (era otra vía indirecta de restaurar el acceso). Mensajes de
  error en español en `ministerios/actions.ts` para el código `42501`.
- _Pruebas_: `verify-security-phase1.ts` prueba el otorgamiento
  bloqueado (self y a terceros), el otorgamiento legítimo por admin
  (incluida verificación cruzada con `is_prayer_reader()`), y la
  revocación efectiva.
- _Resultado_: mismo estado (código verde, DB real pendiente).
- _Pendientes_: mismos que 1.A.

**Fase 3 (parcial) — revisión de `0026_deletable_users.sql`**: revisada,
sin cambios — el diseño (FKs `NO ACTION`→`SET NULL` hacia `auth.users`,
preservando las dos `CASCADE` intencionales de `profiles`/`user_roles`)
es correcto y conserva la atribución histórica de auditoría al dar de
baja una cuenta. Sigue sin aplicarse contra la base real (mismo bloqueo
de red).

**Bloqueo de entorno (nuevo, distinto al de agosto)**: ni el puente al
equipo del usuario (`device_bash`, VM Linux del propio Mac) ni el
contenedor en la nube de este agente tuvieron salida de red hacia
`*.supabase.co` en esta sesión — confirmado con `curl` (falla de DNS en
un lado, rechazo de política de egreso 403 en el otro). Tampoco fue
posible correr `npm run build` en el puente al equipo del usuario: esa
VM es Linux/arm64 (el Mac del usuario es Darwin/arm64), le falta el
binario nativo de SWC para Linux y no tiene salida a `registry.npmjs.org`
para bajarlo. `typecheck`/`lint`/`format:check` sí corrieron ahí
limpios. **Ninguno de los cambios de este día se aplicó ni se probó
contra la base de desarrollo real** — queda como el paso más importante
antes de considerar la Fase 1 cerrada. Fases 2, 4 y 5 quedan sin
empezar; Fase 3 solo con la revisión de `0026` (sin migración nueva
propia, porque no hizo falta cambiarla).

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

### 2026-09-29 — Sitio web público editable desde la app (implementado; no desplegado)

- Página pública en `/sitio` con el diseño de referencia (oscuro/crema,
  Manrope, máquina de escribir, menú a pantalla completa), servida en
  `ciudaddeavivamiento.org` por el `proxy`. Editor en la app → **Sitio
  web**: fotos, álbumes, eventos y anuncios, videos, ministerios, equipo
  pastoral, textos y contacto. Rol nuevo `sitio_web`. Ver `docs/site.md`.
- Pruebas: `test:db` 49/49 (6 del sitio), unitarias 9/9, E2E 34/34, check
  y build limpios. Revisión visual con fotos de la landing (página temporal,
  eliminada) en 375 px: portada, cita, próximos, anuncios, menú.
- Sin verificar: subida real de fotos a Supabase Storage (el bucket se crea
  con 0039), el dominio raíz en Vercel, captura de escritorio completa.

### 2026-09-28 — SuperAdmin (rol `apostol`) con todos los permisos (implementado; pendiente de aplicar 0036)

- Migración `0036_apostol_all_permissions.sql`: `has_role`/`has_any_role`
  aceptan `apostol` → todos los permisos en RLS y funciones. Código, menú
  y textos: se muestra como **SuperAdmin**; Finanzas → Acceso permite dar
  SuperAdmin además de Finanzas.
- Pruebas: `npm run test:db` 43/43 (nueva: SuperAdmin pasa todos los
  chequeos; administrador sigue sin finanzas; finanzas sin oración ni
  administración).

### 2026-09-28 — Donaciones y Finanzas (implementado y probado localmente; **no desplegado**)

- **Implementado**: roles `apostol`/`finanzas` con asignación exclusiva por
  Apóstol (trigger + RPC + alta inicial por SQL); registro de donaciones
  (4 tipos, 6 formas de pago, anónimas, centavos exactos, idempotencia);
  corrección/anulación con motivo, versión e historial inmutable; petición
  de oración del sobre separada y auditada, con envío opcional a
  intercesión solo con autorización registrada; listado con filtros,
  paginación y totales de todo el filtro; historial por donante;
  exportación CSV protegida y auditada; cartas con vista previa,
  emisión con instantánea y PDF exacto, versiones y marca de revisión;
  configuración de datos y plantilla provisional (BORRADOR); pantalla de
  acceso para el Apóstol. Ver `docs/finance.md`.
- **Probado localmente**: `npm run test:db` 42/42 (22 de finanzas, PGlite
  con las migraciones reales y RLS); `npm run test:unit` (dinero y fechas);
  E2E 26/26 (10 nuevas de protección de rutas y descargas directas);
  `npm run check` y `npm run build` limpios. PDF sintético de 3 páginas
  revisado visualmente (saltos de página, encabezado repetido, total,
  pie con versión). Pantallas revisadas con datos sintéticos en 375 px y
  1280 px (página temporal, eliminada).
- **Sin verificar**: flujo completo contra Supabase real (no se aplicaron
  migraciones remotas); descarga de PDF/CSV con sesión real de cada rol
  (cubierto a nivel de base y de guard, no de punta a punta); impresión
  física del PDF.
- **Pendiente**: aplicar 0034–0035, alta inicial del Apóstol, ejemplo de
  carta y datos institucionales (ver `docs/finance.md` §6–7).

### 2026-09-28 — Cultos recurrentes y check-in por ujieres (implementado; **no activado** en producción)

- **Programación**: domingo 9:30 a. m., miércoles 7:30 p. m. y viernes
  7:30 p. m. (PR) como series versionadas; fechas generadas con 4
  semanas de anticipación por `generate_service_occurrences()`
  (idempotente, advisory lock, índice único). pg_cron diario (0033) +
  respaldo al abrir Asistencia. Cancelar, reactivar, mover una fecha,
  cambiar una serie "a partir de" (con la fecha y el efecto visibles
  antes de aplicar), terminar serie, cultos especiales y horizonte
  configurable, en `/check-in/programacion`.
- **Ventana**: abre 1 h antes; sin cierre automático por defecto
  (configurable por serie); abrir/cerrar manual con `control_checkin`.
- **Ujieres**: accesos `ujier` ("Servidor / Ujier"), `gestion_cultos`,
  `control_checkin`, `correccion_asistencia` en la pestaña "Cuenta y
  permisos" (mismo guardado auditado). Consola `/check-in`
  ("Asistencia"): búsqueda en el servidor con datos mínimos y pista para
  homónimos, QR con cámara (BarcodeDetector o jsQR) o lector externo,
  "Ya registrado", reintento sin duplicar, lista compartida que se
  refresca sola, correcciones con motivo.
- **Auto check-in retirado**: el miembro ya no puede confirmarse solo
  (política eliminada en la base, no solo el botón); muestra su QR, que
  se renueva solo.
- **Reportes**: asistencia por rango de fechas y tipo de culto
  (asistencias, cultos, personas distintas); sin anuladas, futuras ni
  canceladas.
- **Pruebas**: `npm run test:db` 20/20 (PGlite, migraciones reales,
  RLS); `npm run test:unit` 4/4 en UTC, Tokio, Los Ángeles y Kiritimati;
  E2E 16/16 (4 nuevas de protección de rutas); `npm run check` y
  `npm run build` limpios. Revisión visual con datos sintéticos (página
  temporal, ya eliminada) en 375 px y 1280 px: búsqueda, confirmación,
  corte de red + reintento, estado cerrado con corrección, formularios
  de programación.
- **Sin verificar**: flujo completo contra Supabase real (demo y
  producción no tienen 0031–0033; no se ejecutan migraciones remotas en
  esta tarea), cámara real en iPhone/Android, pg_cron ejecutándose,
  dos conexiones realmente concurrentes.
- **Pendiente de activar**: ver `docs/services-schedule.md` §6
  (migraciones + despliegue juntos, verificar `cron.job`, asignar
  accesos, retirar el QR fijo impreso).

### 2026-09-28 — Rediseño visual (Geist, navegación, panel, listas, portal)

- Corregida la fuente: `--font-sans` era circular y toda la app caía en
  serif. Ahora Geist en todo. Detalle en `docs/design.md` §7–§11.
- Menú con iconos, grupos, desplazamiento propio y `aria-current`;
  menú fijo desde `lg`. Panel con métricas compactas y accesos rápidos
  según permisos. Personas con buscador etiquetado, estados semánticos,
  vista móvil apilada y **paginación** (antes mostraba solo las
  primeras 25 sin forma de avanzar). Portal reorganizado. Formularios
  de creación en tarjeta. Estados crudos traducidos en el detalle de
  clase.
- Verificado con capturas Playwright a 375/768/1440 contra el proyecto
  demo (datos sintéticos, `npm run seed`), sesión por enlace mágico de
  un solo uso generado con la service role (sin contraseñas). Sin
  desbordamiento horizontal en ninguna pantalla. Permisos de menú y
  accesos rápidos comprobados con los 7 roles de prueba. Tema oscuro
  revisado forzando `.dark`. `npm run check`, `build` y E2E (12/12)
  pasan.
- **Pendiente de verificar visualmente**: `/personas/[id]` y `/admin`
  dan 500 en el proyecto demo porque le faltan las migraciones
  0026–0030 (producción sí las tiene). Aplicarlas al demo y revisar
  esas dos pantallas. El proyecto demo aún contiene las 3 cuentas
  reales de la iglesia además de los datos sintéticos.

### 2026-09-27 — Proyecto de producción de Ciudad de Avivamiento

- Modelo: un proyecto Supabase por iglesia; `jlmabwnbtwjrtqaxfafx`
  (iglesia-app-dev) queda como **demo** con datos sintéticos.
- Producción: `ciudad-de-avivamiento` (`ccempuwuefjnaarmxbkz`,
  us-west-1). 30/30 migraciones aplicadas; 29/29 tablas con RLS y
  políticas. 3 cuentas iniciales creadas con `bootstrap-church.ts`
  (sin contraseña: entran con "¿Olvidaste tu contraseña?" cuando haya
  SMTP).
- **Publicado 2026-09-28** en https://app.ciudaddeavivamiento.org
  (Vercel `iglesia-app`, variables de Production → proyecto nuevo;
  Preview sigue en el proyecto demo). DNS en GoDaddy: `A app →
76.76.21.21` y registros de Resend (dominio verificado).
- Pendiente: plantillas de correo en español en Supabase (están en
  `docs/email-templates/`, aún en inglés en el panel); confirmar que el
  SMTP de Resend está guardado en Supabase; subir Vercel y Supabase a
  Pro; página de la iglesia en `ciudaddeavivamiento.org`; volver a
  sembrar el proyecto demo con datos sintéticos.

### 2026-09-27 — Revisión de escalabilidad (1000+ personas)

- Hallazgo: PostgREST devuelve máximo 1000 filas sin error. Reportes
  (personas por estado, seguimiento, oración, inscripciones, asistencia,
  ministerios, actividades), listas de check-in/seguimiento/oración,
  detalle de clase (asistencia), resultados de encuestas, lote de
  importación y el selector de personas de ministerios se habrían
  truncado en silencio al pasar de 1000 filas.
- Corregido con conteos en la base y `src/lib/data/paging.ts`
  (`fetchAllPages`, `fetchInChunks`, `mapWithConcurrency`). La
  importación ahora busca duplicados con 10 consultas en paralelo e
  inserta en tandas de 500.
- Prueba de carga (`scripts/load-test.ts`) en desarrollo con 1500
  personas sintéticas: 1200 check-ins con 50 simultáneos sin errores
  (~52/s, p95 1.7 s); consulta sin paginar devolvía 1000 de 1200 y
  `.in()` con 1200 IDs fallaba (Bad Request); con los helpers: 12/12 OK.
- Limpieza hecha (2026-09-27): la base de desarrollo quedó solo con las
  3 cuentas reales (Roberto, Dimarilys, Ester) y sus fichas; sin
  actividad ni cuentas `@iglesia.test`. Se conservan las 6 categorías de
  cursos. Las listas de seguimiento/oración/actividades no paginan en
  la UI; con miles de filas convendrá paginarlas como el directorio.

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
