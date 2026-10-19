# Registro central de personas (0054)

Cada persona tiene **un solo registro** en `people` (id uuid), llegue como
visitante, con su propia cuenta, como donante o registrada por un líder.
Crear la persona, crear su cuenta, asignarla a un ministerio y darle
permisos son **acciones separadas**. Decisión: 2026-10-18 en
`docs/decisions.md`. Migración: `supabase/migrations/0054_person_registry.sql`.

## 1. Identidad y datos mínimos

- `people.id` es la identidad. El correo **no** es identificador: puede
  cambiar o compartirse (familias). `auth.users` mantiene sus propias
  reglas de correo único para las cuentas.
- Obligatorio: solo el nombre (`first_name`). Apellidos, correo, teléfono y
  fecha de nacimiento son opcionales; una visita se registra con el nombre.
- Relaciones que apuntan a la persona (sin cambio de modelo): cuenta
  (`profiles.person_id`, única), visitas (`visitor_follow_ups`),
  aportaciones (`donations.person_id`, null si anónima), ministerios
  (`ministry_memberships`, una persona puede estar en varios), cursos,
  actividades, check-ins, peticiones, certificaciones.
- "Departamento" = **ministerio** (`ministries`). Pertenecer a uno no da
  permisos: liderar es `role_in_ministry` lider/colíder (lo asigna quien
  ya lidera o un coordinador) y Finanzas es un rol aparte.

## 2. Coincidencias

Columnas generadas en `people` (los valores originales no cambian):

| Columna     | Cómo se normaliza                                                       |
| ----------- | ----------------------------------------------------------------------- |
| `name_key`  | nombre + apellidos sin acentos, minúsculas, sin signos, espacios únicos |
| `email_key` | minúsculas y sin espacios                                               |
| `phone_key` | solo dígitos; el `1` inicial de PR/EE. UU. se quita; < 7 dígitos = nulo |

`person_match_candidates()` (interna) clasifica:

- **Confiable**: el nombre concuerda (igual o contenido: "Juan Pérez" ⊂
  "Juan Carlos Pérez Rivera") **y** además el correo, el teléfono o la
  fecha de nacimiento, sin fecha de nacimiento distinta.
- **Posible**: solo el nombre, o solo un contacto (correo/teléfono
  compartido; se marca "Nombre distinto").
- **Fuera**: mismo nombre con fecha de nacimiento distinta (son personas
  distintas), donantes de Finanzas fuera de Finanzas, perfiles borrados.
