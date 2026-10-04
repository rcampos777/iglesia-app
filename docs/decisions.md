# Registro de decisiones (ADR ligero)

Formato: fecha, decisión, contexto/alternativas, consecuencias.

## 2026-10-03 — Aviso de privacidad obligatorio y borrado del propio perfil

**Contexto**: el dueño del producto: "trabajar el anuncio de que colectamos
data personal antes del signup y luego de logearse, y permitir que las
personas borren su perfil, para poder cumplir con la ley" (auditoría H-02 y
H-10).

**Decisión** (`0049`, respuestas del dueño):

- Al entrar, **pantalla para aceptar** (no un banner): hay que pulsar
  "Entendido" y queda la versión y la fecha. Cambiar el texto obliga a
  cambiar `PRIVACY_VERSION` y todos vuelven a aceptarlo.
- Borrar con historial: **anonimizar** (alternativas descartadas: solo
  crear una solicitud manual; borrar todo, que pierde estadísticas). Si
  hay donaciones o certificaciones, se borra la cuenta pero el registro se
  conserva intacto para que un SuperAdmin lo revise (obligaciones contables
  y Ley 300).
- Cuentas con SuperAdmin o Finanzas no se borran a sí mismas.

**Consecuencias**: el texto del aviso solo describe lo verificado; plazos
de conservación, entidad legal de Nexo y revisión legal siguen pendientes.
Detalle en `docs/privacy.md`.

## 2026-10-01 — Borrar personas creadas por error (solo SuperAdmin)

**Contexto**: el dueño del producto quiere "borrar cuentas que no tengan
nada atachado o fueron creadas por error, para no tener basura".

**Decisión** (`0046`): un SuperAdmin puede borrar a una persona **solo si
no tiene nada ligado**; se borra también su cuenta de acceso. Con
cualquier registro (incluidas donaciones) no se puede: la ficha dice qué
tiene. Motivo obligatorio y bitácora. Así se conserva el historial real
(regla §3.1: una persona = un registro) y las cartas de donativos.

## 2026-10-01 — Pastor y maestro: solo lo que les toca

**Contexto**: el dueño del producto: "que el pastor de ministerio solo vea
lo que le toca pastorear y los maestros solo sus clases, pero que tengan
acceso al historial de la persona". Respuestas: el pastor de ministerio
trabaja su gente (crea y edita); el maestro sigue viendo a todos los
alumnos que han pasado por él; registrar cultos es solo de Ujier y
SuperAdmin; donaciones solo SuperAdmin y Finanzas (ya era así).

**Decisión** (`0045`): concepto "a su cargo" (`is_in_my_care`). Pastor y
maestro salen del directorio completo; ven y (el pastor) trabajan solo a
su gente, con historial completo de lectura sin seguimiento, oración ni
donaciones. El pastor pierde Visitantes e Importación (tareas de
directorio). Los roles se suman: quien además es coordinador, seguimiento
o SuperAdmin conserva el directorio. Detalle en
`docs/roles-and-permissions.md` y `docs/security.md` §8.k.

**Alternativas descartadas**: dar al maestro solo lectura de las clases
que imparte (perdería el historial que pidieron); mantener al pastor en
Visitantes (vería a todos los visitantes de la iglesia).

## 2026-10-01 — Registrar asistencia a cultos: solo Ujier y SuperAdmin

**Contexto**: el dueño del producto: "el registro de cultos es para
SuperAdmin y Ujieres".

**Decisión**: `can_record_attendance()` = `ujier` (+ `apostol`, implícito)
(`0044`). Se retira a `administrador`, `seguimiento`,
`coordinador_ministerio` y `pastor`, que lo tenían desde 0007/0032. No
cambian gestionar cultos, abrir/cerrar el registro ni corregir
asistencias. Quien necesite registrar recibe el acceso "Servidor / Ujier"
en Cuenta y permisos.

## 2026-10-01 — Certificaciones de ministros (antecedentes penales, Ley 300)

**Contexto**: el dueño del producto pidió guardar las certificaciones que
la iglesia debe tener de quienes sirven (p. ej. la certificación del
Registro de Ofensores Sexuales para trabajar con jóvenes) y que solo las
vean los apóstoles y Finanzas.

**Decisión**: módulo `/certificaciones` (`0042` + bucket `0043`). Detalle
en `docs/finance.md` §8.

