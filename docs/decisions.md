# Registro de decisiones (ADR ligero)

Formato: fecha, decisión, contexto/alternativas, consecuencias.

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
