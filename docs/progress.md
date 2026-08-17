# Progreso del proyecto

Última actualización: 2026-08-16.

## Estado general: MVP verificado de punta a punta ✅

El bloqueo de entorno original (sin Docker/Supabase CLI) se resolvió:
el usuario proveyó credenciales de un proyecto Supabase Cloud de
**desarrollo** (`jlmabwnbtwjrtqaxfafx`). Con eso, en esta sesión se:

1. Aplicaron las 16 migraciones contra la base real (`supabase db push`
   vía el connection pooler — el host directo solo tiene IPv6 y no es
   alcanzable desde este entorno de agente, ver `docs/decisions.md`).
2. Encontraron y corrigieron **2 bugs reales de SQL** que solo se
   manifiestan contra Postgres real (no detectables por
   lint/typecheck): `is_minor` como columna generada con `current_date`
   (no inmutable) y un error de orden de dependencias en la política
   RLS `people_select_self` (referenciaba `profiles` antes de que
   existiera). Ver `docs/decisions.md` para el detalle.
3. Corrió `npm run seed` exitosamente: 7 cuentas de prueba (una por
   rol), 40 personas sintéticas, 3 clases con matrícula/asistencia, 1
   servicio con 15 check-ins, 4 seguimientos de visitantes, 4
   peticiones de oración.
4. Se verificó **manualmente en navegador, con sesión real**, cada uno
   de los 14 módulos funcionales — ver la lista de pruebas realizadas
   abajo. Todo funcionó sin errores de consola.

**Lo que queda pendiente** ya no es "¿funciona?" sino pulido y
alcance adicional — ver "Fase 16" abajo.

## Verificación end-to-end realizada (con datos reales, rol por rol)

Como **administrador** (`admin@iglesia.test`):
- Login real, dashboard con conteos reales (47 personas, 4 visitantes en
  seguimiento, 3 clases activas, 4 peticiones abiertas).
- Directorio de personas: listado, búsqueda, detalle/edición.
- Cursos y clases: detalle de "Discipulado I", matrícula con % de
  asistencia calculado correctamente (75%, 100%, 50%...), panel de
  sesiones y asistencia.
- Peticiones de oración: bandeja sin mostrar contenido en la lista,
  detalle con contenido + aviso de auditoría.
- Portal del miembro: código QR generado correctamente (qrcode.react +
  token firmado), formulario de contacto precargado.
- Administración de usuarios: los 7 roles sembrados se muestran
  correctamente; **se otorgó y luego revocó un rol de prueba** —
  confirmado que la escritura contra `user_roles` (RLS + auditoría) y
  la función RPC `list_users_with_roles()` funcionan.
- Reportes: las 5 tarjetas de agregados muestran datos reales
  correctos.
- Check-in: check-in manual registrado exitosamente contra un servicio
  real (16 check-ins tras la prueba).
- Visitantes: listado con estatus reales.
- Importar datos: **flujo completo probado** — captura manual → fila en
  staging → "Aprobar como nuevo" → `promote_import_row()` (RPC) →
  persona nueva visible en el directorio.
- Encuestas: creación de encuesta con pregunta de texto libre → vista de
  resultados (staff) mostrando la pregunta con "sin respuestas".

Como **miembro** (`miembro@iglesia.test`) — **pruebas negativas de
seguridad**:
- Nav lateral correctamente oculta Personas/Check-in/Visitantes/
  Oración/Importar/Reportes/Administración (solo muestra Panel, Cursos
  y clases, Mi portal, Encuestas).
