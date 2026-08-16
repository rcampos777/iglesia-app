# Proceso de importación de datos

Fuentes soportadas: **Excel (.xlsx)**, **CSV**, y **exportaciones de
Microsoft Access** (se exportan primero a CSV/Excel desde Access; la app
no se conecta directamente a archivos `.mdb`/`.accdb`). También cubre la
**entrada manual** de registros en papel mediante un formulario de
captura rápida que reutiliza el mismo pipeline de staging.

## 1. Regla dura

**Nunca se escribe directo en `people` (ni ninguna tabla final) desde un
archivo importado.** Todo pasa por:

```
archivo/captura → import_batches + import_rows (staging)
                 → validación (Zod)
                 → matching de posibles duplicados
                 → revisión humana fila por fila
                 → promote_import_row() → people
```

## 2. Paso a paso

1. **Subida** (`/importar`): el usuario (rol `seguimiento` o superior)
   sube un archivo o elige "captura manual". Se crea un `import_batches`.
2. **Parseo** (`POST /api/import/parse`): Excel/CSV se parsean en el
   servidor (`papaparse` para CSV; para `.xlsx` se normaliza a filas de
   texto). Cada fila cruda se guarda en `import_rows.raw_data` (jsonb),
   sin transformar.
3. **Normalización y validación**: se mapean columnas del archivo a
   campos del modelo (`first_name`, `last_name`, `email`, `phone`,
   `birth_date`, etc.) con un esquema Zod
   (`src/lib/validations/import.ts`). El resultado va a
   `normalized_data`; los errores de validación a `validation_errors`
   (no bloquean el guardado en staging, sí bloquean la promoción).
4. **Detección de duplicados**: por cada fila se buscan personas
   existentes con **coincidencia por combinación de señales** (nunca por
   nombre solo): email exacto, o teléfono exacto, o (nombre + apellido +
   fecha de nacimiento) coincidentes. Se guardan como
   `candidate_person_ids`. `match_status` se marca `nuevo`,
   `posible_duplicado`, o `invalido` (si faltan campos obligatorios).
5. **Revisión humana** (`/importar/[batch]/revisar`): por cada fila con
   `posible_duplicado` o `nuevo`, un humano decide:
   - **Aprobar como nuevo** → crea un `people` nuevo.
   - **Fusionar con [persona existente]** → no crea registro nuevo;
     vincula la fila al `people.id` existente.
   - **Rechazar** → la fila queda descartada, sin efecto.
     Ninguna de estas decisiones ocurre automáticamente, ni siquiera para
     coincidencias con muy alta similitud — la función `promote_import_row`
     siempre requiere una decisión explícita por fila.
6. **Promoción**: `promote_import_row(row_id, decision, target_person_id?)`
   ejecuta la acción elegida dentro de una transacción, y dispara
   `security invoker` (respeta RLS: solo staff autorizado puede tener
   éxito).
7. **Sin notificaciones automáticas**: crear o fusionar personas por
   importación **no** encola ningún email/notificación. Los datos
   importados quedan "silenciosos" por diseño.

## 3. Entrada manual de registros en papel

Mismo pipeline, con `import_batches.source_type = 'manual'`: se genera un
lote y cada registro capturado a mano se agrega como una `import_row` con
`raw_data` igual a lo tecleado, para pasar por el mismo matching y
revisión — así un registro de papel mal transcrito no genera un duplicado
silencioso.

## 4. Formato esperado de columnas (plantilla recomendada)

| Columna del archivo | Campo interno       | Obligatorio                       |
| ------------------- | ------------------- | --------------------------------- |
| Nombre              | `first_name`        | Sí                                |
| Apellido            | `last_name`         | Sí                                |
| Email               | `email`             | No                                |
| Teléfono            | `phone`             | No                                |
| Fecha de nacimiento | `birth_date`        | No                                |
| Género              | `gender`            | No                                |
| Dirección           | `address_line`      | No                                |
| Ciudad              | `city`              | No                                |
| Estatus             | `membership_status` | No (default `asistente_habitual`) |

El asistente de importación permite mapear columnas con nombres distintos
a esta plantilla (no obliga a renombrar el archivo original).

## 5. Qué falta para producción

- Parseo real de `.xlsx` (actualmente el pipeline soporta CSV
  end-to-end; el parser de Excel binario se documenta como pendiente en
  `docs/progress.md` si no se alcanzó a implementar en esta iteración).
- Ajustar el umbral/heurística de duplicados con datos reales de la
  iglesia (hoy es una heurística simple y conservadora).
