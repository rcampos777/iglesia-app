# Donaciones y Finanzas

> **SuperAdmin** = rol interno `apostol` (0036): pastores generales con todos
> los permisos de la app. En este documento "Apóstol" y "SuperAdmin" son lo
> mismo.

Migraciones: `0034_financial_roles.sql` (roles) y `0035_donations_finance.sql`
(todo lo demás). Permisos: [`roles-and-permissions.md`](roles-and-permissions.md) §7.

Registra **pagos ya recibidos**. No procesa tarjetas ni mueve dinero. No se
guardan números de tarjeta, códigos de seguridad ni credenciales bancarias
(la base rechaza referencias con 13+ dígitos seguidos).

## 1. Registro

- **Tipos**: Diezmo, Ofrenda, Semilla, Primicias.
- **Formas de pago**: Efectivo (Cash), ATH, Crédito, ATH Móvil, Cheque, Giro.
- **Donante**: una persona existente (por ID, nunca por nombre; puede no
  tener cuenta) **o** donación anónima (sin persona). Si no está
  registrada, Finanzas puede **crear un donante** ("Crear donante nuevo"):
  queda solo para Finanzas, oculto del directorio y los reportes (§9).
- **Tipos**: además de los de arriba, **Pacto** (desde 2026-10-11).
- **Cantidad**: centavos enteros (`bigint`), > $0.00 y ≤ $1,000,000.00. El
  texto se interpreta sin punto flotante (`src/lib/money.ts`); los totales
  los suma la base (`sum(bigint)`).
- **Fecha**: fecha local, no futura (hora de Puerto Rico). Los períodos son
  fechas inclusivas: el 31 de diciembre entra en el año; el 1 de enero, no.
- **Duplicados**: cada formulario genera una clave de idempotencia; un doble
  clic o un reintento tras un corte de red devuelve la misma donación. Dos
  aportaciones legítimas iguales (misma persona, fecha y monto) sí se
  permiten.
- **Trazabilidad**: `created_by/at`, `version`, estado (`vigente`/`anulada`)
  y `donation_revisions` (inmutable: antes/después, motivo, responsable).

## 2. Correcciones y anulaciones

- Nunca se borra una donación (trigger lo impide). **Corregir** y **Anular**
  exigen motivo (≥ 5 caracteres) y la `version` que se tenía cargada: si
  otra persona la cambió, se rechaza ("recarga e intenta de nuevo").
- Las anuladas no suman en totales ni en cartas; se ven tachadas en el
  listado (filtro "Estado").
- Si una corrección, anulación o alta con fecha anterior afecta un período
  ya certificado, las cartas vigentes de esa persona y período pasan a
  **"Requiere revisión"** con el motivo. La carta emitida no cambia; se
  genera una nueva versión.

## 3. Petición de oración del sobre (opcional)

- Campo **"Petición de oración (opcional)"**. Vacío no impide registrar.
- Se guarda en `donation_prayer_notes`, **sin políticas de lectura**: nadie
  (ni Finanzas) la consulta directo. Solo por `read_donation_prayer_note()`,
  que registra cada lectura en `donation_prayer_note_access_log`.
- **Quién puede leerla**: Apóstol y Finanzas, solo desde el detalle de esa
  donación, tocando "Ver petición" (queda auditado). No aparece en
  listados, totales, reportes, exportaciones, cartas, historial de
  revisiones, `audit_log`, `finance_audit_log` ni mensajes de error.
- **Compartir con intercesión**: desactivado por defecto; exige marcar
  "Confirmo que la persona autorizó…". Se guarda quién registró esa
  autorización y cuándo (es la declaración del operador, **no** una firma
  del donante). Crea una sola `prayer_requests` (idempotente) con el texto
  y la persona (o anónima), `submitted_by_user_id = null` (el operador no
  gana acceso por "autor"), y queda en `prayer_request_access_log`. A partir
  de ahí aplica el acceso normal del módulo de oración. Intercesión nunca
  ve monto ni forma de pago.
- Finanzas/Apóstol **no** obtienen acceso a la bandeja de oración.

## 4. Pantallas (`/finanzas`, solo Apóstol y Finanzas)

- **Donaciones**: filtros por período (por defecto el mes en curso),
  persona, tipo, forma de pago, identificadas/anónimas y estado; paginación
  de 25; totales (general, identificadas, anónimas, por tipo y por forma de
  pago) calculados en la base sobre **todo** el filtro (solo vigentes).
- **Registrar**, **detalle con historial**, **corregir**, **anular**.
- **Donante** (`/finanzas/donantes/[id]`): totales por año, sus donaciones y
  sus cartas.