- Acceso **igual que Finanzas**: solo `apostol` (SuperAdmin) y `finanzas`
  (`has_finance_access()`). `administrador` **no**, ni pastores ni la
  propia persona (por ahora no ve las suyas en Mi portal).
- Registran y editan ambos; **solo el apóstol borra**.
- Documento en bucket **privado**; se abre con URL firmada de 60 s después
  de registrar la apertura. Crear, cambiar, borrar y abrir quedan en
  `finance_audit_log` (solo apóstol).
- Estado calculado por vencimiento: vencida / vence pronto (≤ 30 días) /
  vigente / sin fecha.
- Tipos editables (se pueden desactivar, no borrar). Iniciales:
  antecedentes penales, Registro de Ofensores Sexuales (Ley 300) y
  credencial ministerial.

**Pendiente/futuro**: avisos por email antes del vencimiento; marcar qué
ministerios exigen qué certificación.

## 2026-09-29 — Inscripción en línea a actividades (retiro de hombres)

**Contexto**: el dueño del producto pidió una forma pública para el Retiro
de Hombres 2026 (como la de Microsoft Forms que usaban) y automatizar lo
que pasa después: confirmación, aviso a organizadores, recordatorios de
pago y del evento, y que el inscrito quede en Personas. Pagos por ATH
Móvil o en persona (elección del dueño; sin cobro en línea).

**Decisión**: se extiende `activities` (0024) en vez de un módulo nuevo:
una actividad puede abrir inscripción pública (`0040`). Detalle en
`docs/registrations.md`.

- Lo enviado se guarda tal cual en `activity_registrations`. Sin
  coincidencias → se crea la persona (visitante) y se inscribe; con
  coincidencias (email, teléfono o nombre) → "posible_duplicado" y decide
  un organizador (§3.1, §3.5).
- Solo mayores de 18 en la forma pública (§3.13).
- Se piden nombre y apellidos por separado (la forma original tenía un
  solo campo): así la persona se crea bien en `people`.
- Los pagos de la actividad los registra quien la organiza, **no** el rol
  `finanzas`: son cuotas de logística del evento, no donaciones. No
  aparecen en Finanzas ni en cartas de donativos.
- Emails sin datos médicos. Recordatorios por Vercel Cron diario (no
  pg_cron: hay que llamar a Resend) con `CRON_SECRET`; idempotentes vía
  `notification_log`.
- Anti-spam sin servicios externos: campo trampa + tiempo mínimo de
  llenado medido en el navegador (no comparar relojes: un teléfono con la
  hora mal descartaba inscripciones reales — encontrado al probar).

**Alternativas descartadas**: Stripe (requiere cuenta/credenciales y no
lo pidieron); vincular automáticamente por email exacto (viola §3.5).

## 2026-09-29 — Sitio público dentro de la app, editable desde "Sitio web"

**Contexto**: el dueño del producto quiere agregar fotos, álbumes, eventos,
anuncios, videos, ministerios y equipo pastoral sin tocar código, con un
diseño de referencia (oscuro/crema, Manrope) que pidió aplicar con los datos
de la iglesia.

**Decisiones**:

1. **El sitio vive en esta app** (`/sitio`), servido en el dominio raíz por
   reescritura en `proxy.ts`, en vez de la landing estática separada de
   `landing/`. Así lee el mismo contenido y los mismos horarios de
   Asistencia. Alternativa descartada: landing estática leyendo Supabase en
   el navegador (peor SEO y sin reutilizar código).
2. **Web, no React Native**: el diseño de referencia pedía Expo y una
   vitrina de 3 iPhones; se implementó como página web adaptable que en el
   celular reproduce esas pantallas. No se usaron las imágenes del diseño
   (de otra iglesia/plantilla).
3. **Fotos en Supabase Storage (bucket público `sitio`)**, reducidas en el
   navegador (sin dependencias nuevas ni servicio de imágenes de pago).
4. **Rol `sitio_web`** para editores sin acceso a datos internos.
5. **Horarios desde la programación** (`public_service_schedule()`), sin
   duplicarlos.

## 2026-09-28 — SuperAdmin (rol `apostol`) con todos los permisos

**Contexto**: el dueño del producto aclaró que el rol pensado como
"Apóstol" es para los pastores generales de la congregación y debe tener
**todos los permisos**, y pidió mostrarlo como **SuperAdmin**. Esto
reemplaza la regla de 0035 ("apóstol solo abre Finanzas") y amplía la
regla 11 de CLAUDE.md (peticiones de oración).

