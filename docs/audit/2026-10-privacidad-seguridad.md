# Auditoría de privacidad, seguridad y manejo de datos — Nexo

**Fecha:** 2026-10-01 · **Código auditado:** rama `main` (repo `Iglesia-App`) +
cambios de esta auditoría (sin desplegar) · **Hecha por:** Claude Code
(asistente de IA), a pedido del dueño del producto.

> Esto **no** es un dictamen legal ni una certificación de cumplimiento.
> Separa en cada punto: **[LEY]** obligación legal potencialmente aplicable ·
> **[BP]** buena práctica de seguridad o privacidad · **[LEGAL?]** requiere
> revisión de un abogado · **[NV]** no verificable con los accesos disponibles.

---

## 0. Resumen

- **Corregido y probado en esta auditoría (5):** Next.js con
  vulnerabilidades críticas (H-01); sin cabeceras de seguridad HTTP (H-03);
  bitácora de emails y respuestas de encuestas legibles por todo el
  personal (H-05); HTML sin escapar en emails del personal (H-06); secreto
  de la tarea programada comparado sin tiempo constante (H-07); y aviso de
  datos en la forma pública de inscripción (H-08).
- **Pendientes que dependen de decisiones comerciales o legales:** no hay
  política de privacidad (H-02); no hay plazos de conservación ni borrado
  automático (H-04); no hay exportación de datos para el miembro (H-09);
  no hay flujo para eliminar a una persona con historial ni para dar de
  baja a una iglesia (H-10); el registro público está abierto (H-11); no
  hay plan de respuesta a brechas (H-16); MFA (H-20).
- **No verificable desde aquí:** configuración de Auth en Supabase,
  copias de seguridad, contratos con proveedores, configuración de
  producción de otras iglesias y registros de Vercel y Resend.
- **Nada de lo corregido está desplegado.** Hay que aplicar `0047` en
  producción y publicar el código (fuera del alcance de esta auditoría).

---

## 1. Alcance, método y limitaciones

**Inspeccionado:** las 47 migraciones SQL (esquema, RLS y funciones), el
código de `src/` (páginas, server actions, route handlers, emails), los
scripts, `package.json` y el lockfile, `next.config.ts`, `.gitignore`,
`.env.example` (solo nombres de variables), el historial de git (búsqueda
de patrones de secretos, solo conteo), el paquete del navegador (roles de
los JWT incrustados) y los documentos de `docs/`.

**Probado:** con Postgres en memoria (PGlite, migraciones reales, datos
sintéticos), en el proyecto Supabase de **desarrollo** (datos sintéticos)
y en el navegador local con cuentas sintéticas `*@iglesia.test`.

**No accedido:** la base de **producción**, el panel de Supabase y de
Vercel (configuración de Auth, backups, logs, región), la cuenta de
Resend y los contratos. No se leyeron datos personales reales.

**Grafo de código:** la instrucción del entorno pide usar primero las
herramientas del grafo (codebase-memory). En esta auditoría se usó
búsqueda de texto (grep) sobre el repositorio completo, suficiente para
su tamaño. Limitación: no se trazaron cadenas de llamadas con el grafo.

---

## 2. Papeles en el manejo de datos

| Actor                                                    | Papel probable                                                                                     | Evidencia / duda                                                                                                                                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cada iglesia**                                         | Decide qué datos recoge y para qué: _responsable_ / "business" / "controller"                      | Sus administradores dan de alta personas, roles y finanzas.                                                                                                                                                                            |
| **Nexo** (el vendedor)                                   | Proveedor que trata datos por cuenta de la iglesia: _encargado_ / "service provider" / "processor" | Opera la infraestructura (proyectos Supabase y Vercel, cuenta de Resend). **[LEGAL?]** Si Nexo usa datos para fines propios (soporte, métricas, mejora) cambia su papel. Hace falta un contrato de tratamiento (DPA) con cada iglesia. |
| Supabase, Vercel, Resend, Google (miniaturas de YouTube) | Subencargados / proveedores de Nexo                                                                | Ver §4.                                                                                                                                                                                                                                |

**Modelo de despliegue (verificado en código y documentos):** un proyecto
Supabase y un despliegue por iglesia (`docs/deployment.md` §2,
`scripts/bootstrap-church.ts`). No hay columna `church_id`: el
aislamiento entre iglesias es de **infraestructura**, no de RLS (ver H-12).

**Tipos de personas:**

| Tipo                                                                                                      | Cuenta de acceso | Cómo entra                                                                                                                  |
| --------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Personal (admin, pastor, maestro, seguimiento, intercesor, finanzas, SuperAdmin, ujier, editor del sitio) | Sí               | Invitación o alta inicial (`bootstrap-church.ts`).                                                                          |
| Miembro con portal                                                                                        | Sí               | Invitación al portal o registro público (`/registro`).                                                                      |
| Miembro o visitante sin cuenta                                                                            | No               | Alta manual, importación o inscripción en línea (`people.source`).                                                          |
| Inscrito en línea                                                                                         | No               | Forma pública `/sitio/inscripcion/...` (solo mayores de 18 por declaración).                                                |
| **Menores**                                                                                               | No por diseño    | Los registra el personal (nombre, fecha de nacimiento). `is_minor()` es informativo. No hay control de edad en `/registro`. |

---

## 3. Inventario de datos

"Quién accede" refleja la RLS verificada. SuperAdmin (`apostol`) tiene
todos los permisos (0036). "Directorio" = administrador, seguimiento,
intercesor, coordinador (0045).