- **Exportar CSV** (`/finanzas/exportar`): mismos filtros; sin peticiones;
  celdas protegidas contra fórmulas; máx. 50,000 filas (avisa si se corta);
  auditada en `finance_audit_log`.
- **Configuración**: datos de la iglesia y texto de la carta.
- **Acceso** (solo Apóstol): quién tiene Apóstol/Finanzas; conceder y
  revocar Finanzas.

## 5. Cartas

1. Cartas → buscar persona → elegir año (o desde/hasta).
2. Se ven sus aportaciones **vigentes e identificadas** del período y el
   total (calculado en la base). Anónimas, anuladas y fuera de período no
   cuentan.
3. Vista previa en pantalla y "Vista previa en PDF" (marcada, no se guarda).
4. **Emitir**: el servidor vuelve a calcular; si el total, la cantidad o la
   versión cambiaron desde la vista previa, no emite. Guarda la instantánea
   (`snapshot`), el total, el **PDF exacto** (`bytea` + SHA-256), el emisor y
   la fecha. Versión anterior del mismo período → "Reemplazada".
5. **Versiones**: la descarga devuelve el PDF guardado, byte por byte; nunca
   se recalcula. Las descargas quedan auditadas.

Contenido: membrete con logo oficial, datos configurables (solo los que se
llenen), fecha de emisión, destinatario ("Secretario de Hacienda" por
defecto), nombre del donante, período, total, texto configurable
(`{donante}`, `{iglesia}`, `{periodo}`, `{total}`), despedida, espacio de
firma con nombre y cargo, código de documento (`CDA-AAAA-XXXXXXXX-vN`) y
versión, y anexo con el detalle (fecha, tipo, cantidad) con encabezado
repetido en cada página.

**Plantilla provisional**: mientras la configuración esté en "borrador",
cada página dice "BORRADOR - Plantilla provisional pendiente de revisión".
No afirma deducibilidad ni cumplimiento contributivo. Solo un Apóstol la
marca "aprobada", después de revisarla con el ejemplo de la iglesia.

Almacenamiento: los PDF viven en la tabla `donation_letters` (RLS de
Finanzas), no en almacenamiento público. Las rutas `/finanzas/cartas/[id]/pdf`,
`/vista-previa` y `/exportar` responden 404 sin acceso (no revelan si el
documento existe) y `Cache-Control: private, no-store`. No se envían cartas
por email.

## 6. Datos que faltan (no se inventaron)

- Ejemplo de carta de la iglesia (texto final).
- Dirección, teléfono, email y número de identificación de la iglesia (si se
  deben imprimir).
- Nombre y cargo del firmante.
- Identidad de la persona que será el primer Apóstol.

## 7. Activación (pendiente)

Nada de esto corre en producción todavía. Pasos:

1. Aplicar 0034 y 0035 (con la app ya desplegada o junto con ella; no
   eliminan columnas existentes, así que el orden no rompe nada).
2. **Alta inicial del Apóstol** (una sola vez, en el SQL Editor de Supabase
   del proyecto de producción; nadie puede hacerlo desde la app):

   ```sql
   select bootstrap_first_apostol(
     (select id from auth.users where email = 'CORREO-DEL-APOSTOL'),
     'Autorizado por: NOMBRE, fecha, medio'
   );
   ```

   Falla si ya existe un Apóstol. Queda en `audit_log`.

3. El Apóstol entra a Finanzas → Acceso y concede Finanzas a quien corresponda.
4. Finanzas → Configuración: completar los datos confirmados. Aprobar la
   plantilla (Apóstol) solo después de revisarla.

## 7.b Dar acceso de Finanzas

Solo un SuperAdmin, en **Finanzas → Acceso** (busca la cuenta por nombre o
email; la persona debe tener cuenta de acceso). Desde 2026-10-01, la
pestaña "Cuenta y permisos" de cada persona muestra la tarjeta
"SuperAdmin y Finanzas" con lo que tiene y, para un SuperAdmin, el botón
"Ir a Finanzas → Acceso".

## 8. Certificaciones de ministros (`/certificaciones`)

Desde 2026-10-01 (`0042`, `0043`). Mismo acceso que Finanzas: Apóstol
(SuperAdmin) y Finanzas; el administrador no. Decisión en
`docs/decisions.md` (2026-10-01).

- **Qué guarda**: persona, tipo (antecedentes penales, Registro de
  Ofensores Sexuales — Ley 300, credencial ministerial, y los que se
  añadan en _Tipos_), fecha de emisión, fecha de vencimiento (opcional),
  notas y el documento (PDF o foto, hasta 10 MB).