**Decisión**: `has_role()` y `has_any_role()` devuelven verdadero para un
usuario con `apostol` (0036), así que SuperAdmin pasa todos los chequeos
de RLS y de servidor (administración, personas, cursos, ministerios,
asistencia, oración y finanzas); `hasRole/hasAnyRole` y el menú lo
espejan. El identificador interno sigue siendo `apostol` (ya existe en
producción; renombrar un valor de enum obligaría a recrear todas las
funciones que lo usan). Se mantiene: `administrador` sin acceso
financiero; solo un SuperAdmin concede SuperAdmin/Finanzas; último
SuperAdmin protegido; alta inicial explícita.

## 2026-09-28 — Módulo de Donaciones y Finanzas

**Decisiones**:

1. **Roles `apostol` y `finanzas` en `app_role`** (no un sistema paralelo).
   `administrador` no obtiene acceso financiero. `admin_set_person_roles`
   ignora/rechaza los roles financieros y un trigger en `user_roles` los
   protege de cualquier otra vía; solo `apostol_set_financial_role()` (un
   Apóstol) y `bootstrap_first_apostol()` (SQL Editor, una vez) los escriben.
   El Apóstol puede conceder también Apóstol (sucesión) con protección del
   último titular.
2. **Centavos `bigint`** y sumas en la base; formato y lectura en el cliente
   con aritmética entera.
3. **Idempotencia por clave del formulario**, no por "misma persona, fecha y
   monto" (bloquearía aportaciones legítimas).
4. **Versionado optimista** (`version`) para correcciones simultáneas.
5. **Petición del sobre en tabla separada sin políticas de lectura**;
   acceso definido: Apóstol y Finanzas, solo por función auditada desde el
   detalle. Compartir con intercesión crea una `prayer_requests` con
   `submitted_by_user_id = null`.
6. **Auditoría financiera separada** (`finance_audit_log`, solo Apóstol)
   porque `audit_log` lo lee el administrador.
7. **PDF con `pdf-lib`** (MIT, JS puro, sin servicios externos) generado en
   el servidor; se guarda el PDF exacto en la base para reproducir versiones
   emitidas. Alternativas descartadas: generar en el navegador (el total
   debe venir del servidor), Supabase Storage (otra superficie de acceso a
   proteger, sin necesidad para este volumen).
8. **Plantilla provisional** marcada BORRADOR hasta aprobación de un Apóstol;
   no afirma deducibilidad.

## 2026-09-28 — Cultos recurrentes y check-in controlado por ujieres (reemplaza el auto check-in)

**Contexto**: encargo del dueño del producto: que los cultos (domingo
9:30 a. m., miércoles y viernes 7:30 p. m., hora de PR) aparezcan solos
y que la asistencia la confirme personal autorizado ("Servidor /
Ujier") buscando por nombre o escaneando el QR personal. Explícitamente
**sin** GPS, sin registro por proximidad y sin un QR público que
confirme asistencia por sí solo.

**Decisiones**:

1. **Se retira el auto check-in** (decisión del 2026-08-17): se elimina
   la política `service_checkins_insert_self`, la acción
   `selfCheckinAction`, el botón "Confirmar mi asistencia" y el QR fijo
   de la entrada. `/check-in/publico` queda como página que solo muestra
   el QR personal (compatibilidad con QR ya impresos).
2. **Accesos como valores de `app_role`** (`ujier`, `gestion_cultos`,
   `control_checkin`, `correccion_asistencia`), no una tabla de
   permisos nueva: se reutilizan `user_roles`, la pestaña "Cuenta y
   permisos" y `admin_set_person_roles()` (auditada, detecta ediciones
   desactualizadas). Las capacidades se exponen como funciones SQL
   (`can_record_attendance()`, …) que usan las funciones de escritura.
3. **Reutilizar `services` y `service_checkins`**: cada fecha = una
   fila de `services`; la recurrencia vive en `service_series_rules`,
   versionada por fecha de vigencia. Alternativa descartada: calcular
   las ocurrencias "al vuelo" sin filas — la asistencia necesita una
   fila estable por fecha, y las cancelaciones/excepciones también.
