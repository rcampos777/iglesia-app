# Progreso del proyecto

Última actualización: 2026-08-16 (sesión inicial de construcción).

## Bloqueo de entorno conocido

Este entorno de desarrollo **no tiene Docker ni Supabase CLI
instalados**, por lo que no fue posible levantar Postgres local
(`supabase start`) ni ejecutar las migraciones/RLS contra una base real
en esta sesión. Se continuó según instrucción explícita del usuario:
"si faltan credenciales, implementa una alternativa local o simulada,
documenta lo pendiente y continúa con todo lo demás".

**Qué significa esto en la práctica:**

- Las migraciones SQL en `supabase/migrations/` están escritas y
  revisadas manualmente, pero no ejecutadas contra Postgres real.
- El build/lint/typecheck de Next.js sí se ejecutaron y pasan (no
  dependen de una base viva).
- Los flujos que requieren datos reales (login, CRUD, RLS) están
  implementados en código pero no verificados end-to-end en navegador
  todavía.

**Para desbloquear**: el usuario puede (a) instalar Docker Desktop y la
Supabase CLI para desarrollo 100% local, o (b) crear un proyecto
Supabase Cloud (tiene capa gratuita) y compartir sus credenciales para
`.env.local`. Con cualquiera de las dos, la siguiente sesión debe correr
`supabase db reset` (o `supabase db push` + `npm run seed`) y completar
la verificación end-to-end de cada módulo.

## Fases (orden de prioridad del producto)

| #   | Fase                              | Estado                                                         |
| --- | --------------------------------- | -------------------------------------------------------------- |
| 1   | Base del proyecto y documentación | ✅ Hecho                                                       |
| 2   | Modelo de datos                   | ✅ Migraciones escritas — ⚠️ pendiente ejecutar contra DB real |
| 3   | Autenticación                     | 🔶 Código escrito — ⚠️ pendiente prueba end-to-end             |
| 4   | Roles y permisos                  | 🔶 Código + RLS escritos — ⚠️ pendiente prueba end-to-end      |
| 5   | Directorio central de personas    | ✅ CRUD completo — ⚠️ pendiente prueba end-to-end con DB real  |
| 6   | Cursos y clases                   | ⏳ Pendiente                                                   |
| 7   | Matrícula, asistencia y progreso  | ⏳ Pendiente                                                   |
| 8   | Importación y deduplicación       | ⏳ Pendiente                                                   |
| 9   | Visitantes y seguimiento          | ⏳ Pendiente                                                   |
| 10  | Portal del miembro                | ⏳ Pendiente                                                   |
| 11  | Check-in QR                       | ⏳ Pendiente                                                   |
| 12  | Peticiones de oración             | ⏳ Pendiente                                                   |
| 13  | Emails y encuestas                | ⏳ Pendiente                                                   |
| 14  | Paneles y reportes                | ⏳ Pendiente                                                   |
| 15  | Revisión de seguridad             | ⏳ Pendiente                                                   |
| 16  | Preparación para producción       | ⏳ Pendiente                                                   |

Este archivo se actualiza al final de cada tarea completada, con la
fecha, qué se hizo, qué falta, y cualquier decisión relevante (que
también debe reflejarse en `docs/decisions.md` si es significativa).

## Próxima tarea

Cursos y clases configurables (fase 6), seguido de matrícula/asistencia
(fase 7). Cuando haya credenciales Supabase reales disponibles: correr
`supabase db reset` (o `db push`) + `npm run seed` y verificar de punta
a punta en navegador (login real, RLS, cada rol) todo lo construido
hasta ahora antes de seguir sumando módulos nuevos.

## Bitácora

### 2026-08-16

- Proyecto Next.js 16 (App Router, TS estricto) inicializado en la
  carpeta, con Tailwind v4 + shadcn/ui (preset Nova/Radix).
- Dependencias instaladas: Supabase (`@supabase/ssr`,
  `@supabase/supabase-js`), Zod, React Hook Form, Playwright, Resend,
  Prettier, `tsx`, `papaparse`, `qrcode.react`, `date-fns`,
  `@faker-js/faker`.
- `CLAUDE.md` y los 11 documentos de `docs/` creados.
- `.env.example` y reglas de `.gitignore` para bloquear datos
  personales/Excel/CSV/Access/secretos.
- Modelo de datos completo diseñado e implementado como 14 migraciones
  SQL versionadas en `supabase/migrations/`, con RLS y funciones
  auxiliares (`has_role`, `is_staff`, `is_admin`, `current_person_id`)
  en todas las tablas.
- Clientes Supabase (browser/server/admin/middleware→proxy) y
  `src/types/database.ts` con tipos manuales del esquema.
  **Nota técnica importante**: los tipos `Row` deben ser `type`, no
  `interface`, o el cliente tipado de Supabase resuelve `never` en
  silencio (documentado en `CLAUDE.md` §10 y `docs/decisions.md`).
- Autenticación completa: login, registro, recuperar/restablecer
  contraseña, callback de confirmación — Server Actions + Zod +
  `useActionState`.
- RBAC: `getCurrentUser()`, `requireRole()`, nav lateral/móvil filtrada
  por rol, layout autenticado con guard de sesión (doble barrera con el
  proxy).
- Directorio de personas: listado con búsqueda/filtro, alta y edición,
  con verificación de posibles duplicados (email/teléfono exactos, nunca
  por nombre) que exige confirmación humana antes de crear.
- `scripts/seed.ts`: genera cuentas de prueba (una por rol, password
  `Iglesia2026!Dev`), personas, cursos/clases/matrícula/asistencia, un
  servicio con check-ins, seguimientos de visitantes y peticiones de
  oración — todo sintético.
- Verificado: `npm run typecheck`, `npm run lint`, `npm run format:check`
  y `npm run build` pasan limpios. Probado en navegador (sin DB real):
  `/login`, `/registro` renderizan correctamente en escritorio y móvil
  (375px); `/dashboard` redirige a `/login` sin sesión (protección de
  rutas funcionando). `npm run seed` falla de forma controlada (mensaje
  claro) sin credenciales reales, como se espera.
