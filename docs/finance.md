# Donaciones y Finanzas

Migraciones: `0034_financial_roles.sql` (roles) y `0035_donations_finance.sql`
(todo lo demás). Permisos: [`roles-and-permissions.md`](roles-and-permissions.md) §7.

Registra **pagos ya recibidos**. No procesa tarjetas ni mueve dinero. No se
guardan números de tarjeta, códigos de seguridad ni credenciales bancarias
(la base rechaza referencias con 13+ dígitos seguidos).

## 1. Registro

- **Tipos**: Diezmo, Ofrenda, Semilla, Primicias.
- **Formas de pago**: Efectivo (Cash), ATH, Crédito, ATH Móvil, Cheque, Giro.
- **Donante**: una persona existente (por ID, nunca por nombre; puede no
  tener cuenta) **o** donación anónima (sin persona). Si la persona no está
  registrada, se pide a Seguimiento/administración que la registre con el
  flujo existente (detección de duplicados); Finanzas no crea personas.
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