4. **pg_cron** para la generación diaria (incluido en Supabase, corre
   dentro de la base, sin endpoint HTTP que proteger). Alternativa
   descartada: Vercel Cron → requeriría un Route Handler con secreto
   compartido y, en plan Hobby, solo corre una vez al día igual. Como
   respaldo, la página de Asistencia llama a `ensure_service_occurrences()`.
5. **Sin cierre automático por defecto**: la duración de los cultos no
   está definida; no se inventa una. Cierre manual (`control_checkin`)
   hasta que el administrador configure minutos de cierre en la serie.
6. **Operadores preservados**: `seguimiento`, `coordinador_ministerio`
   y `pastor` conservan _registrar_ asistencia (ya podían desde 0007),
   pero ya no crean/abren/cierran/borran cultos ni borran registros.
7. **Correcciones sin borrar**: anulación con motivo (`voided_*`) y
   altas fuera de ventana (`is_correction`), ambas en `audit_log`. El
   índice único pasa a ser parcial (`where voided_at is null`).
8. **Dependencias nuevas** (justificadas):
   - `jsqr` (runtime, Apache-2.0, sin dependencias, se carga solo al
     activar la cámara): Safari/iPhone no tiene `BarcodeDetector`, y
     muchos ujieres usan iPhone.
   - `@electric-sql/pglite` (solo desarrollo): Postgres en memoria para
     probar migraciones, RLS y concurrencia lógica sin Docker (no
     disponible en este entorno) y sin tocar proyectos remotos
     (`npm run test:db`).

**Consecuencias**: 0032 elimina `services.is_checkin_open`; la app y la
migración deben desplegarse juntas (ver `docs/services-schedule.md` §6).
El QR fijo impreso, si existe, deja de registrar asistencia.

## 2026-09-06 — Gestión de permisos: de botones inmediatos a guardado transaccional en el perfil

**Contexto**: encargo explícito del usuario de mover la gestión de
acceso de la "pared de botones" de `/admin` (cada clic = escritura
inmediata de una fila en `user_roles`, sin resumen ni transacción) a
una pestaña "Cuenta y permisos" dentro del perfil de cada persona, con
cambios preparados y aplicados mediante un botón "Guardar cambios"
explícito.

**Decisiones de diseño**:

1. **Guardado transaccional con detección de ediciones
   desactualizadas, sin columna de versión**: en vez de agregar una
   columna `version`/`updated_at` a `user_roles`, el cliente manda el
   conjunto de roles que tenía cargado (`p_expected_roles`) además del
   conjunto final deseado (`p_new_roles`). `admin_set_person_roles()`
   compara `p_expected_roles` contra el estado real dentro de la misma
   transacción y rechaza con `STALE_ROLES:` si no coincide, en vez de
   sobrescribir en silencio el cambio de otro administrador.
2. **Último administrador: la garantía vive en un trigger, no en la
   RPC**: un chequeo de conteo dentro de la propia función de guardado
   no es seguro ante dos transacciones concurrentes que remueven el rol
   `administrador` a DOS cuentas distintas (cada una podría ver a la
   otra como "el admin que queda" antes de que ninguna confirme). La
   garantía real es un trigger `BEFORE DELETE` sobre `user_roles` con
   `pg_advisory_xact_lock` de alcance de **transacción completa** (no se
   libera hasta commit/rollback), que serializa cualquier intento de
   borrar el último `administrador` sin importar la vía de escritura.
   El chequeo dentro de la RPC queda solo como atajo de mensaje más
   claro para el caso obvio, documentado explícitamente como NO la
   garantía de concurrencia.
3. **Cierre de la escritura directa a `user_roles`**: se retira la
   política RLS `user_roles_all_admin` (permitía a cualquier
   `administrador` escribir la tabla directo por PostgREST, sin pasar
   por auditoría ni por las protecciones nuevas) y se reemplaza por una
   política de solo lectura. La única forma de escribir `user_roles`
   pasa a ser una función `security definer` (`admin_set_person_roles`
   o `grant_default_role` de `0004`). Esto es lo que impide que
   reintroducir un botón viejo, o llamar a la API REST directo con la
   anon key de un administrador, evite las protecciones nuevas.
