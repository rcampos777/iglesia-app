# Privacidad: aviso, aceptación y borrado del propio perfil

Implementado el 2026-10-03 (`0049_privacy_and_self_delete.sql`). Responde a
los hallazgos H-02 (no había aviso de privacidad) y H-10 (no había borrado
con historial) de la auditoría (`docs/audit/2026-10-privacidad-seguridad.md`).

> **No es una certificación de cumplimiento legal.** El texto describe lo
> que el sistema hace hoy. Antes de darlo por definitivo, debe revisarlo un
> abogado (preguntas en §10 del informe de auditoría: Ley 39-2012, Ley
> 111-2005, COPPA, plazos de conservación de donaciones).

## 1. Dónde aparece el aviso

| Lugar                                              | Qué se ve                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `/sitio/privacidad` (en el sitio: `/privacidad`)   | Aviso completo, público. Datos de contacto tomados de `site_settings` (editor del sitio).     |
| `/registro` (crear cuenta)                         | Resumen + casilla obligatoria "He leído el aviso..." (Zod en servidor: `acceptPrivacy = si`). |
| Al entrar a la app (`(app)/layout.tsx`)            | Pantalla `PrivacyGate`: hay que pulsar **Entendido** para seguir, o **Salir**.                |
| Mi portal → "Privacidad y mi cuenta"               | Enlace al aviso + borrar mi perfil.                                                           |
| Login, pie del sitio, forma pública de inscripción | Enlace al aviso.                                                                              |

Texto: resumen en `src/components/privacy/privacy-summary.tsx`; aviso
completo en `src/app/(sitio)/sitio/privacidad/page.tsx`.

## 2. Versión y aceptación

- `PRIVACY_VERSION` (`src/lib/privacy.ts`) es la fecha de la versión
  vigente (`AAAA-MM-DD`). **Si cambia el texto, cambia la versión**: todas
  las cuentas vuelven a ver la pantalla al entrar ("Actualizamos el aviso
  de privacidad"). Así se cumple lo que el aviso promete en "Cambios a este
  aviso".
- `profiles.privacy_version` y `profiles.privacy_accepted_at` guardan qué
  versión aceptó cada cuenta y cuándo (`accept_privacy_notice(p_version)`,
  solo la propia cuenta).
- Quien acepta en `/registro` guarda la versión en `user_metadata`; en su
  primer inicio de sesión se registra en `profiles` sin volver a preguntar.
- Personas sin cuenta (importadas o creadas por el personal) no ven la
  pantalla; el aviso público y el de la forma de inscripción las cubren.

## 3. Borrar mi perfil (Mi portal)

`delete_my_account('BORRAR')` (decisión 2026-10-03):

| Caso                                                          | Resultado                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin nada ligado                                               | `borrado`: se borran la persona y la cuenta.                                                                                                                                                                                                                           |
| Con historial (clases, asistencia, ministerios, actividades…) | `anonimizado`: nombre "Persona eliminada", sin email, teléfono, dirección, fecha de nacimiento, género, estado civil, notas ni foto; estado `inactivo`. Se borran sus peticiones de oración, respuestas de encuestas, seguimientos e invitaciones. Se borra la cuenta. |
| Con donaciones, cartas o certificaciones                      | `pendiente_revision`: se borra la cuenta; el registro queda **intacto** con `people.deletion_requested_at` para que un SuperAdmin lo revise.                                                                                                                           |
| Cuenta con SuperAdmin o Finanzas                              | Rechazado: otro SuperAdmin debe quitar el acceso primero.                                                                                                                                                                                                              |
| Último administrador                                          | Rechazado por el guard existente de `user_roles`.                                                                                                                                                                                                                      |

Al anonimizar también se reemplazan los datos de sus **inscripciones en
línea** (nombre, dirección, teléfono, email, contacto de emergencia,
iglesia, datos médicos y notas), se vacía la bitácora de emails que lo
menciona y las filas crudas de importación ligadas a la persona.

**La cuenta de acceso**: se intenta borrar de `auth.users`. Si alguna
referencia lo impide (p. ej. invitaciones al portal que creó un miembro
del personal), la cuenta se **vacía y bloquea**: email ficticio, sin
contraseña, sin teléfono ni metadatos, `banned_until` a 100 años, sin
identidades, sesiones ni factores MFA. Solo queda el id, para que las
bitácoras sigan siendo coherentes.

Bitácora: `audit_log` `person.self_delete` **sin actor y sin nombre**
(solo id y resultado).

Después la app cierra la sesión y muestra en `/login` "Tu perfil se borró"
o el aviso de revisión.

## 4. Anonimizar (SuperAdmin)

En la ficha de la persona, la tarjeta "Borrar o anonimizar persona"
(solo SuperAdmin) ofrece **Anonimizar** cuando la persona tiene historial
(`anonymize_person(id, motivo)`). Mismo efecto que el caso con historial
de §3, pero aplica también si hay donaciones: estas quedan sin nombre y ya
**no se pueden emitir cartas** para esa persona. Motivo obligatorio;
`audit_log` `person.anonymize`. Mismas exclusiones (propia cuenta,
SuperAdmin/Finanzas).

La ficha muestra un aviso cuando la persona pidió borrar sus datos
(`deletion_requested_at`) o ya está anonimizada.

## 5. Límites conocidos (no prometer lo contrario)

- Las copias de seguridad de Supabase conservan los datos borrados hasta
  que vencen (plazo según el plan; no verificado, H-15).
- Los emails ya enviados siguen en los buzones y en el historial de Resend.
- Los registros técnicos de Vercel y Cloudflare siguen sus propios plazos.
- No hay todavía "Descargar mis datos" (H-09) ni plazos automáticos de
  conservación (H-04).
- Los datos de quien **no** tiene cuenta solo se borran a pedido, por un
  SuperAdmin (borrar si no tiene nada ligado, anonimizar si tiene historial).

## 6. Pruebas

`tests/db/self-delete.test.ts` (8): aceptación del aviso y formato de la
versión; confirmación con BORRAR; borrado sin historial (persona y cuenta,
bitácora sin actor); anonimización con historial (datos personales y
peticiones borrados, estadística conservada); cuenta referenciada vaciada y
bloqueada; donaciones/certificaciones → pendiente de revisión; SuperAdmin
no puede borrarse; `anonymize_person` solo SuperAdmin, con motivo, una vez.
E2E: casilla de privacidad en `/registro` y aviso público.
