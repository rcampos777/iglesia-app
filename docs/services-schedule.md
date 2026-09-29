# Cultos recurrentes y asistencia

Migraciones: `0031_attendance_roles.sql`, `0032_recurring_services_attendance.sql`,
`0033_schedule_service_generation.sql`. Permisos: [`roles-and-permissions.md`](roles-and-permissions.md) §6.

## 1. Programación semanal

Configurada en 0032, en hora de Puerto Rico (`America/Puerto_Rico`, UTC−4 todo el año):

| Día       | Hora local | Nombre             | Tipo            |
| --------- | ---------- | ------------------ | --------------- |
| Domingo   | 9:30 a. m. | Culto dominical    | `culto_general` |
| Miércoles | 7:30 p. m. | Culto de miércoles | `culto_general` |
| Viernes   | 7:30 p. m. | Culto de jóvenes   | `jovenes`       |

- Cada fecha es **una fila de `services`** con su propia asistencia.
- Horizonte: **4 semanas** hacia adelante (`service_schedule_settings.horizon_weeks`,
  editable en Programación, entre 1 y 26). Reducirlo no borra nada.
- Instantes: `services.starts_at` guarda el instante real (timestamptz).
  La app muestra fechas y horas con `Intl.DateTimeFormat` y
  `timeZone: "America/Puerto_Rico"` (`src/lib/datetime.ts`), sin importar
  la zona del servidor (Vercel = UTC) ni la del dispositivo.

## 2. Generación automática

`generate_service_occurrences()` crea las fechas que falten desde hoy (PR)
hasta el horizonte:

- **Idempotente**: índice único `(series_id, occurrence_date)` +
  `ON CONFLICT DO NOTHING`. Correrla N veces crea cada fecha una vez.
- **Concurrencia**: `pg_advisory_xact_lock` serializa ejecuciones
  simultáneas (cron + página, dos cron…); aun sin el lock, el índice
  único impide duplicados.
- **Nunca modifica ni recrea** filas existentes: una fecha cancelada
  sigue cancelada (su fila existe → conflicto → no se inserta otra) y
  una fecha cambiada a mano queda como está.
- **Quién la ejecuta**: pg_cron todos los días a las 12:15 a. m. de PR
  (0033). Además la página **Asistencia** y **Programación** llaman a
  `ensure_service_occurrences()` como respaldo (exige una capacidad de
  asistencia). `anon`/`authenticated` no pueden ejecutar el generador
  directamente.

## 3. Cambios

| Acción                                                              | Quién                    | Efecto                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cambiar horario de una serie "a partir de" una fecha (hoy o futura) | `gestion_cultos` / admin | Cierra la versión vigente el día anterior y crea otra. Antes de la fecha no cambia nada. Desde la fecha, las ocurrencias **sin asistencia y sin cambios manuales** se regeneran con el nuevo horario; las que tienen asistencia o son excepciones se conservan. La pantalla muestra la fecha exacta y este resumen **antes** de aplicar. |
| Terminar una serie desde una fecha                                  | igual                    | No se programan más fechas desde ese día (mismas reglas de conservación).                                                                                                                                                                                                                                                                |
| Cancelar una fecha                                                  | igual                    | `status = cancelado`, motivo opcional, auditado. No acepta registros ni se recrea. Se puede **reactivar**.                                                                                                                                                                                                                               |
| Cambiar fecha u hora de una fecha                                   | igual                    | Conserva la anticipación de apertura y la duración hasta el cierre automático. Queda como excepción.                                                                                                                                                                                                                                     |
| Culto especial                                                      | igual                    | Fila suelta (sin serie), abre 1 h antes, cierre automático opcional.                                                                                                                                                                                                                                                                     |

Todo queda en `audit_log` (`cancel_service`, `reinstate_service`,
`reschedule_service`, `update_service_series`, `end_service_series`,
`create_special_service`, `update_service_schedule_settings`).

## 4. Ventana de registro

`service_checkin_state()` es la única fuente de verdad:

- `cancelado` si el culto está cancelado.
- `cerrado`/`abierto` si alguien con `control_checkin` lo decidió a mano.
- `pendiente` antes de `checkin_opens_at` (**1 h antes** del inicio).
- `cerrado` desde `checkin_closes_at`, **solo si** la serie tiene
  cierre automático configurado. Por defecto **no** lo tiene: la
  duración de los cultos no está definida, así que el registro se
  cierra a mano hasta que un administrador configure "Cerrar registro
  (min después)" en la serie.
- `abierto` en otro caso.

Un culto de días anteriores que nadie cerró sigue apareciendo en
Asistencia (con su fecha) para que se note y se pueda cerrar.

Registros fuera de la ventana: solo `correccion_asistencia`, con motivo
auditado ("Agregar (corrección)").

## 5. Flujo del ujier

1. Abre **Asistencia** (menú, o "Registrar asistencia" en el panel).
2. Ve el culto de hoy con horario y estado. Si hay varios, elige uno.
3. **Buscar**: escribe 2+ letras; ve nombre + pista (tel. o email
   enmascarado) y "Confirmar" (o "Ya registrado").
   **Escanear QR**: "Activar cámara" (el permiso se pide aquí) o un
   lector USB/Bluetooth en el campo de texto.
4. La respuesta aparece arriba: "quedó registrado", "ya estaba
   registrado" o el error. Sin respuesta del servidor → aviso de que
   **no** quedó registrado + "Reintentar" (no duplica).
5. El buscador se limpia y queda enfocado para la siguiente persona.
   La lista "Registrados" se actualiza sola cada 20 s.

Visitantes que no aparecen: si el ujier puede dar de alta personas, se
le ofrece `/visitantes/nuevo` (detección de duplicados existente); si
no, se le indica pedirlo a Seguimiento o a un administrador.

## 6. Activación en producción (pendiente)

**Implementado en código ≠ activado.** Nada de esto corre en producción
hasta aplicar las migraciones y desplegar la app **juntas** (0032 elimina
`services.is_checkin_open`, que la versión anterior de la app usa).

1. Aplicar migraciones (desde `supabase/`, con el proyecto de producción
   enlazado, ver `docs/deployment.md` §2):

   ```bash
   npx supabase db push
   ```

2. Desplegar la app (push a `main` → Vercel).
3. Verificar en el SQL Editor de Supabase:

   ```sql
   select jobname, schedule, active from cron.job;             -- generate-service-occurrences, '15 4 * * *'
   select name, service_date, start_time from services
     where series_id is not null order by starts_at limit 6;  -- dom 09:30, mié 19:30, vie 19:30
   ```

   Al día siguiente: `select status, start_time from cron.job_run_details order by start_time desc limit 3;`

4. Si `create extension pg_cron` fallara (no debería en Supabase), la
   generación sigue funcionando por el respaldo de la página, pero
   **no** sería automática: habilitar pg_cron en Dashboard → Database →
   Extensions y volver a correr 0033.
5. Asignar accesos: Personas → persona → "Cuenta y permisos" →
   "Asistencia a cultos".
6. Retirar el QR fijo impreso de la entrada, si existe: ya no registra
   asistencia (lleva a una página que solo muestra el QR personal).