| Datos                                                                                                                                      | De quién                       | Para qué                            | Dónde (tabla / almacenamiento)                                                                   | Quién accede                                                                  | A quién se envía                                                | Conservación                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| Identificación y contacto: nombre, preferido, fecha de nacimiento, género, email, teléfono, dirección, ciudad, estado civil, notas, origen | Miembros, visitantes, menores  | Directorio de la iglesia            | `people`                                                                                         | Directorio; pastor y maestro solo su gente (0045); la propia persona          | Resend (email) cuando se le escribe                             | Indefinida (sin política)                                |
| **Afiliación religiosa** (ser miembro o visitante, fecha de ingreso, ministerios, "¿perseveras en alguna iglesia?")                        | Todas                          | Gestión congregacional              | `people.membership_status`, `ministry_memberships`, `activity_registrations`                     | Igual que arriba                                                              | —                                                               | Indefinida                                               |
| Cuenta de acceso: email, hash de contraseña, último acceso                                                                                 | Personal y miembros con portal | Autenticación                       | `auth.users` (Supabase)                                                                          | Supabase y el servicio interno                                                | Supabase                                                        | **[NV]** configuración de Supabase                       |
| Roles y permisos                                                                                                                           | Personal                       | Autorización                        | `user_roles`, `audit_log`                                                                        | Administrador (no puede tocar roles financieros); SuperAdmin                  | —                                                               | Indefinida                                               |
| Cursos: matrícula, asistencia, progreso                                                                                                    | Alumnos                        | Formación                           | `enrollments`, `attendance_records`, `class_*`                                                   | Directorio; maestro de esa clase (historial de sus alumnos)                   | —                                                               | Indefinida                                               |
| **Asistencia a cultos** (check-in)                                                                                                         | Asistentes                     | Conteo y seguimiento                | `service_checkins`                                                                               | Directorio; registran ujier y SuperAdmin (0044); la propia persona            | —                                                               | Indefinida                                               |
| **Notas pastorales / seguimiento de visitantes**                                                                                           | Visitantes                     | Seguimiento                         | `visitor_follow_ups`, `follow_up_notes`                                                          | Administrador, coordinador, seguimiento, asignado                             | —                                                               | Indefinida                                               |
| **Peticiones de oración** (texto confidencial)                                                                                             | Miembros                       | Intercesión                         | `prayer_requests` + `prayer_request_access_log`                                                  | Intercesor, administrador, líder de intercesión, autor; lectura auditada      | Emails sin el texto (regla §3.12; no hay emails de oración hoy) | Indefinida                                               |
| **Donaciones**, cartas y petición del sobre                                                                                                | Donantes                       | Finanzas y cartas de donativos      | `donations`, `donation_letters`, `donation_prayer_notes`, revisiones                             | Solo SuperAdmin y Finanzas (verificado); historial inmutable                  | PDF de cartas (descarga)                                        | Indefinida; las donaciones no se pueden borrar (trigger) |
| **Datos de salud** (condición médica y detalle), contacto de emergencia, edad, dirección, iglesia                                          | Inscritos en actividades       | Logística de la actividad           | `activity_registrations`                                                                         | Quien gestiona actividades (administrador, coordinador, líder del ministerio) | No van en los emails (verificado en `registration-emails.ts`)   | **Indefinida**: H-04                                     |
| **Antecedentes penales / Ley 300** (documentos)                                                                                            | Servidores y ministros         | Requisito para trabajar con menores | `person_certifications` + bucket **privado** `certificaciones`                                   | Solo SuperAdmin y Finanzas; aperturas auditadas                               | —                                                               | Indefinida                                               |
| Fotos y videos públicos, equipo pastoral                                                                                                   | Personas en eventos            | Sitio web público                   | Bucket **público** `sitio`, `site_*`                                                             | Público                                                                       | Google (miniaturas `i.ytimg.com`)                               | Hasta que se borren                                      |
| Encuestas y respuestas                                                                                                                     | Miembros                       | Encuestas internas                  | `survey_*`                                                                                       | Directorio, autor de la encuesta (0047), la propia persona                    | —                                                               | Indefinida                                               |
| Bitácora de emails (destinatario, email, asunto)                                                                                           | Destinatarios                  | Trazabilidad                        | `notification_log`                                                                               | Directorio, destinatario, quien envió (0047)                                  | —                                                               | Indefinida                                               |
| Importaciones (fila cruda completa)                                                                                                        | Personas importadas            | Revisión antes de crear personas    | `import_rows.raw_data`                                                                           | Administrador, coordinador, seguimiento                                       | —                                                               | **Indefinida** después de promover: H-04                 |
| Bitácoras de auditoría                                                                                                                     | Personal y personas afectadas  | Rendición de cuentas                | `audit_log`, `finance_audit_log`, `prayer_request_access_log`, `donation_prayer_note_access_log` | Administrador; las financieras solo SuperAdmin                                | —                                                               | Indefinida                                               |
| **IP y registros técnicos**                                                                                                                | Todos                          | Operación                           | **No hay columnas de IP en tablas propias** (verificado)                                         | —                                                                             | Vercel (logs de peticiones), Supabase (logs de Auth y API)      | **[NV]** retención de cada proveedor                     |

---

## 4. Proveedores e IA

