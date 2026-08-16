# Progreso del proyecto

Última actualización: 2026-08-16.

## Bloqueo de entorno conocido (sigue vigente)

Este entorno de desarrollo **no tiene Docker ni Supabase CLI
instalados**, por lo que no fue posible levantar Postgres local
(`supabase start`) ni ejecutar las migraciones/RLS contra una base real
en ninguna sesión hasta ahora. Se continuó según instrucción explícita
del usuario: "si faltan credenciales, implementa una alternativa local
o simulada, documenta lo pendiente y continúa con todo lo demás".

**Qué significa esto en la práctica:**

- Las 16 migraciones SQL en `supabase/migrations/` están escritas y
  revisadas manualmente (incluida una auditoría línea por línea de que
  las 24 tablas creadas tienen RLS habilitado), pero **no ejecutadas
  contra Postgres real**.
- `npm run typecheck`, `npm run lint`, `npm run format:check` y
  `npm run build` pasan limpios en cada módulo (verificado
  repetidamente a lo largo de la construcción).
- Se agregaron pruebas Playwright (`tests/e2e/auth.spec.ts`) que **sí**
  corren y pasan contra el servidor de desarrollo real, para lo que no
  depende de la base de datos: renderizado de páginas públicas y
  protección de rutas (redirect a `/login` sin sesión). 6/6 pasan.
- Los flujos que requieren datos reales (login real, CRUD contra la
  base, RLS en la práctica, envío de emails, check-in real) están
  **implementados en código pero no verificados end-to-end** todavía.

**Para desbloquear**: el usuario puede (a) instalar Docker Desktop y la
Supabase CLI para desarrollo 100% local, o (b) crear un proyecto
Supabase Cloud (tiene capa gratuita) y compartir sus credenciales para
`.env.local`, además de credenciales de Resend para probar emails. Con
cualquiera de las dos, la siguiente sesión debe:

1. `npx supabase db reset` (local) o `npx supabase db push` (cloud).
2. `npm run seed` para poblar datos sintéticos y cuentas de prueba (una
   por rol, ver `scripts/seed.ts`, password `Iglesia2026!Dev`).
3. Verificar de punta a punta en navegador cada módulo con cada rol
   relevante (login real, permisos, RLS negativo — que un rol sin
   permiso reciba error, no datos parciales).
4. Otorgar el primer `administrador` manualmente (ver
   `docs/deployment.md` §4).
5. Completar la cobertura de Playwright más allá de los smoke tests
   actuales (ver lista en `docs/testing.md`).

## Fases (orden de prioridad del producto)

| #   | Fase                              | Estado                                                                     |
| --- | --------------------------------- | -------------------------------------------------------------------------- |
| 1   | Base del proyecto y documentación | ✅ Hecho                                                                   |
| 2   | Modelo de datos                   | ✅ 16 migraciones, RLS auditado — ⚠️ no ejecutado contra DB real           |
| 3   | Autenticación                     | ✅ Código completo — ⚠️ no probado end-to-end con DB real                  |
| 4   | Roles y permisos                  | ✅ RLS + guards + panel `/admin` — ⚠️ no probado end-to-end con DB real    |
| 5   | Directorio central de personas    | ✅ CRUD + detección de duplicados — ⚠️ no probado end-to-end con DB real   |
| 6   | Cursos y clases                   | ✅ Completo — ⚠️ no probado end-to-end con DB real                         |
| 7   | Matrícula, asistencia y progreso  | ✅ Completo (incluido en fase 6) — ⚠️ no probado end-to-end                |
| 8   | Importación y deduplicación       | ✅ Solo CSV (Excel/Access pendiente, ver abajo) — ⚠️ no probado end-to-end |
| 9   | Visitantes y seguimiento          | ✅ Completo — ⚠️ no probado end-to-end                                     |
| 10  | Portal del miembro                | ✅ Completo — ⚠️ no probado end-to-end                                     |
| 11  | Check-in QR                       | ✅ Token firmado + escaneo por input — ⚠️ no probado end-to-end            |
| 12  | Peticiones de oración             | ✅ Completo con auditoría de acceso — ⚠️ no probado end-to-end             |
| 13  | Emails y encuestas                | ✅ Completo — ⚠️ no probado end-to-end (requiere Resend real)              |
| 14  | Paneles y reportes                | ✅ Completo — ⚠️ no probado end-to-end                                     |
| 15  | Revisión de seguridad             | ✅ Auditoría de RLS/guards + sanitización de filtros — ver detalle abajo   |
| 16  | Preparación para producción       | 🔶 Checklist listo en `docs/deployment.md` — falta ejecutarlo (ver abajo)  |

Todas las fases 1–14 tienen **código completo, con lint/typecheck/build
verdes**, pero **ninguna ha sido probada contra una base de datos real**
por el bloqueo de entorno descrito arriba. Este es el trabajo pendiente
más importante antes de considerar el MVP "terminado" en el sentido
estricto de `CLAUDE.md` §7 (que exige funcionar de principio a fin, no
solo compilar).

## Fase 15 — qué se revisó

- **RLS**: se verificó programáticamente que las 24 tablas creadas
  tienen `enable row level security` (coinciden 1:1).
