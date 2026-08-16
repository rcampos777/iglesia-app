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
| 5   | Directorio central de personas    | 🔶 En progreso                                                 |
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

Directorio central de personas (CRUD completo con Zod + Server Actions +
UI), seguido de autenticación/RBAC operando de punta a punta en cuanto
haya credenciales Supabase disponibles.

## Bitácora

### 2026-08-16

- Proyecto Next.js 16 (App Router, TS estricto) inicializado en la
  carpeta, con Tailwind v4 + shadcn/ui (preset Nova/Radix).
- Dependencias instaladas: Supabase (`@supabase/ssr`,
  `@supabase/supabase-js`), Zod, React Hook Form, Playwright, Resend,
  Prettier, `tsx`, `papaparse`, `qrcode.react`, `date-fns`.
- `CLAUDE.md` y los 11 documentos de `docs/` creados.
- `.env.example` y reglas de `.gitignore` para bloquear datos
  personales/Excel/CSV/Access/secretos.
- Modelo de datos completo diseñado e implementado como 13 migraciones
  SQL versionadas en `supabase/migrations/`, con RLS y funciones
  auxiliares (`has_role`, `is_staff`, `is_admin`, `current_person_id`)
  en todas las tablas.