| Proveedor                                 | Uso (verificado en código o configuración)                                                          | Datos que recibe                                                                      | Estado                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Supabase**                              | Base de datos, Auth y Storage (`@supabase/ssr`, `@supabase/supabase-js`)                            | **Todo** el inventario                                                                | Activo. Producción en us-west-1 según `docs/progress.md`. **[NV]** DPA, backups, cifrado en reposo, región real. |
| **Vercel**                                | Alojamiento, despliegue y cron diario (`vercel.json`)                                               | Tráfico y logs de peticiones (IP, ruta, user agent)                                   | Activo. **[NV]** retención de logs, DPA.                                                                         |
| **Resend**                                | Email transaccional (`src/lib/email/send.ts`)                                                       | Destinatario, asunto, cuerpo (confirmaciones, recordatorios, emails del personal)     | Activo si hay `RESEND_API_KEY`. **[NV]** retención de cuerpos en Resend, DPA.                                    |
| **Google / YouTube**                      | Miniaturas desde `i.ytimg.com` al ver el sitio; video por `youtube-nocookie.com` solo al hacer clic | IP y user agent del visitante                                                         | Activo en el sitio público.                                                                                      |
| Google Fonts                              | `next/font/google`                                                                                  | Ninguno en tiempo real: las fuentes se descargan al compilar y se sirven desde la app | Verificado (no hay peticiones a `fonts.googleapis` en el código).                                                |
| Analítica, monitoreo, pagos, SMS, CAPTCHA | **No hay** (sin dependencias ni llamadas)                                                           | —                                                                                     | Verificado en `package.json` y el código.                                                                        |

**IA:**

- **En el producto:** no hay (sin SDK ni llamadas a proveedores de IA;
  verificado).
- **Para desarrollar:** se usa Claude Code (Anthropic). Tuvo acceso al
  repositorio, al proyecto Supabase de desarrollo (datos sintéticos) y a
  capturas de pantalla que compartió el dueño. No se conectó a la base de
  producción; las migraciones de producción las ejecutó el dueño.
  **[LEGAL?]** Revisar si las capturas con datos reales compartidas con
  la IA de desarrollo necesitan cobertura contractual o un aviso.

---

## 5. Marco legal consultado

Consultado el 2026-10-01. No se inventaron multas: solo se citan cifras
que aparecen en la fuente.