- La edad (si se da) solo suma como indicio ("Edad aproximada
  concuerda"); nunca basta.
- Siempre devuelve **los motivos** ("Mismo nombre · Mismo correo").

Nada se une ni se crea por una coincidencia, ni siquiera confiable.

`person_matches(contexto, ministerio, datos)` es lo que llaman los
módulos, con su propio permiso:

| Contexto     | Quién                                                      | Incluye donantes de Finanzas |
| ------------ | ---------------------------------------------------------- | ---------------------------- |
| `directorio` | administrador, pastor, coordinador, seguimiento            | No                           |
| `ministerio` | coordinador/administrador o el líder de **ese** ministerio | No                           |
| `finanzas`   | `finanzas` / SuperAdmin                                    | Sí                           |

Devuelve lo mínimo: nombre, nivel, motivos, correo y teléfono
**enmascarados** (`j•••@dominio`, `•••0101`), si tiene cuenta y si ya está
en el ministerio. Nunca historial, otros ministerios, donaciones ni notas.
Sin al menos 3 letras de nombre o un correo/teléfono no busca.

## 3. Alta común sin duplicados

`register_person(contexto, datos, revisadas, clave)` (directorio y
Visitantes) y `ministry_add_person(...)` (ministerios) usan el mismo
núcleo `person_create_checked`:

1. Valida los datos (nombre, formato de correo, fecha no futura).
2. Toma un candado por nombre, correo y teléfono normalizados: dos altas
   simultáneas de la misma persona se atienden en fila.
3. Si la **clave del envío** ya existe (`person_create_requests`), devuelve
   la misma persona: un doble clic o un reintento no duplica.
4. Si hay coincidencias que quien registra no marcó como revisadas,
   responde `COINCIDENCIAS` y la pantalla las muestra ("Parece que esta
   persona ya tiene un registro"): elegir una existente o "Ninguna es esta
   persona: registrar nueva".

Verificado en Postgres real (desarrollo): dos altas simultáneas → una
crea y la otra recibe las coincidencias; misma clave en paralelo → misma
persona.

Dónde se usa:

- **Personas → Nueva persona**: la ficha completa; las coincidencias se
  abren ("Abrir ficha") o se descartan.
- **Visitantes → Nuevo seguimiento**: primero quién visitó (existente o
  nueva, basta el nombre), luego el seguimiento.
- **Ministerio → Registrar persona**: nombre y correo (más teléfono y fecha
  opcionales); elige a la persona existente o la crea **sin cuenta** y la
  asigna. "Elegir de la lista" sigue disponible.
- **Finanzas → Registrar → Crear donante nuevo**: antes de crear muestra
  coincidencias del directorio y de donantes de Finanzas ("Usar esta
  persona"). El donante nuevo sigue oculto del directorio (`finance_only`).

## 4. Integrantes por ministerio e importación

- Estado de acceso visible ("Con cuenta" / "Sin cuenta" / "Invitada"),
  derivado de `profiles` por `people_account_status()` — solo para
  personas que quien mira ya puede ver.
- **Importar lista** (`/ministerios/[id]/importar`): CSV con Nombre,
  Apellidos, Correo, Teléfono, Fecha de nacimiento (encabezados en
  español o inglés; si solo hay "Nombre", se divide). Fechas AAAA-MM-DD o
  M/D/AAAA. Máximo 1,000 filas, 2 MB.
- Vista previa por fila (`ministry_import_rows`): **Ya registrada** (una
  sola coincidencia confiable: se sugiere reutilizar), **Revisar**
  (ambigua: se elige entre las coincidencias mostradas, crear o no
  importar), **Nueva**, **Con error** (correo/fecha inválidos, sin nombre,
  repetida en el archivo).
- **Aplicar** procesa solo lo decidido; es repetible: la fila es la clave
  del alta y la membresía activa es única. Si al crear aparece una
  coincidencia nueva, la fila vuelve a **Revisar**. Repetir el mismo
  archivo da "Ya estaba" sin duplicar personas ni membresías.
- No crea cuentas ni envía emails (regla 6).

## 5. Vincular una cuenta con su registro anterior

Quien crea su cuenta por su cuenta queda con una persona nueva
(`source = 'registro_cuenta'`). En **Mi portal → "¿Ya estabas registrado
en la iglesia?"** (`/portal/vincular`):

1. Da (opcional) teléfono y fecha de nacimiento; se usan su nombre y el
   correo de la cuenta. **No se le muestra ninguna lista ni dato.**
2. El servidor (`identity_claim_start`, solo `service_role`) busca **una**
   coincidencia confiable **sin cuenta** que tenga correo registrado y le
   manda un código de 6 dígitos **a ese correo registrado** (no al recién
   dado). Si hay varias (correo compartido), ninguna o el registro no tiene
   correo, no se envía nada.
3. La respuesta es siempre la misma ("si encontramos un registro…, enviamos
   un código"): no permite averiguar quién está registrado.
4. Con el código correcto (`identity_claim_verify`: 15 minutos, 5 intentos,
   5 solicitudes por día) se unifica: la persona anterior queda, la cuenta
   pasa a ella y lo hecho con la cuenta nueva se traslada. Conserva sus
   ministerios, visitas y demás historial.
5. Sin verificación: **"Prefiero que la iglesia lo revise"** crea una
   solicitud (`identity_review_requests`). Un administrador la ve en
   **Personas → Posibles duplicados → Solicitudes de vinculación** con las
   coincidencias y el motivo por el que no hubo código, y vincula solo
   después de confirmar la identidad (motivo obligatorio). Mientras, la
   persona usa su cuenta normalmente, sin historial unido.

Reglas: un "sí, soy yo" no basta; un contacto recién dado no prueba nada;
una persona con cuenta no se puede reclamar (se vuelve a comprobar con
candado al verificar). Sin proveedor de correo (`RESEND_API_KEY`) la app
lo dice y ofrece la revisión: no se simula una verificación.

**SMS: pendiente.** La tabla admite `channel = 'sms'`, pero no hay
proveedor configurado; hoy solo se verifica por correo. Para activarlo:
contratar un proveedor (p. ej. Twilio), guardar sus credenciales en
Vercel, enviar desde el servidor y permitir en `identity_claim_start` los
registros con teléfono y sin correo.

## 6. Posibles duplicados y unificación

- **Personas → Posibles duplicados** (`/personas/duplicados`, roles con
  directorio): parejas por correo, teléfono o nombre normalizados, con
  nivel y motivos. "No son la misma persona" la quita de la lista
  (`person_duplicate_dismissals`).
- **Revisar y unificar** (solo administrador): muestra el registro que
  queda y el que se une (con "Cambiar cuál queda"), si tienen cuenta, sus
  relaciones por módulo, los **campos en conflicto** (se elige cuál valor
  queda) y los ministerios en común. Motivo obligatorio.
- `person_merge` (transaccional; si algo falla no cambia nada):
  - Campos vacíos se completan con los del otro; las notas se juntan.
  - Relaciones: todo se traslada (incluidas tablas nuevas, por las llaves
    foráneas). Lo repetido se combina: ministerio en los dos → una fila
    con la fecha más antigua, la responsabilidad mayor y notas juntas;
    matrícula → estado más avanzado; asistencia a clase → la más
    favorable; actividad → asistió si cualquiera asistió; check-in
    repetido → se **anula** con motivo; encuesta repetida → se conserva
    sin persona. Las filas combinadas quedan guardadas en el rastro.
  - Donaciones: solo cambia la persona; importe, fecha, tipo, método y
    referencia quedan igual, con revisión "corregida" en
    `donation_revisions`. Las cartas pasan con la versión siguiente y las
    del período se marcan para revisión.
  - **Dos cuentas distintas no se unen** (`DOS_CUENTAS`): un administrador
    debe resolver primero cuál cuenta queda.
  - Los donantes de Finanzas se siguen vinculando desde Finanzas →
    Vincular.
- Rastro: `person_merges` (inmutable): id que quedó, **id anterior**,
  tipo (`unificacion`, `vinculacion_cuenta`, `vinculacion_revisada`),
  datos previos de ambos, campos elegidos, qué se trasladó, quién y
  cuándo; además `audit_log`. `/personas/<id anterior>` redirige al que
  quedó (`resolve_person_id`).
- El administrador no tiene acceso financiero: en la vista previa no ve
  el detalle de donaciones; solo se le avisa que, si existen, cambian de
  persona sin tocar importes.

## 7. Migración y datos existentes

- No une nada: las columnas generadas se calculan solas para todas las
  filas y los posibles duplicados quedan en la lista para revisión.
- Relaciones existentes intactas (verificado en
  `tests/db/person-registry.test.ts`, "migración sobre datos del esquema
  anterior").
- Las cuentas existentes ya tenían su persona; las creadas por registro
  propio pueden vincular su registro anterior desde Mi portal.

## 8. Pruebas

- `tests/db/person-registry.test.ts` (20 casos, PGlite): normalización,
  homónimos, correo compartido, permisos por contexto, alta con
  coincidencias y doble envío, visita mínima, suscriptor en Visitantes y
  Finanzas, ministerios (aislamiento entre líderes y de Finanzas,
  importación y reimportación), vinculación verificada (visitante, persona
  de un líder, ambigua, sin correo, ya vinculada, límite de intentos,
  revisión por administrador), unificación (traslados, combinación,
  importes, dos cuentas, descartar) y migración sobre datos viejos.
- `tests/unit/ministry-import.test.ts` (4): intérprete del CSV.
- `tests/e2e/person-registry.spec.ts` (6): las rutas nuevas exigen sesión.
- Concurrencia en Postgres real (desarrollo), script de una sola vez.
