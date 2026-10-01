# Inscripción en línea a actividades

Migración `0040_activity_online_registration.sql`. Primer uso: Retiro de
Hombres 2026 "Un Encuentro con Dios" (30 oct – 1 nov 2026).

## Qué hace

Cualquier **actividad** (Actividades → una actividad) puede tener una forma
pública en el sitio web:
`https://ciudaddeavivamiento.org/inscripcion/<dirección>` (en la app:
`/sitio/inscripcion/<dirección>`).

La forma pide: nombre, apellidos, dirección física, edad, teléfono, email,
familiar y teléfono en caso de emergencia, si persevera en una iglesia (y
cuál), si padece de alguna condición médica (y cuál, opcional), y la
aceptación del depósito no reembolsable y el costo total. La fecha de
registro se guarda sola.

## Automatizaciones

| Cuándo                          | Qué pasa                                                                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Al inscribirse                  | Si no se parece a nadie en Personas: se crea la persona (visitante, con origen "Inscripción: <actividad>") y queda en la lista de inscritos. Si se parece (mismo email, teléfono o nombre): queda "Revisar duplicado". |
| Al inscribirse                  | Email de confirmación a la persona: la **carta de bienvenida** (editable; `{{Nombre}}` → su nombre) y debajo fechas, lugar, costo, depósito, cómo pagar, contacto.                                                     |
| Al inscribirse                  | Email a los organizadores (correos configurados + responsable de la actividad) con los datos básicos y un enlace a la app. **Sin datos médicos.**                                                                      |
| 10 días antes (si debe balance) | Recordatorio de pago con el balance y cómo pagar.                                                                                                                                                                      |
| 3 días antes                    | Recordatorio de la actividad: fecha, lugar, qué llevar y balance si queda.                                                                                                                                             |

Los recordatorios salen de un cron diario (Vercel Cron, 9:00 a. m. de PR →
`/api/cron/recordatorios-inscripciones`). Cada recordatorio sale **una vez**
por inscripción (se comprueba en `notification_log`); si el cron falla un
día, al siguiente se pone al día. Quien se inscribe ya dentro de los 10
días no recibe el recordatorio de pago (la confirmación ya trae el balance).

Las respuestas a los emails ("Responder") llegan a los correos de aviso.

## Pagos (ATH Móvil / efectivo)

No hay cobro en línea. El organizador abre la inscripción y registra cada
pago (monto, método, fecha, referencia). La app calcula lo pagado y el
balance y muestra: Sin depósito / Reservado (pagó el depósito) / Pagado.
Arriba salen los totales: inscritos, con depósito, recaudado y por cobrar.

## Duplicados

Regla del proyecto: nunca se une un posible duplicado solo. En la
inscripción marcada "Revisar duplicado" el organizador elige "Sí, es esta
persona" (completa email/teléfono/dirección vacíos de esa persona, sin
pisar nada) o "No es ninguna: crear persona nueva". Queda en `audit_log`.

## Quién ve qué

- Inscripciones y pagos: solo quien organiza la actividad
  (`can_manage_activity`: administrador, coordinador de ministerio,
  SuperAdmin o el líder del ministerio dueño). Contienen datos de salud.
- El público no lee ni escribe tablas: solo `public_registration_activity`
  (datos públicos de la actividad) y `submit_activity_registration`.
- Solo mayores de 18 (CLAUDE.md §3.13). Para menores: contactar a los
  organizadores.
- Anti-spam: campo trampa invisible + tiempo mínimo de llenado (medido en
  el navegador). Un email = una inscripción activa por actividad.

## Cómo publicar el retiro

1. Aplicar `0040` en Supabase y desplegar (en ese orden).
2. En Vercel: variable `CRON_SECRET` (valor aleatorio largo). Opcional
   `NEXT_PUBLIC_SITE_URL` si el dominio público no es
   `https://ciudaddeavivamiento.org`.
3. Sitio web → Fotos: subir el flyer.
4. Actividades → Nueva: "Retiro de Hombres 2026", fecha 30/10/2026, hasta
   01/11/2026, lugar, cupo, estado **Abierta**.
5. En la actividad → Inscripción en línea: dirección
   `retiro-hombres-2026`, costo 150, depósito 50, cómo pagar (ATH Móvil),
   qué llevar, contacto, correos de aviso, flyer; activar "Inscripción
   abierta". Guardar.
6. Sitio web → Eventos: crear el evento con enlace a la forma
   ("Inscríbete").