| Norma                                                                                        | Fuente oficial                                                                                                                                                                                                                      | Condiciones de aplicación (según la fuente)                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Relevancia para Nexo / dudas                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **PR Ley 39-2012**, "Ley de Notificación de Política de Privacidad"                          | [OGP, rev. 9-jun-2020](https://bvirtualogp.pr.gov/ogp/Bvirtual/leyesreferencia/PDF/39-2012.pdf)                                                                                                                                     | "Operadores de páginas" y "personas que recopilan información personal" con actividades dirigidas "principalmente hacia la obtención de un beneficio mercantil". Deben notificar una política con: tipos de información, con quién se comparte, proceso para revisar o pedir cambios (si existe) y cómo se notifican los cambios. Art. 7: multa de hasta $50,000 por divulgar una política que "no corresponda a la realidad".                                                                         | **[LEGAL?]** Nexo (con fin de lucro) probablemente encaja; ¿una iglesia sin fines de lucro también? Igual, la política no puede prometer lo que el sistema no hace (por eso H-02 propone un borrador basado en hechos). ¿Hay reglamento de DACO vigente con modelos? (no verificado).                                                                                                                                                                        |
| **PR Ley 111-2005** (enm. Ley 97-2008), seguridad de bancos de información                   | [OGP, rev. 26-feb-2021](https://bvirtualogp.pr.gov/ogp/Bvirtual/leyesreferencia/PDF/111-2005.pdf)                                                                                                                                   | Toda entidad (incluye organizaciones privadas autorizadas en PR) dueña o custodia de bancos con "archivo de información personal" (nombre + SSN, licencia, cuentas, **usuario y contraseña**, **información médica protegida por HIPAA**, información contributiva, evaluaciones laborales), no protegido con claves criptográficas, debe notificar a los afectados y **al DACO dentro de 10 días** de detectar la violación. Quien "provea acceso" a bancos debe notificar al propietario o custodio. | **[LEY]** Probablemente aplica a las iglesias (usuarios y contraseñas; las contraseñas las guarda Supabase con hash, **[LEGAL?]** si eso cuenta como "protegido"). Nexo, como proveedor, debe notificar a la iglesia: hay que ponerlo en el contrato y en un plan de incidentes (H-16). **[LEGAL?]** ¿Los datos médicos de inscripciones son "información médica protegida por HIPAA"? Probablemente no, porque la iglesia no es entidad cubierta por HIPAA. |
| **COPPA** (16 CFR 312), enmienda publicada 22-abr-2025                                       | [FTC FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions), [Federal Register](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule) | Operadores **comerciales** de sitios dirigidos a menores de 13, o con **conocimiento real** de que recogen datos **de** menores de 13. "COPPA only applies to personal information collected online _from_ children". No aplica a entidades sin fines de lucro (con excepciones). Enmienda: vigente 23-jun-2025, cumplimiento 22-abr-2026; exige retención limitada.                                                                                                                                   | **No se presupone.** Nexo no está dirigido a niños y los datos de menores los registra el personal, no el niño. Riesgo residual: `/registro` no pregunta la edad (H-11). **[LEGAL?]** ¿Nexo es "operador" comercial aunque el cliente sea una iglesia sin fines de lucro?                                                                                                                                                                                    |
| **CCPA/CPRA** (California)                                                                   | [Oficina del Procurador de California, act. 28-ago-2026](https://oag.ca.gov/privacy/ccpa)                                                                                                                                           | Solo entidades **con fin de lucro** con ingresos brutos de más de $25M (la fuente da esa cifra; el umbral se ajusta por inflación), o que compran, venden o comparten datos de 100,000+ residentes, o con 50%+ de ingresos por venta de datos. "Generally does not apply to nonprofit organizations".                                                                                                                                                                                                  | **No aplica automáticamente.** Las iglesias sin fines de lucro quedan fuera; Nexo probablemente no alcanza los umbrales hoy. Si un cliente sí está cubierto, Nexo sería "service provider" y necesita contrato.                                                                                                                                                                                                                                              |
| **Colorado Privacy Act** (ejemplo de ley estatal que alcanza a entidades sin fines de lucro) | [Procurador de Colorado](https://coag.gov/resources/colorado-privacy-act/) (búsqueda del 2026-10-01; la página no se pudo leer completa)                                                                                            | Incluye entidades sin fines de lucro que hacen negocios en Colorado y procesan datos de más de 100,000 personas al año (u otros umbrales). Los datos que revelan **creencias religiosas** o **condiciones de salud** son "sensitive data" y requieren **consentimiento**.                                                                                                                                                                                                                              | **[LEGAL?]** Una iglesia típica no llega al umbral. Pero hay que mapear estado por estado dónde se venderá Nexo: varios estados tienen leyes de privacidad que incluyen entidades sin fines de lucro y tratan la religión como dato sensible. Pendiente de inventario legal por estado.                                                                                                                                                                      |
| **CAN-SPAM**                                                                                 | [Guía de la FTC, ed. ene-2024](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)                                                                                                              | Emails **comerciales** ("commercial advertisement or promotion of a commercial product or service"). Los transaccionales o de relación están "largely exempt". Baja en 10 días hábiles. Hasta $53,088 por email según la fuente.                                                                                                                                                                                                                                                                       | Hoy Nexo solo envía emails transaccionales (inscripciones) y mensajes individuales del personal. **No hay campañas** ni listas. **[LEGAL?]** ¿Los mensajes de una iglesia a su congregación son "comerciales"? Si se añade email masivo o promocional, implementar bajas.                                                                                                                                                                                    |
| TCPA / SMS                                                                                   | —                                                                                                                                                                                                                                   | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **No hay SMS** en el producto (verificado). No evaluado.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Leyes estatales de notificación de brechas (los 50 estados)                                  | No consultadas una por una                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **[LEGAL?]** Mapear según los estados de los clientes.                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## 6. Hallazgos

Severidad: Crítica / Alta / Media / Baja / Info.

| ID       | Sev.    | Área | Evidencia (archivo / ruta)                                                                                                             | Comportamiento observado                                                                                                                                                                                                                                         | Riesgo                                                                                                                                                                           | Corrección                                                                                                                                                                                                                                                                                        | Estado                                                                           | Tipo           |
| -------- | ------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------- |
| **H-01** | Crítica | E    | `package.json`: `next 16.3.1`; `npm audit`                                                                                             | Advisories críticos de Next.js: GHSA-2xp9-vwfh-vxw4 (RCE en optimización de imágenes AVIF), GHSA-vcvr-r3jv-pc5j (RCE en `next/og`), GHSA-p293-qw3h-jr36 (RCE en Windows). Además `fast-uri` y `sharp` (altas) y `brace-expansion` (solo desarrollo).             | Ejecución remota de código según el advisory y la configuración de despliegue. **[NV]** si es explotable en Vercel con esta app.                                                 | `next` y `eslint-config-next` 16.3.8 (versión menor, sin cambios incompatibles); `npm audit fix`. `npm audit`: 0 vulnerabilidades.                                                                                                                                                                | **Corregido** (sin desplegar)                                                    | [BP]           |
| **H-02** | Alta    | B    | No existe página ni texto de privacidad o términos (búsqueda en `src/`)                                                                | Ninguna política ni aviso de privacidad en la app ni en el sitio público.                                                                                                                                                                                        | Posible incumplimiento de PR Ley 39-2012 si aplica; falta de transparencia.                                                                                                      | Borrador basado en hechos en §9 (con incógnitas marcadas). No se publica en esta auditoría.                                                                                                                                                                                                       | **Pendiente**: decisión y revisión legal                                         | [LEY] [LEGAL?] |
| **H-03** | Alta    | E    | `next.config.ts` vacío                                                                                                                 | Sin CSP, `X-Frame-Options`, HSTS, `nosniff`, `Referrer-Policy` ni `Permissions-Policy`.                                                                                                                                                                          | Clickjacking (incrustar la app en otro sitio), filtración de URLs con IDs por Referer, MIME sniffing.                                                                            | Cabeceras en `next.config.ts`: `frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'`, HSTS 2 años, `nosniff`, `strict-origin-when-cross-origin`, cámara solo propia (check-in QR). **No** se restringen scripts: una CSP completa requiere nonces y más pruebas.                    | **Corregido** (sin desplegar)                                                    | [BP]           |
| **H-04** | Alta    | A/D  | No hay ninguna rutina de retención o purga (búsqueda en migraciones y código)                                                          | Se conservan indefinidamente: datos médicos y contacto de emergencia de inscripciones después del evento, filas crudas de importación (`import_rows.raw_data`) después de promoverlas, documentos de antecedentes penales, bitácoras de emails y auditoría.      | Más datos sensibles expuestos ante una brecha; contrario a minimización. La enmienda de COPPA exige retención limitada si aplicara.                                              | Propuesta: (1) borrar `medical_details` y el contacto de emergencia N días después de terminar la actividad; (2) vaciar `raw_data` al cerrar un lote de importación; (3) plazos para certificaciones vencidas y bitácoras. **Los plazos son decisión de negocio y legal.**                        | **Pendiente**                                                                    | [BP] [LEGAL?]  |
| **H-05** | Media   | E    | `0010_notifications_surveys.sql`: `notification_log_select_staff`, `survey_responses_select`, `survey_answers_select` con `is_staff()` | Cualquier maestro o pastor podía leer a quién se le envió cada email (email y asunto) y **todas** las respuestas de encuestas de cualquier miembro; también editar o borrar la bitácora de emails.                                                               | Exposición de datos fuera de la necesidad del rol (contradice 0045).                                                                                                             | `0047_audit_logs_surveys_scope.sql`: lectura solo para el directorio, el destinatario o quien envió; respuestas solo para el directorio, la propia persona y el autor de la encuesta; editar la bitácora solo quien envió; borrar solo el administrador.                                          | **Corregido** (dev; prod pendiente)                                              | [BP]           |
| **H-06** | Media   | E    | `src/app/(app)/personas/actions.ts` (`sendPersonEmailAction`)                                                                          | El texto libre del personal se insertaba en el HTML del email sin escapar.                                                                                                                                                                                       | Inyección de HTML (enlaces o formularios engañosos) en emails que salen con el remitente de la iglesia.                                                                          | Escapado con `para()` (nuevo `src/lib/email/escape.ts`, compartido con los emails de inscripción).                                                                                                                                                                                                | **Corregido**                                                                    | [BP]           |
| **H-07** | Baja    | E    | `src/app/api/cron/recordatorios-inscripciones/route.ts`                                                                                | `CRON_SECRET` se comparaba con `!==`.                                                                                                                                                                                                                            | Ataque de tiempo, teórico.                                                                                                                                                       | `timingSafeEqual` sobre hashes SHA-256.                                                                                                                                                                                                                                                           | **Corregido**                                                                    | [BP]           |
| **H-08** | Media   | B/F  | `src/app/(sitio)/sitio/inscripcion/[slug]/registration-form.tsx`                                                                       | La forma pública recoge **salud**, contacto de emergencia, edad, dirección y afiliación a una iglesia, y **crea un registro en el directorio**, sin decirlo.                                                                                                     | Falta de transparencia en el punto de recogida; datos sensibles (salud y religión) sin aviso.                                                                                    | Aviso breve y verificado contra el sistema: quién lo recibe, que se crea el registro de visitante, quién ve los datos médicos (gestores de actividades, según la RLS), que no van en los emails, qué emails llegan y que se puede pedir corrección o borrado a la iglesia. **No** promete plazos. | **Corregido** (texto); **[LEGAL?]** consentimiento explícito para datos de salud | [BP] [LEGAL?]  |
| **H-09** | Media   | D    | `src/app/(app)/portal/actions.ts` (solo `updateOwnContactAction`, `submitPrayerRequestAction`)                                         | El miembro ve parte de sus datos en Mi portal y corrige su contacto, pero **no puede descargar** sus datos. Personas sin cuenta: solo por solicitud a la iglesia (no hay flujo).                                                                                 | Responder pedidos de acceso o portabilidad es manual y propenso a errores.                                                                                                       | Propuesta: "Descargar mis datos" (JSON o PDF) en Mi portal y una exportación por persona para el administrador.                                                                                                                                                                                   | **Pendiente**                                                                    | [BP] [LEGAL?]  |
| **H-10** | Media   | D    | `0046_delete_person.sql`                                                                                                               | Solo se puede borrar a una persona **sin nada ligado** (y su cuenta). No hay: anonimización de una persona con historial, borrado de solo la cuenta, ni proceso para **dar de baja una iglesia** completa (proyecto Supabase, Storage, Vercel, Resend, backups). | No se puede atender bien un pedido de eliminación con historial ni la salida de un cliente.                                                                                      | Ver §7 (matriz) y propuestas. La anonimización (conservar donaciones por ley contable, quitar identificadores) es decisión de negocio y legal.                                                                                                                                                    | **Pendiente**                                                                    | [BP] [LEGAL?]  |
| **H-11** | Media   | E/F  | `src/app/(auth)/registro`, `src/app/(auth)/actions.ts` (`signUp`); `handle_new_auth_user()` (0027)                                     | Cualquiera puede crear una cuenta: se crea un registro en `people` y el rol `miembro`. No hay CAPTCHA, límite de frecuencia propio ni pregunta de edad.                                                                                                          | Cuentas basura o spam en el directorio; posible "conocimiento real" de menores de 13 si se registran.                                                                            | CAPTCHA Turnstile en login, registro, recuperar e inscripción pública (2026-10-01, §8.n de security.md); `0048` cierra la llamada anónima directa a la inscripción. Pendiente: pregunta de edad y decidir si el registro sigue abierto. **[NV]** activar el CAPTCHA en Supabase Auth (panel).     | **Parcial**: CAPTCHA hecho (sin desplegar)                                       | [BP] [LEGAL?]  |
| **H-12** | Info    | E    | `docs/deployment.md` §2; sin `church_id` en el esquema                                                                                 | Aislamiento por **proyecto separado** por iglesia. El código no tiene rutas que crucen proyectos: cada despliegue lee su propio `NEXT_PUBLIC_SUPABASE_URL` y sus claves.                                                                                         | Si en el futuro se comparte una base entre iglesias, **no existe** aislamiento a nivel de filas. Hoy comparten cuentas de proveedor (Vercel, Resend): sus logs mezclan iglesias. | Mantener un proyecto por iglesia (documentado), o diseñar `church_id` + RLS antes de compartir. Una API key y un dominio de Resend por iglesia. Prueba con dos proyectos de desarrollo: ver §8.                                                                                                   | **Verificado por diseño**; prueba entre proyectos **[NV]**                       | [BP]           |
| **H-13** | Media   | E    | —                                                                                                                                      | No hay MFA en la app; las cuentas de SuperAdmin, Finanzas y administración solo tienen contraseña.                                                                                                                                                               | Toma de una cuenta con acceso a donaciones, antecedentes penales y peticiones.                                                                                                   | Activar MFA (TOTP) de Supabase y exigirlo a SuperAdmin, Finanzas y administrador.                                                                                                                                                                                                                 | **Pendiente**                                                                    | [BP]           |
| **H-14** | Alta    | C    | —                                                                                                                                      | No hay evidencia de contratos (DPA) con Supabase, Vercel ni Resend, ni de contratos de Nexo con las iglesias.                                                                                                                                                    | Obligaciones de proveedor sin cubrir (Ley 111-2005: notificar al propietario).                                                                                                   | Firmar o aceptar los DPA de cada proveedor y redactar un contrato de tratamiento Nexo–iglesia.                                                                                                                                                                                                    | **[NV]** / Pendiente                                                             | [LEY] [LEGAL?] |
| **H-15** | Media   | D    | —                                                                                                                                      | Copias de seguridad de Supabase según el plan: no se puede verificar frecuencia, retención ni cifrado. Los datos borrados siguen en las copias hasta que expiran.                                                                                                | Promesas de "borrado inmediato" serían falsas.                                                                                                                                   | Documentar el plazo real de las copias en la política (borrador §9 con [PENDIENTE]).                                                                                                                                                                                                              | **[NV]**                                                                         | [BP]           |
| **H-16** | Alta    | E    | —                                                                                                                                      | No existe plan de respuesta a incidentes (quién detecta, quién decide, plazos, plantillas).                                                                                                                                                                      | Ley 111-2005: aviso al DACO en 10 días si aplica; leyes estatales de brechas.                                                                                                    | Redactar un runbook: contención, rotación de claves (service_role, Resend, CRON_SECRET, QR), evaluación, aviso a la iglesia, al DACO y a los afectados.                                                                                                                                           | **Pendiente**                                                                    | [LEY] [LEGAL?] |
| **H-17** | Baja    | D/E  | Supabase Auth                                                                                                                          | Al borrar una cuenta, un token de acceso ya emitido puede seguir siendo válido hasta que expira. La RLS ya no le da roles porque el perfil y los roles se borran.                                                                                                | Ventana corta de acceso a datos propios (sin roles).                                                                                                                             | Aceptable; documentar. **[NV]** duración del token en la configuración.                                                                                                                                                                                                                           | Documentado                                                                      | [BP]           |
| **H-18** | Media   | F    | Bucket público `sitio`, `site_albums`, `site_team`                                                                                     | Las fotos públicas pueden incluir menores; no hay campo de consentimiento o permiso de imagen.                                                                                                                                                                   | Publicación de imágenes de menores sin constancia de permiso.                                                                                                                    | Política interna de permiso de imagen y, si se decide, un campo "tiene permiso de imagen" en el editor del sitio.                                                                                                                                                                                 | **Pendiente**                                                                    | [BP] [LEGAL?]  |
| **H-19** | Info    | C    | `src/components/sitio/video-card.tsx`, `site-home.tsx`                                                                                 | El video usa `youtube-nocookie` y solo carga al hacer clic (bien), pero las **miniaturas** se piden a `i.ytimg.com` al abrir la página.                                                                                                                          | La IP del visitante llega a Google sin interacción.                                                                                                                              | Opcional: copiar las miniaturas al bucket propio. Mencionarlo en la política.                                                                                                                                                                                                                     | Documentado                                                                      | [BP]           |
| **H-20** | Info    | E    | `supabase/` (no hay `config.toml`)                                                                                                     | La política de contraseñas, la confirmación de email, los límites de frecuencia y la duración de sesiones se configuran en el panel de Supabase.                                                                                                                 | —                                                                                                                                                                                | Revisar en el panel: largo mínimo de contraseña, protección contra contraseñas filtradas, confirmación de email, límites.                                                                                                                                                                         | **[NV]**                                                                         | [BP]           |

**Verificado sin hallazgo:**

- **RLS:** las 51 tablas tienen RLS activado.
- **Funciones públicas:** solo `public_service_schedule`,
  `public_registration_activity` y `submit_activity_registration` están
  disponibles para usuarios anónimos.
- **Clave de servicio:** la `service_role` solo se usa en servidor
  (`server-only`). El paquete del navegador solo contiene la clave
  `anon` (roles de los JWT decodificados).
- **Secretos:** no hay secretos en el historial de git (búsqueda de
  patrones) y `.env*` está en `.gitignore`.
- **Logs del servidor:** registran solo mensajes de error, sin datos
  personales.
- **Datos protegidos:** las donaciones solo son visibles para SuperAdmin
  y Finanzas. Las peticiones de oración tienen acceso restringido y
  auditado. Los documentos de antecedentes están en un bucket privado,
  se abren con una URL firmada de 60 s y la apertura queda auditada.
  Las exportaciones CSV y PDF de finanzas responden 404 sin acceso.
- **Emails:** no llevan datos médicos ni el texto de las peticiones de
  oración.
- **Pastor y maestro:** solo ven a las personas a su cargo (0045, 8
  pruebas).

---

## 7. Derechos y eliminación: lo que el sistema hace hoy

| Acción                                                  | ¿Existe?                                                           | Quién la hace               | Qué borra                                                                              | Excepciones o límites                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ver mis datos                                           | Parcial (Mi portal: contacto, cursos, ministerios, QR, peticiones) | La persona con cuenta       | —                                                                                      | Sin descarga (H-09). Personas sin cuenta: por solicitud a la iglesia.                                                                                      |
| Corregir mis datos                                      | Contacto en Mi portal; el resto lo corrige el personal             | La persona o el personal    | —                                                                                      | El origen (`people.source`) no se edita (inmutable).                                                                                                       |
| Borrar **solo la cuenta** (login) y dejar el registro   | **No**                                                             | —                           | —                                                                                      | Pendiente (H-10).                                                                                                                                          |
| Borrar un **registro de persona** sin nada ligado       | Sí (0046)                                                          | Solo SuperAdmin, con motivo | Persona, cuenta, perfil, roles, invitaciones; desliga bitácoras de email e importación | No borra copias de seguridad hasta que expiren (H-15) ni copias en Resend o Vercel. Prohibido si la cuenta tiene SuperAdmin o Finanzas, o si es la propia. |
| Borrar o **anonimizar** a una persona **con historial** | **No**                                                             | —                           | —                                                                                      | Las donaciones y cartas no se borran (historial financiero). Requiere decisión (H-10).                                                                     |
| Dar de baja a una **iglesia** completa                  | **No** (proceso manual no documentado)                             | Nexo                        | Proyecto Supabase completo, Storage, despliegue, dominio y claves de Resend            | Copias de los proveedores según su retención.                                                                                                              |
| Verificar la identidad de quien pide                    | No hay flujo                                                       | —                           | —                                                                                      | Propuesta: solo desde la cuenta con sesión, o validación por la iglesia.                                                                                   |

---

## 8. Pruebas y evidencia

| Prueba                                                                                                                                                         | Resultado              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `tests/db/audit-scope.test.ts` (nueva, 3): un maestro no lee ni borra emails ajenos; el autor de la encuesta y el directorio sí leen respuestas; otro staff no | 3/3                    |
| `tests/unit/email-escape.test.ts` (nueva): no se puede inyectar `<a>` ni comillas                                                                              | 1/1                    |
| Suite completa `npm run test:db` (incluye alcance de pastor y maestro, borrado de personas, certificaciones, finanzas, inscripciones)                          | **80/80**              |
| `npm run test:unit`                                                                                                                                            | **16/16**              |
| `npm run test:e2e` (Playwright)                                                                                                                                | **34/34**              |
| `npm run check` (lint, typecheck, formato) y `npm run build`                                                                                                   | Limpio                 |
| `npm audit` (producción y desarrollo)                                                                                                                          | **0 vulnerabilidades** |
| Cabeceras en `curl -D - localhost:3000/login`                                                                                                                  | Las 6 presentes        |
| Navegador local: login (envío de formulario con `form-action 'self'`), Asistencia, forma pública con el aviso (escritorio y 375 px)                            | Funcionan              |
| Migración `0047` aplicada en el proyecto de **desarrollo**                                                                                                     | OK                     |

**Aislamiento entre iglesias (no ejecutado):** probar que un token de una
iglesia no sirve en otra requiere dos proyectos. Solo hay uno de
desarrollo, y producción quedó fuera del alcance. Procedimiento
propuesto: crear dos proyectos de desarrollo A y B; con la sesión de un
usuario de A, llamar a la API REST de B. Se espera 401, porque la firma
JWT es distinta en cada proyecto.

**Ciclos realizados:** 2 de 3. Ciclo 1: correcciones H-01, H-03, H-05,
H-06, H-07 y H-08. Ciclo 2: reverificación completa, en la que se
encontró y corrigió que `npm audit fix --omit=dev` había quitado las
herramientas de desarrollo de `node_modules` (reinstaladas, sin cambio
en `package.json`). No hizo falta un tercer ciclo.

---

## 9. Borradores (no publicados)

### 9.a Aviso en la forma de inscripción (ya en el código, H-08)

> **Sobre tus datos:** los recibe la iglesia para organizar esta actividad
> y comunicarse contigo. Si todavía no estás en su directorio, se crea tu
> registro como visitante. La información médica y el contacto de
> emergencia solo los ven quienes organizan o administran las actividades
> de la iglesia, y no se incluyen en los emails. Recibirás por email la
> confirmación y recordatorios de esta actividad. Para consultar, corregir
> o pedir que se borren tus datos, escribe a la iglesia.

### 9.b Política de privacidad: estructura basada en hechos

Cada `[PENDIENTE]` es una incógnita que **no** se debe rellenar sin
verificarla.

1. **Quién es responsable:** [NOMBRE LEGAL DE LA IGLESIA], [DIRECCIÓN],
   [EMAIL DE CONTACTO]. La plataforma la provee Nexo, [ENTIDAD LEGAL DE
   NEXO, PENDIENTE], que trata los datos por cuenta de la iglesia.
2. **Qué datos:** los de §3 (identificación y contacto; participación en
   la iglesia, ministerios, cursos y asistencia; peticiones de oración;
   donaciones; datos de salud y contacto de emergencia solo en
   inscripciones a actividades; documentos de antecedentes de quienes
   sirven; fotos del sitio público; registros técnicos de los
   proveedores).
3. **Para qué:** administrar la vida de la congregación, actividades,
   formación, intercesión, finanzas y cartas de donativos, y cumplir los
   requisitos para trabajar con menores. **No** se venden datos. **No** se
   usa IA con los datos (verificado hoy; mantener solo si sigue siendo
   cierto).
4. **Quién accede:** personal de la iglesia según su función (pastores y
   maestros solo a las personas a su cargo; donaciones y antecedentes
   solo apóstoles y finanzas; peticiones de oración solo intercesión).
5. **Con quién se comparte:** Supabase (base de datos y archivos),
   Vercel (alojamiento), Resend (email), Google o YouTube (miniaturas y
   videos del sitio público). [PENDIENTE: ubicación de servidores y
   contratos].
6. **Cuánto tiempo:** [PENDIENTE: plazos por categoría, H-04]. Las
   copias de seguridad se conservan [PENDIENTE: plazo real de Supabase].
7. **Tus derechos y cómo pedirlos:** consultar y corregir (Mi portal o
   escribiendo a la iglesia); borrar: se borra el registro si no tiene
   historial; con historial, [PENDIENTE: política de anonimización]; las
   donaciones se conservan por [PENDIENTE: obligación contable o fiscal].
8. **Menores:** el personal puede registrar a menores para la vida de la
   iglesia; las inscripciones en línea son solo para mayores de 18;
   [PENDIENTE: permiso de imagen].
9. **Seguridad:** acceso por roles en la base de datos, documentos
   sensibles en almacenamiento privado, accesos auditados, conexiones
   cifradas. **No** prometer "cifrado de extremo a extremo" ni "borrado
   inmediato de toda copia".
10. **Cambios a esta política:** se publicará la nueva versión con su
    fecha de vigencia [PENDIENTE: canal, p. ej. email o aviso en la app]
    (requisito expreso de la Ley 39-2012 si aplica).

---

## 10. Preguntas para revisión legal

1. ¿Nexo (con fines de lucro) es "operador de páginas" bajo la **Ley
   39-2012** aunque el contenido y los datos sean de cada iglesia? ¿Una
   iglesia sin fines de lucro también lo es? ¿Hay reglamento o modelos de
   DACO vigentes?
2. **Ley 111-2005:** ¿las contraseñas con hash de Supabase cuentan como
   "protegidas con claves criptográficas"? ¿Los datos médicos de
   inscripciones (no HIPAA) entran en el "archivo de información
   personal"? ¿Quién notifica al DACO, Nexo o la iglesia?
3. ¿Qué cláusulas mínimas debe tener el contrato Nexo–iglesia (DPA):
   subencargados, aviso de brechas a la iglesia, plazo, devolución y
   borrado al terminar?
4. **COPPA:** dado que Nexo es comercial y el cliente es sin fines de
   lucro, ¿quién es el "operador"? ¿Hace falta preguntar la edad en
   `/registro`?
5. Lista de **estados** donde se venderá Nexo y, en cada uno, si su ley
   de privacidad alcanza a entidades sin fines de lucro y trata la
   religión o la salud como dato sensible (como Colorado) y exige
   consentimiento.
6. ¿El contacto de emergencia y los datos médicos de inscripciones
   requieren **consentimiento explícito** (casilla separada) además del
   aviso?
7. ¿Qué plazo de conservación legal aplica a **donaciones y cartas**
   (fiscal y contable, PR e IRS) y a los documentos de **antecedentes
   penales / Ley 300**?
8. ¿Los mensajes de la iglesia a su congregación pueden considerarse
   "comerciales" bajo **CAN-SPAM** (por ejemplo, la venta de entradas a
   un retiro)?
9. **Permiso de imagen** de menores en el sitio público: ¿qué constancia
   debe guardar la iglesia?
10. ¿Compartir con una IA de desarrollo capturas con datos reales
    requiere aviso o cláusula?

---

## 11. Cambios de esta auditoría (sin desplegar)

- `package.json` / `package-lock.json`: next y eslint-config-next 16.3.8;
  dependencias transitivas corregidas.
- `next.config.ts`: cabeceras de seguridad.
- `supabase/migrations/0047_audit_logs_surveys_scope.sql`: aplicada en
  desarrollo; **pendiente en producción**.
- `src/lib/email/escape.ts` (nuevo), `src/lib/email/registration-emails.ts`,
  `src/app/(app)/personas/actions.ts`: escapado.
- `src/app/api/cron/recordatorios-inscripciones/route.ts`: comparación en
  tiempo constante.
- `src/app/(sitio)/sitio/inscripcion/[slug]/registration-form.tsx`:
  aviso de datos.
- Pruebas: `tests/db/audit-scope.test.ts`, `tests/unit/email-escape.test.ts`.