4. **No se tocó el modelo de cargos eclesiales**: el pedido distinguía
   "cargo"/función pastoral, responsabilidad en un ministerio/clase, y
   permisos de la aplicación. El proyecto no tiene (todavía) un modelo
   de cargos eclesiales — solo roles de aplicación (`app_role`) y
   asignaciones ya existentes (`ministries.leader_person_id`,
   `class_offerings.teacher_person_id`). No se inventó una jerarquía de
   cargos para resolver este cambio: la pestaña "Cuenta y permisos"
   muestra "Responsabilidades" (ministerios/clases, reutilizando datos
   ya existentes) separado de "Permisos de la aplicación" (los 7
   `app_role`), y la ausencia de un modelo de cargos queda documentada
   como pendiente en `docs/assumptions.md`.
5. **Cuentas sin perfil no se vinculan automáticamente**: la lista de
   Administración muestra `person_id = null` tal cual (con un
   indicador visual), sin ninguna acción que las asocie a una persona
   por inferencia — evita vincular por error una cuenta a la persona
   equivocada.

**Verificación**: `typecheck`, `lint` y `format:check` limpios contra
todo el árbol. `build` y las pruebas contra Postgres real
(`npm run verify:permissions`, nuevo script de regresión en
`scripts/verify-permissions-management.ts`) **no se pudieron ejecutar
en este entorno** — mismo límite de red hacia `*.supabase.co` ya
documentado en la entrada del 2026-09-05 (sin cambios: seguía sin
salida de red en esta sesión). Migración y código quedan listos; falta
aplicar `0030_permissions_management.sql` (`supabase db push`, después
de `0029`) y correr `npm run verify:permissions` desde un entorno con
salida de red normal antes de considerar esta funcionalidad probada en
el sentido estricto pedido ("no declares probado algo que solo
revisaste por código"). Tampoco se pudo verificar visualmente la UI
(la pestaña nueva, el flujo de guardado, responsive/teclado) por la
misma razón: el servidor de desarrollo necesita una base de datos viva.

**Consecuencias**: `admin/actions.ts` y `admin/role-toggles.tsx` se
eliminan (superados). `Mi portal` no cambia — sigue sin ninguna vía
para que un miembro edite sus propios roles o su `person_id`, y las
protecciones de `0027` (que bloquean cambiar `profiles.person_id` fuera
de `admin_relink_profile`) siguen intactas sin haber sido tocadas por
este cambio.

## 2026-09-05 — Auditoría de identidad/autorización/auditoría: 3 fallos reales cerrados

**Contexto**: encargo explícito del usuario de auditar identidad,
autorización y auditoría antes de seguir con la experiencia diaria de
administración. Se comparó cada control documentado contra el código y
las migraciones reales (no solo la documentación) — la consigna
explícita fue "no asumas que algo funciona porque está documentado como
terminado".

**Hallazgos y decisiones**:

1. `handle_new_auth_user()` confiaba en `raw_user_meta_data.person_id`
   (escribible por cualquiera con la anon key, sin pasar por la app):
   permitía suplantar la identidad de cualquier persona del directorio
   sin cuenta todavía. Se cambia a `raw_app_meta_data` (solo Admin
   API/service_role). Ver `0027_identity_protection.sql`.
2. `profiles_update_own` no restringía columnas: un usuario podía
   reasignar su propia cuenta a cualquier persona sin cuenta vía PATCH
   directo. Se agrega un trigger que bloquea el cambio de `person_id`
   salvo por un RPC de administrador auditado (`admin_relink_profile`).
3. Se construyó la invitación verificable de portal
   (`portal_invitations` + `create_portal_invitation`/
   `revoke_portal_invitation`) que `0004_profiles.sql` prometía desde
   agosto pero nunca se implementó — sin ella, no había forma legítima
   de vincular una cuenta nueva a una persona existente.
4. La decisión del 2026-09-02 (pastor acotado) nunca se aplicó en la
   RLS de cursos/clases/matrícula/asistencia/ministerios — solo en
   `is_admin()` y en los guards de servidor de ministerios. Ocho
   políticas seguían dándole acceso global. Ver
   `0028_pastor_scope.sql` y la corrección de la matriz en
   `docs/roles-and-permissions.md` (la fila "Membresía de ministerio"
   decía `CLA` para pastor por error de documentación, no por decisión
   real).
5. La protección de `grants_prayer_access` (0021/0022) no cubría la vía
   de **membresía**: un coordinador o el propio líder de intercesión
   podían auto-concederse/conceder a un tercero `lider`/`colider` de ese
   ministerio por una edición ordinaria, saltándose por completo el
   control cuidadosamente construido para la columna. Ver
   `0029_prayer_membership_guard.sql`.

**Verificación**: `typecheck`, `lint` y `format:check` limpios. `build`
y las pruebas contra Postgres real (`npm run verify:phase1`, nuevo
script de regresión en `scripts/verify-security-phase1.ts`) **no se
pudieron ejecutar en este entorno**: ni el puente al equipo del usuario
ni el contenedor en la nube de este agente tuvieron salida de red hacia
`*.supabase.co` en esta sesión (bloqueado por política de red, no por
error de configuración). Migraciones y código quedan listos; falta
aplicar `0027`/`0028`/`0029` (`supabase db push`) y correr
`npm run verify:phase1` desde un entorno con salida de red normal (la
terminal del propio usuario, por ejemplo) antes de dar la Fase 1 por
cerrada en el sentido estricto de `CLAUDE.md`.

**Consecuencias**: ninguna funcionalidad legítima documentada se quita
— pastor sigue viendo el directorio completo, gestionando sus propias
clases y sus propios ministerios; coordinadores siguen pudiendo agregar
miembros normales a cualquier ministerio. Solo se cierra lo que nunca
debió estar abierto.

## 2026-09-02 — `pastor` deja de ser administrador; oración se ata al ministerio de intercesión

**Decisión** (dueño del producto, cambia `CLAUDE.md` §3.11 y §4):

1. `is_admin()` pasa a significar **solo `administrador`**. El rol
   `pastor` pierde: otorgar/revocar roles, eliminar personas, plantillas
   de notificación y bitácora de auditoría.
2. `pastor` queda **acotado**: en Cursos ve solo las clases que imparte;
   en Ministerios, solo los que lidera. Conserva lectura del directorio y
   reportes generales.
3. Las peticiones de oración las leen: rol `intercesor`, `administrador`,
   y el **líder del ministerio de intercesión**. El rol `pastor` por sí
   solo ya no da acceso.

**Contexto**: en esta iglesia hay muchos pastores de áreas distintas, y
varios son "pastores de título" que hoy no tienen nada a su cargo. El
rango más alto son los apóstoles. Tratar `pastor` como equivalente a
administrador daba acceso amplio a decenas de personas sin
responsabilidad operativa — justo lo contrario del menor privilegio.

**Cómo se identifica el ministerio de intercesión**: con el flag
`ministries.grants_prayer_access`, no por nombre (los nombres no son
identificadores, `CLAUDE.md` §3.3). Lo designa el administrador desde la
app; hay un índice único parcial para que solo haya uno a la vez.

**Consecuencias**: `pastor` sigue existiendo como rol y es la pieza que
el administrador usa para delegar: crea el ministerio, pone al pastor
como líder, y a partir de ahí ese pastor gestiona su propia gente sin
tocar nada más.

## 2026-09-02 — Bug real de RLS encontrado en vivo: el líder no veía a su equipo

**Decisión**: dar al líder de ministerio lectura de `people` acotada a su
propio equipo (política `people_select_ministry_leader`) y un RPC de
columnas mínimas (`list_people_for_ministry_picker()`, solo id + nombre)
para el selector de alta, en vez de (a) darle lectura del directorio
completo o (b) dejar que solo el staff pueda agregar gente.

**Contexto**: `0018` autorizaba correctamente la escritura sobre
`ministry_memberships`, pero se pasó por alto que leer la membresía no
implica poder leer las `people` referenciadas. En vivo, un líder sin rol
de staff veía su equipo como "? ?" y no podía agregar a nadie. No lo
detectaron `lint`, `typecheck`, `build` ni las pruebas E2E sin sesión —
solo apareció al iniciar sesión con ese rol exacto contra la base real.

**Consecuencias**: refuerza que las pruebas de autorización tienen que
correrse **con el rol menos privilegiado que se supone que puede hacer la
tarea**, no solo con un administrador. Un flujo puede estar "autorizado"
y aun así ser inservible porque una tabla vecina lo bloquea. Se agregó a
la bitácora de `docs/progress.md` como caso de referencia.

## 2026-09-02 — Ministerios: autorización por ámbito, no solo por rol

**Decisión**: `ministry_memberships` se autoriza con `rol global OR
líder de ESE ministerio` (`is_ministry_leader(ministry_id)`), en vez de
exigir un rol de staff amplio para tocar cualquier ministerio.

**Contexto**: el rol `coordinador_ministerio` existía desde
`0002_roles.sql` y aparecía en las políticas RLS de medio proyecto, pero
no había ninguna tabla de ministerios que coordinar: en la práctica
funcionaba como "staff amplio" sin ámbito. Al introducir ministerios,
darle a cada líder de área un rol global de staff para que administrara
su propio equipo habría violado el principio de menor privilegio
(CLAUDE.md §4): el líder de alabanza habría obtenido acceso de escritura
al directorio completo.

**Consecuencias**:

- Un líder de ministerio administra su equipo sin ningún rol de staff.
- La comprobación vive en **dos** capas independientes: la política RLS
  `ministry_memberships_write` y el guard de servidor
  `requireMinistryManager()` en `src/app/(app)/ministerios/actions.ts`.
- La membresía **no se borra** al salir: se cierra con `left_at`, para
  conservar el histórico de servicio de cada persona. El índice único es
  parcial (`where left_at is null`) para permitir reingresos sin
  duplicar membresías activas.

## 2026-08-17 — Check-in: QR fijo de entrada (auto check-in) además del QR personal

**Decisión**: agregar un segundo flujo de check-in, más simple, como
mecanismo principal: un único QR estático impreso en la entrada
(`/check-in/publico`) que cualquier persona escanea con su propio
celular para confirmar su propia asistencia. El flujo original (QR
personal por persona, escaneado por un operador) se conserva como
alternativa para casos donde la persona no puede/no debe autoservirse
(niños, visitantes sin cuenta).

**Contexto**: pedido explícito del usuario tras ver el flujo original
en producción — en la práctica, para un culto dominical normal, pedirle
a un operador que escanee el QR de cada persona es más lento y requiere
más personal que dejar que cada quien escanee un QR fijo y se confirme
a sí mismo.

**Consecuencias**: nueva política RLS (`service_checkins_insert_self`,
migración `0017`) que permite a cualquier persona insertar su propio
`service_checkin` — pero solo el suyo (`person_id = current_person_id()`)
y solo si el servicio tiene `is_checkin_open = true`. Staff gana un
control adicional (switch abrir/cerrar check-in por servicio) que antes
no se exponía en la UI aunque la columna ya existía. Se agregó soporte
de `?next=` en el login para regresar al usuario a la página que
intentaba ver antes de autenticarse (necesario para que escanear el QR
sin sesión activa no lo deje varado en el dashboard).

## 2026-08-16 — Stack base

**Decisión**: Next.js App Router + TypeScript estricto + Supabase
(Postgres + Auth + RLS) + Tailwind + shadcn/ui + Zod + React Hook Form +
Playwright + Resend, desplegado en Vercel.

**Contexto**: stack solicitado explícitamente por el dueño del producto,
ya validado para apps CRUD con auth/roles complejos y buen soporte
serverless en Vercel.

**Consecuencias**: acoplamiento a Supabase para Auth+DB+RLS (aceptado,
es un requisito explícito, no una elección abierta).

## 2026-08-16 — Categorías de curso configurables (tabla, no enum)

**Decisión**: `course_categories` es una tabla, no un `enum` de Postgres.

**Contexto**: el requisito pide "cursos y clases... y otros configurables".
Un enum requeriría una migración para agregar una categoría nueva; una
tabla permite que un administrador la agregue desde la UI.

**Consecuencias**: una validación menos estricta a nivel de tipo (se
compensa con Zod + `foreign key`).

## 2026-08-16 — Auditoría de lectura de peticiones de oración a nivel de aplicación, no de trigger

**Decisión**: el registro en `prayer_request_access_log` lo hace la
función `log_prayer_request_access()`, invocada desde
`src/lib/data/prayer-requests.ts` en cada lectura de detalle — no un
trigger de base de datos.

**Contexto**: Postgres no dispara triggers en `SELECT`. Las alternativas
(vistas con logging, extensiones de auditoría de queries) agregan
complejidad operativa desproporcionada para el MVP.

**Consecuencias**: la garantía de auditoría depende de que todo el código
de la aplicación use esa función como único camino de lectura de detalle
— documentado como invariante en `docs/security.md`. Un acceso directo
con la `service_role key` (fuera de la app) no quedaría auditado por este
mecanismo; ese acceso ya está restringido a quien administra el proyecto
Supabase.

## 2026-08-16 — QR de check-in con token firmado de corta vigencia

**Decisión**: el QR no codifica `person_id` en texto plano permanente,
sino un token HMAC firmado con expiración corta.

**Contexto**: un QR con el id en crudo, si se comparte una foto, permite
suplantar el check-in de otra persona indefinidamente.

**Consecuencias**: el QR mostrado en el portal del miembro debe
regenerarse/refrescarse; no es una imagen estática descargable de por
vida.

## 2026-08-16 — Sin Docker/Supabase CLI en el entorno de desarrollo de esta iteración

**Decisión**: se continuó con la implementación completa de código,
migraciones y documentación sin poder ejecutar `supabase start` (no hay
Docker instalado en este entorno).

**Contexto**: instrucción explícita del usuario de no detenerse por
bloqueos de infraestructura local, sino documentar y continuar.

**Consecuencias**: falta validar las migraciones y las políticas RLS
contra una base Postgres real antes de considerar el módulo de datos
"terminado" en el sentido estricto de `CLAUDE.md`. Ver
`docs/progress.md` para el plan de verificación pendiente.

**Actualización 2026-08-16 (misma fecha, más tarde)**: el usuario
proveyó credenciales de un proyecto Supabase Cloud de desarrollo. Se
desbloqueó por completo — ver la siguiente entrada.

## 2026-08-16 — Conexión directa a Postgres bloqueada en este entorno; se usa el pooler

**Decisión**: para aplicar migraciones (`supabase db push`) desde este
entorno de agente, usar el **connection string del pooler de Supabase**
(`aws-0-<region>.pooler.supabase.com:5432`, usuario
`postgres.<project-ref>`) en vez del host directo
(`db.<project-ref>.supabase.co:5432`).

**Contexto**: los proyectos nuevos de Supabase solo exponen el host
directo por IPv6. Este entorno de agente resuelve el registro AAAA
correctamente con `dig`/`host`, pero la conexión TCP real al puerto 5432
falla (`getaddrinfo ENOTFOUND` / conexión rechazada) — aparentemente el
sandbox no permite conexiones TCP salientes a hosts IPv6-only en puertos
no estándar, aunque sí permite HTTPS (443) normalmente. El pooler expone
una dirección IPv4, que sí funcionó (confirmado con `nc -zv`).

**Consecuencias**: documentado en `docs/deployment.md` §2 para que
cualquier sesión futura (de este agente o de un desarrollador en un
entorno con la misma limitación) no pierda tiempo con el mismo
diagnóstico. No afecta el runtime de la aplicación en sí (Next.js habla
con Supabase por HTTPS vía `@supabase/supabase-js`/`@supabase/ssr`, no
por el protocolo Postgres directo), ni a Vercel en producción (tiene
salida de red normal).

## 2026-08-16 — Bugs reales encontrados al aplicar las migraciones contra Postgres real

**Decisión**: se corrigieron dos bugs que solo se manifestaron al
ejecutar las migraciones contra una base de datos real (no detectables
por `lint`/`typecheck`, ya que son errores de SQL/Postgres):

1. `people.is_minor` como columna `generated always as (...) stored`
   usaba `current_date`, que Postgres rechaza en expresiones generadas
   por no ser inmutable (`SQLSTATE 42P17`). Además el diseño era
   incorrecto de fondo: "menor de edad" cambia con el tiempo, así que
   una columna generada/almacenada quedaría desactualizada entre
   updates. Se reemplazó por la función `is_minor(birth_date)`,
   calculada al vuelo (`stable`, no generada).
2. La política RLS `people_select_self` (en `0003_people.sql`)
   referenciaba la tabla `profiles`, creada recién en la migración
   siguiente (`0004_profiles.sql`) — error de orden de dependencias
   (`relation "profiles" does not exist`). Se movió la política a
   `0004_profiles.sql`, usando `current_person_id()` en vez del
   subquery inline.

**Contexto**: validan exactamente la preocupación registrada en la
decisión anterior ("Sin Docker/Supabase CLI...") — el código pasaba
`lint`/`typecheck`/`build` pero tenía bugs reales de SQL solo visibles
al ejecutarlo contra Postgres.

**Consecuencias**: las 16 migraciones se aplicaron exitosamente después
de estas correcciones, y se verificó manualmente en navegador con datos
reales (`npm run seed` + login con cada rol de prueba + pruebas
positivas y negativas de RLS) sin errores. Ver `docs/progress.md` para
el detalle completo de la verificación.