- Navegación **directa** a `/personas` (bypaseando el nav oculto): RLS
  restringe correctamente a solo su propio registro ("1 personas
  registradas", sin botón de crear) — confirma que
  `people_select_self`/`people_select_staff` funcionan como se
  diseñaron.
- Navegación directa a `/admin` y a `/oracion`: ambas redirigen a
  `/dashboard` (guard de rol en la página).
- Portal del miembro: ve su propio QR y su propia información,
  correctamente aislado.

Sin errores de consola del navegador en ninguna de las pruebas
anteriores.

## Fases (orden de prioridad del producto)

| #   | Fase                               | Estado                                                          |
| --- | ----------------------------------- | ---------------------------------------------------------------- |
| 1   | Base del proyecto y documentación   | ✅ Hecho                                                          |
| 2   | Modelo de datos                     | ✅ 16 migraciones aplicadas y verificadas contra Postgres real   |
| 3   | Autenticación                       | ✅ Verificado end-to-end (login/logout real, multi-rol)          |
| 4   | Roles y permisos                    | ✅ Verificado end-to-end (RLS positivo y negativo, panel admin)  |
| 5   | Directorio central de personas      | ✅ Verificado end-to-end                                         |
| 6   | Cursos y clases                     | ✅ Verificado end-to-end                                         |
| 7   | Matrícula, asistencia y progreso    | ✅ Verificado end-to-end                                         |
| 8   | Importación y deduplicación         | ✅ Verificado end-to-end (solo CSV; Excel/Access ver abajo)      |
| 9   | Visitantes y seguimiento            | ✅ Verificado end-to-end                                         |
| 10  | Portal del miembro                  | ✅ Verificado end-to-end                                         |
| 11  | Check-in QR                         | ✅ Check-in manual verificado; escaneo QR verificado por código  |
| 12  | Peticiones de oración                | ✅ Verificado end-to-end, incluida auditoría de acceso          |
| 13  | Emails y encuestas                  | 🔶 Encuestas verificadas; emails sin probar (falta Resend real)  |
| 14  | Paneles y reportes                  | ✅ Verificado end-to-end                                         |
| 15  | Revisión de seguridad               | ✅ Auditoría de RLS/guards + pruebas negativas reales en vivo    |
| 16  | Preparación para producción         | 🔶 Ver checklist en `docs/deployment.md` §5                      |

## Fase 16 — qué falta para producción

- [ ] Configurar dominio verificado en Resend y probar envío real de
      emails (`RESEND_API_KEY` sigue siendo un placeholder).
- [ ] Parser real de `.xlsx` para importación (hoy solo CSV; Excel/Access
      requieren exportarse a CSV primero).
- [ ] Ampliar la cobertura de Playwright más allá de los smoke tests
      actuales (`tests/e2e/auth.spec.ts`) — ahora que hay un proyecto de
      desarrollo real disponible, se puede escribir la lista completa de
      `docs/testing.md` §3 contra él.
- [ ] Probar el escaneo real de un código QR (ya se probó el check-in
      manual; el escaneo usa la misma función `scanCheckinAction`,
      verificada por revisión de código, pero no por un escaneo real en
      navegador).
- [ ] Crear un proyecto Supabase **separado** para producción (no
      reusar el de desarrollo) y repetir: aplicar migraciones, otorgar
      el primer administrador, checklist de `docs/deployment.md` §5.
- [ ] Generar un `QR_CHECKIN_SECRET` único de producción (el actual es
      solo para desarrollo).
- [ ] **Autorización explícita del usuario antes de publicar** (regla
      dura, no negociable).

## Datos de prueba en el proyecto de desarrollo

Proyecto Supabase: `jlmabwnbtwjrtqaxfafx` (desarrollo). Cuentas de
prueba (contraseña `Iglesia2026!Dev` para todas, ver `scripts/seed.ts`):
`admin@iglesia.test`, `pastor@iglesia.test`, `coordinador@iglesia.test`,
`maestro@iglesia.test`, `seguimiento@iglesia.test`,
`intercesor@iglesia.test`, `miembro@iglesia.test`. Además quedaron dos
registros de la verificación manual de esta sesión ("Prueba Sintética"
en personas, "Encuesta de prueba" en encuestas) — inofensivos y
claramente sintéticos, se pueden borrar sin problema si se quiere un
dataset más limpio.

## Próxima tarea

Con el MVP funcionando de punta a punta, las prioridades son: (a)
credenciales de Resend para probar emails reales, (b) ampliar
Playwright con el proyecto de desarrollo ya disponible, (c) parser de
Excel real para importación, (d) cuando el usuario lo autorice
explícitamente, preparar el proyecto Supabase de producción separado
del de desarrollo.

## Bitácora

### 2026-08-16 — sesión de construcción del MVP completo

Se construyó el MVP completo (14 módulos funcionales) en una sola
sesión continua, siguiendo el orden de prioridad del producto:

1. **Fundación**: Next.js 16 (App Router, TS estricto), Tailwind v4 +
   shadcn/ui, `CLAUDE.md`, 11 documentos en `docs/`, `.env.example`,
   `.gitignore` contra datos personales/secretos.
2. **Modelo de datos**: 16 migraciones SQL con RLS y funciones
   auxiliares (`has_role`, `is_staff`, `is_admin`, `current_person_id`,
   `promote_import_row`, `log_prayer_request_access`, `log_audit_event`,
   `update_own_contact_info`, `list_users_with_roles`, `is_minor`).
   **Nota técnica**: los tipos `Row` en `src/types/database.ts` deben
   ser `type`, no `interface` (ver `CLAUDE.md` §10).
3. **Autenticación**: login, registro, recuperar/restablecer
   contraseña, callback de confirmación.
4. **Roles y permisos**: RBAC completo + panel `/admin` para
   otorgar/revocar roles (auditado).
5. **Directorio de personas**: CRUD con detección de posibles
   duplicados (nunca por nombre) que exige confirmación humana.
6–7. **Cursos, clases, matrícula, asistencia**: categorías
   configurables, clases/cohortes, sesiones, matrícula, toma de
   asistencia, % de progreso.
8. **Importación**: CSV → staging → revisión humana → promoción
   (aprobar nuevo / fusionar / rechazar), sin fusión automática, sin
   notificaciones automáticas. Captura manual reutiliza el mismo
   pipeline.
9. **Visitantes y seguimiento**: seguimiento con bitácora de contactos.
10. **Portal del miembro**: contacto propio (vía RPC restringida a
    columnas específicas), cursos propios con progreso, peticiones de
    oración propias, código QR de check-in.
11. **Check-in QR**: token HMAC firmado de corta vigencia (nunca el
    person_id en crudo), escaneo compatible con lectores QR/barras
    (input de texto), check-in manual.
12. **Peticiones de oración**: bandeja restringida a
    intercesor/pastor/administrador, contenido solo visible en detalle
    (auditado), listado sin contenido.
13. **Emails y encuestas**: envío vía Resend con registro en
    `notification_log`, encuestas con preguntas de texto/opción única.
14. **Reportes**: paneles agregados por rol (personas, matrícula,
    asistencia, seguimiento, oración) con `StatBarList` (barras de un
    solo color, sin librería externa).
15. **Seguridad**: auditoría de RLS (24/24 tablas), auditoría de
    guards de autorización (1:1 en cada Server Action), sanitización de
    filtros PostgREST, fix de accesibilidad en `CardTitle`.

Verificado en cada módulo durante la construcción: `npm run typecheck`,
`npm run lint`, `npm run format:check`, `npm run build` — todos
limpios. 6 pruebas Playwright pasan.

**Más tarde en la misma sesión**: el usuario proveyó credenciales de un
proyecto Supabase Cloud de desarrollo. Se aplicaron las migraciones
(encontrando y corrigiendo 2 bugs reales de SQL en el proceso — ver
`docs/decisions.md`), se sembraron datos sintéticos, y se verificó
manualmente en navegador con sesión real cada módulo, con múltiples
roles, incluidas pruebas negativas de seguridad (RLS bloqueando acceso
no autorizado). Ver la sección "Verificación end-to-end realizada"
arriba para el detalle completo.

**Commits**: 18 commits atómicos, uno por módulo/hito, con mensajes
descriptivos (ver `git log`).
