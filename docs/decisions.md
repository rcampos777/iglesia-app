# Registro de decisiones (ADR ligero)

Formato: fecha, decisión, contexto/alternativas, consecuencias.

## 2026-08-16 — Stack base

**Decisión**: Next.js App Router + TypeScript estricto + Supabase
(Postgres + Auth + RLS) + Tailwind + shadcn/ui + Zod + React Hook Form +
Playwright + Resend, desplegado en Vercel.

**Contexto**: stack solicitado explícitamente por el dueño del producto,
ya validado para apps CRUD con auth/roles complejos y buen soporte
serverless en Vercel.

**Consecuencias**: acoplamiento a Supabase para Auth+DB+RLS (aceptado,
es un requisito explícito, no una elección abierta).

## 2026-08-16 — Categorías de curso configurables (tabla, no enum)

**Decisión**: `course_categories` es una tabla, no un `enum` de Postgres.

**Contexto**: el requisito pide "cursos y clases... y otros configurables".
Un enum requeriría una migración para agregar una categoría nueva; una
tabla permite que un administrador la agregue desde la UI.

**Consecuencias**: una validación menos estricta a nivel de tipo (se
compensa con Zod + `foreign key`).

## 2026-08-16 — Auditoría de lectura de peticiones de oración a nivel de aplicación, no de trigger

**Decisión**: el registro en `prayer_request_access_log` lo hace la
función `log_prayer_request_access()`, invocada desde
`src/lib/data/prayer-requests.ts` en cada lectura de detalle — no un
trigger de base de datos.

**Contexto**: Postgres no dispara triggers en `SELECT`. Las alternativas
(vistas con logging, extensiones de auditoría de queries) agregan
complejidad operativa desproporcionada para el MVP.

**Consecuencias**: la garantía de auditoría depende de que todo el código
de la aplicación use esa función como único camino de lectura de detalle
— documentado como invariante en `docs/security.md`. Un acceso directo
con la `service_role key` (fuera de la app) no quedaría auditado por este
mecanismo; ese acceso ya está restringido a quien administra el proyecto
Supabase.

## 2026-08-16 — QR de check-in con token firmado de corta vigencia

**Decisión**: el QR no codifica `person_id` en texto plano permanente,
sino un token HMAC firmado con expiración corta.

**Contexto**: un QR con el id en crudo, si se comparte una foto, permite
suplantar el check-in de otra persona indefinidamente.

**Consecuencias**: el QR mostrado en el portal del miembro debe
regenerarse/refrescarse; no es una imagen estática descargable de por
vida.

## 2026-08-16 — Sin Docker/Supabase CLI en el entorno de desarrollo de esta iteración

**Decisión**: se continuó con la implementación completa de código,
migraciones y documentación sin poder ejecutar `supabase start` (no hay
Docker instalado en este entorno).

**Contexto**: instrucción explícita del usuario de no detenerse por
bloqueos de infraestructura local, sino documentar y continuar.

**Consecuencias**: falta validar las migraciones y las políticas RLS
contra una base Postgres real antes de considerar el módulo de datos
"terminado" en el sentido estricto de `CLAUDE.md`. Ver
`docs/progress.md` para el plan de verificación pendiente.