- **Autorización en servidor**: se verificó que cada función exportada
  en cada archivo `"use server"` del área autenticada invoca
  `requireRole`/`requireAuth` antes de operar (conteo 1:1 por archivo).
- **Guard de páginas**: el layout de `(app)` exige sesión; páginas de
  escritura (`/personas/nueva`, `/admin`, etc.) redirigen si el rol no
  alcanza; páginas de solo-lectura ampliamente compartidas (`/cursos`,
  `/dashboard`) dependen de RLS para acotar los datos, consistente con
  la matriz de `docs/roles-and-permissions.md`.
- **Sanitización de filtros**: se encontró y corrigió interpolación sin
  sanitizar de términos de búsqueda/datos de importación en filtros
  `.or()`/`.ilike()` de PostgREST (`src/lib/supabase/filter-utils.ts`).
  RLS ya acotaba el impacto real (no permitía saltarse permisos), pero
  se corrigió por buena práctica y para evitar romper consultas.
- **Accesibilidad**: `CardTitle` (shadcn) se cambió de `<div>` a `<h3>`
  para que los títulos de tarjetas/formularios sean encabezados reales
  navegables por lectores de pantalla. Labels asociados a inputs en
  todos los formularios. Nav móvil con `aria-label`.
- **Secretos**: confirmado que `SUPABASE_SERVICE_ROLE_KEY` solo se lee
  en `src/lib/supabase/admin.ts` (no usado aún en runtime de la app,
  reservado) y `scripts/seed.ts`; `.env.local` no está trackeado en git.
- **No revisado todavía** (requiere DB real): comportamiento real de
  cada política RLS bajo carga con datos reales, límites de tasa,
  ataques de fuerza bruta sobre login (Supabase Auth los maneja por
  defecto, no se configuró nada adicional), CORS/CSP headers a nivel de
  Next.js config (no se tocó `next.config.ts` — usa defaults seguros de
  Next 16).

## Fase 16 — qué falta para producción

- [ ] Ejecutar migraciones contra un proyecto Supabase real y verificar
      cada módulo end-to-end (bloqueado por falta de credenciales/Docker).
- [ ] Completar suite de Playwright más allá de los smoke tests (ver
      `docs/testing.md` §3 para la lista priorizada).
- [ ] Parser real de `.xlsx` para importación (hoy solo CSV; Excel/Access
      requieren exportarse a CSV primero).
- [ ] Otorgar el primer `administrador` (manual, ver `docs/deployment.md`).
- [ ] Configurar dominio verificado en Resend y `RESEND_FROM_EMAIL` real.
- [ ] Generar un `QR_CHECKIN_SECRET` único de producción.
- [ ] Revisar el checklist completo de `docs/deployment.md` §5.
- [ ] **Autorización explícita del usuario antes de publicar** (regla
      dura, no negociable).

## Próxima tarea

En cuanto haya credenciales de un proyecto Supabase (local con Docker o
Cloud): aplicar migraciones, sembrar datos, y verificar de punta a
punta cada uno de los 14 módulos funcionales con cada rol relevante,
incluyendo casos negativos de seguridad (un rol sin permiso debe
recibir error, no datos parciales). Solo después de esa verificación
tiene sentido seguir sumando alcance nuevo (encuestas con más tipos de
pregunta, parser de Excel real, etc.).

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
   `update_own_contact_info`, `list_users_with_roles`).
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
6. **Importación**: CSV → staging → revisión humana → promoción
   (aprobar nuevo / fusionar / rechazar), sin fusión automática, sin
   notificaciones automáticas. Captura manual reutiliza el mismo
   pipeline.
7. **Visitantes y seguimiento**: seguimiento con bitácora de contactos.
8. **Portal del miembro**: contacto propio (vía RPC restringida a
   columnas específicas), cursos propios con progreso, peticiones de
   oración propias, código QR de check-in.
9. **Check-in QR**: token HMAC firmado de corta vigencia (nunca el
   person_id en crudo), escaneo compatible con lectores QR/barras
   (input de texto), check-in manual.
10. **Peticiones de oración**: bandeja restringida a
    intercesor/pastor/administrador, contenido solo visible en detalle
    (auditado), listado sin contenido.
11. **Emails y encuestas**: envío vía Resend con registro en
    `notification_log`, encuestas con preguntas de texto/opción única.
12. **Reportes**: paneles agregados por rol (personas, matrícula,
    asistencia, seguimiento, oración) con `StatBarList` (barras de un
    solo color, sin librería externa).
13. **Seguridad**: auditoría de RLS (24/24 tablas), auditoría de
    guards de autorización (1:1 en cada Server Action), sanitización de
    filtros PostgREST, fix de accesibilidad en `CardTitle`.

Verificado en cada módulo: `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm run build` — todos limpios. Probado en
navegador (sin DB real): páginas públicas renderizan en escritorio y
móvil (375px), protección de rutas funciona. 6 pruebas Playwright
pasan. `npm run seed` falla de forma controlada sin credenciales
reales, como se espera.

**Commits**: 13 commits atómicos, uno por módulo/hito, con mensajes
descriptivos (ver `git log`).