- **Pantallas**: lista con resumen por estado (vencida, vence pronto en
  ≤ 30 días, vigente, sin fecha), búsqueda por nombre y filtros por estado
  y tipo; "Nueva certificación" (busca a la persona igual que en
  Donaciones); ficha para editar, reemplazar o quitar el documento, y
  "Ver documento"; _Tipos_ para añadir o desactivar tipos.
- **Borrar**: solo el apóstol (se borra también el archivo).
- **Auditoría**: crear, actualizar, borrar y abrir el documento quedan en
  `finance_audit_log`.
- **Pendiente**: aviso por email cuando una certificación está por vencer;
  qué ministerios exigen qué certificación.

## 9. Importar diezmos y ofrendas y donantes de Finanzas (`0053`)

Desde 2026-10-11. Decisión en `docs/decisions.md` (2026-10-11).

### Donantes solo de Finanzas

- `people.finance_only = true`, `source = 'finanzas'`. Una política RLS
  restrictiva los oculta a **toda** consulta directa (nadie los ve en
  Personas, panel, reportes, check-in, clases ni ministerios; tampoco
  admin ni SuperAdmin). Finanzas los ve en sus pantallas (búsqueda con la
  pista "Donante (solo Finanzas)", ficha del donante, cartas).
- Se crean desde la importación o con "Crear donante nuevo" en
  Registrar. Si el nombre ya existe, pide confirmar que es otra persona.

### Importar (`/finanzas/importar`)

1. **Subir** .xlsx (hasta 8 MB, 20,000 filas) o CSV. Se usa la primera hoja
   con columnas de donaciones: Fecha, Nombre del miembro, Familia/Grupo,
   Categoría, Subcategoría, Monto, Forma de pago, Referencia,
   Observaciones ("Año/Mes (auto)" se ignoran; "Mes #" ayuda con fechas
   ambiguas). Fechas de Excel, `AAAA-MM-DD` o `M/D/AAAA`. Montos
   redondeados al centavo sin punto flotante. Visa/Mastercard → Crédito.
2. **Staging** (`donation_import_batches/_donors/_rows`, solo lectura para
   Finanzas; se escriben solo por funciones). Filas con error (sin monto,
   fecha futura, referencia con número de tarjeta, año poco común en el
   archivo) no se importan y se listan con su número de fila.
3. **Valores sin reconocer** de Categoría o Forma de pago: se asignan una
   vez para todas sus filas.
4. **Donantes**: cada nombre (normalizado) aparece una vez. Opciones:
   "Es esta persona" (candidatos de la app con pista), "Es la misma
   persona" (nombre parecido en el mismo archivo), buscar otra persona,
   crear donante nuevo (nombre y apellidos editables), anónimas o no
   importar. Atajos: aceptar coincidencias exactas (mismo nombre completo o
   el enlace usado en un archivo anterior) y crear los que no se parecen a
   nadie. Los parecidos siempre se deciden uno por uno.
5. **Importar**: por tandas de 250 (`finance_import_promote`). Cada fila
   usa su id como clave de idempotencia: reintentar no duplica. Si ya hay
   una donación igual (persona, fecha, monto, tipo) registrada fuera de
   este archivo, la fila queda "ya registrada" para importar igual u
   omitir. Las iguales dentro del mismo archivo sí se importan. Las cartas
   del período se marcan para revisión como en cualquier alta.
6. Un lote sin nada importado se puede descartar. Subcategoría y
   Observaciones quedan en el staging (no hay campo en `donations`).

### Vincular (`/finanzas/vincular` y ficha del donante)

- Lista donantes de Finanzas cuyo nombre se parece a una persona del
  directorio (indica si tiene cuenta). "Vincular" (motivo obligatorio)
  mueve donaciones (revisión `corregida`) y cartas a esa persona y borra
  el registro de Finanzas. "No es la misma" oculta la sugerencia.
- Auditoría en `finance_audit_log`: crear donante, crear/completar/
  descartar lote, vincular.

## Registro central de personas (0054)

- "Crear donante nuevo" muestra antes las coincidencias del directorio y de
  donantes de Finanzas ("Usar esta persona"); el donante nuevo sigue oculto.
- Una unificación del directorio (administrador) mueve las donaciones de
  la persona unida con revisión "corregida"; importe, fecha, tipo, método y
  referencia no cambian; las cartas del período quedan para revisión.
- Los donantes de Finanzas no se unifican desde el directorio: se vinculan
  en Finanzas → Vincular. Ver `docs/person-registry.md`.
