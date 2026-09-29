# Arquitectura

## 1. Panorama general

```
┌──────────────┐      ┌───────────────────────┐      ┌─────────────────┐
│  Navegador    │◄────►│  Next.js (Vercel)      │◄────►│ Supabase          │
│  (móvil/desk) │      │  App Router            │      │ - Postgres + RLS  │
└──────────────┘      │  Server Components      │      │ - Auth            │
                        │  Server Actions/Routes  │      │ - Storage (fotos) │
                        └───────────┬────────────┘      └─────────┬────────┘
                                    │                                │
                                    ▼                                ▼
                             ┌────────────┐                  ┌──────────────┐
                             │  Resend     │                  │  Vercel Cron  │
                             │  (emails)    │                  │  (recordatorios,│
                             └────────────┘                  │   digest, etc)│
                                                               └──────────────┘
```

## 2. Principios

- **Server-first**: Server Components por defecto; `"use client"` solo
  para interactividad real (formularios, escáner QR, tablas con estado).
- **Doble capa de autorización**: cada Server Action/Route Handler valida
  rol y pertenencia antes de tocar datos, y además cada tabla tiene RLS
  que aplica las mismas reglas de forma independiente. Ninguna de las dos
  capas confía en la otra.
- **Data Access Layer (DAL)**: `src/lib/data/*` concentra las consultas a
  Supabase desde el servidor. Los componentes y actions no arman queries
  Supabase inline salvo lecturas triviales ya acotadas por RLS.
- **Staging antes que verdad**: cualquier dato que entra en lote (import)
  pasa por tablas de staging, nunca directo a tablas finales.

## 3. Clientes de Supabase

Tres variantes en `src/lib/supabase/`:

- `client.ts` — cliente de navegador (`createBrowserClient`), usa la
  `anon key`, sujeto 100% a RLS.
- `server.ts` — cliente de servidor (`createServerClient`) que lee/escribe
  cookies de sesión vía `next/headers`. Se usa en Server Components,
  Server Actions y Route Handlers. También sujeto a RLS (actúa como el
  usuario autenticado).
- `admin.ts` — cliente con `service_role key`, **solo** para operaciones
  que deliberadamente deben saltarse RLS (ej. crear el primer
  administrador, procesos de importación masiva controlados, jobs
  programados). Nunca se importa desde código que se ejecuta en el
  cliente. Requiere justificar su uso con un comentario.
- `middleware.ts` — refresca la sesión en cada request (Next.js
  middleware) para que las cookies no expiren silenciosamente.

### Escala: límite de 1000 filas de PostgREST

Supabase corta **en silencio** cualquier respuesta a 1000 filas
(`max_rows`), y los filtros `.in(...)` viajan en la URL (cientos de UUIDs
la rompen). Reglas para el data layer:

- Conteos y reportes: contar en la base (`select("id", { count: "exact", head: true })`), nunca traer filas para contarlas en JS.
- Listas que pueden crecer sin tope: `fetchAllPages` de `src/lib/data/paging.ts` con un orden estable (terminar en `.order("id")`).
- Búsquedas por lista de IDs: `fetchInChunks` (tandas de 150).
- El directorio de personas ya pagina en la UI (25 por página).

## 4. Rutas (App Router)

```
src/app/
  (auth)/
    login/                # inicio de sesión (soporta ?next= de vuelta)
    registro/               # alta de cuenta
    recuperar/                # recuperación de contraseña
  auth/callback/               # intercambia el code de Supabase por sesión
  (app)/                          # requiere sesión; layout valida rol mínimo
    layout.tsx                     # nav lateral/inferior según rol
    dashboard/                       # panel principal
    personas/                          # directorio (lista, detalle, alta, edición)
    cursos/, cursos/clases/[id]/         # categorías, cursos, clases, matrícula+asistencia
    visitantes/                            # seguimiento de visitantes
    check-in/                                # "Asistencia": consola del ujier (búsqueda + QR)
    check-in/programacion/                     # series semanales, excepciones, cultos especiales
    check-in/publico/                          # antiguo QR fijo: ahora solo muestra el QR personal
    oracion/                                     # bandeja de peticiones (intercesor+)
    importar/                                      # asistente de importación (CSV + manual)
    portal/                                          # portal del miembro (self-service)
    encuestas/                                         # crear/responder/ver resultados
    reportes/                                            # paneles agregados por rol
    finanzas/                                              # donaciones, cartas, exportar (apostol/finanzas)
    admin/                                                 # usuarios y roles
```

No hay Route Handlers bajo `api/` para estos flujos: check-in, importación
y encuestas se implementaron como **Server Actions** (en cada
`actions.ts` junto a las páginas), que es el patrón por defecto de este
proyecto — un Route Handler solo se justifica para webhooks externos o
respuestas que no son HTML/RSC (ninguno existe todavía en el MVP salvo
`auth/callback`, que Supabase requiere como redirect URL).

## 5. Cultos recurrentes y check-in por ujieres

Detalle completo en [`docs/services-schedule.md`](services-schedule.md).

- **Un solo sistema de asistencia**: cada fecha de culto es una fila de
  `services` (con su propio `starts_at` en UTC, mostrado siempre en hora
  de Puerto Rico) y cada asistencia una fila de `service_checkins`.
- **Programación**: `service_series` + `service_series_rules`
  (versionadas por fecha de vigencia). `generate_service_occurrences()`
  crea las fechas que falten hasta el horizonte (4 semanas por
  defecto); la ejecuta **pg_cron** a diario (0033) y, de respaldo, la
  página de Asistencia al abrirse.
- **Check-in**: solo personal autorizado. El ujier busca por nombre
  (búsqueda en el servidor, datos mínimos) o escanea el **QR personal**
  (token HMAC de 5 minutos, `QR_CHECKIN_SECRET`, validado en el
  servidor). El QR identifica a la persona; no concede permisos. Ya no
  existe el auto check-in con QR fijo (retirado 2026-09-28, ver
  `docs/decisions.md`).
- **Escrituras**: solo funciones `security definer` que validan
  capacidad (`can_record_attendance()`, etc.) y ventana
  (`service_checkin_state()`). Sin políticas de escritura directa.
- **Pantallas**: Server Components cargan los datos; la consola
  (`attendance-console.tsx`) es un Client Component que recibe las
  Server Actions por props, refresca la lista cada 20 s (varios ujieres
  a la vez) y no muestra éxito hasta que el servidor confirma.

## 5.b Donaciones y Finanzas

Ver [`docs/finance.md`](finance.md). Capa de datos en
`src/lib/data/finance.ts` (solo RPC), dinero en `src/lib/money.ts`
(centavos), cartas en `src/lib/finance/letter.ts` (instantánea) y
`letter-pdf.ts` (PDF con `pdf-lib`, en el servidor). Los PDF emitidos se
guardan en la base (`donation_letters.pdf`) y se sirven por un Route
Handler protegido; no se usa almacenamiento público.

## 6. Envío de emails

- `src/lib/email/` encapsula Resend. Toda llamada pasa por
  `sendTemplatedEmail(templateCode, ...)`, que registra el intento en
  `notification_log` antes/después de enviar.
- Las peticiones de oración nunca pasan `content` a una plantilla de
  email; solo un aviso genérico + link a la app.

## 7. Despliegue

Ver [`docs/deployment.md`](deployment.md). Arquitectura pensada para
Vercel (Next.js) + Supabase Cloud, sin servidores propios que mantener.
