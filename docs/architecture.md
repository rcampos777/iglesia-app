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

## 4. Rutas (App Router)

```
src/app/
  (auth)/
    login/                # inicio de sesión
    registro/               # alta de cuenta (si aplica invitación abierta)
    recuperar/                # recuperación de contraseña
  (app)/                       # requiere sesión; layout valida rol mínimo
    layout.tsx                  # nav lateral/inferior según rol
    dashboard/                    # panel principal
    personas/                      # directorio (lista, detalle, alta, edición)
    cursos/                          # categorías, cursos, clases
    clases/[id]/asistencia/            # tomar asistencia
    visitantes/                          # seguimiento de visitantes
    check-in/                              # operador de check-in (staff)
    oracion/                                 # bandeja de peticiones (intercesor+)
    importar/                                  # asistente de importación
    portal/                                      # portal del miembro (self-service)
    reportes/                                      # paneles
    admin/                                           # usuarios, roles, plantillas
  api/
    checkin/scan/route.ts    # resuelve token QR -> registra check-in
    checkin/token/route.ts    # genera token QR de corta duración para una persona
    import/parse/route.ts      # parsea Excel/CSV subido -> import_rows
    cron/...                     # tareas programadas (Vercel Cron)
```

## 5. Manejo de QR de check-in

- El QR de una persona codifica un **token firmado (HMAC, `QR_CHECKIN_SECRET`)
  de corta vigencia** con su `person_id`, no el `person_id` en texto plano
  permanente, para evitar que una foto del carnet permita check-in
  indefinido de terceros si se comparte. (Ver `docs/security.md`.)
- El escaneo llama a `POST /api/checkin/scan` desde el dispositivo del
  operador (o del propio miembro), que valida la firma y el `service_id`
  activo, y crea `service_checkins` usando el cliente de servidor con la
  sesión del operador (no el cliente admin), respetando RLS.

## 6. Envío de emails

- `src/lib/email/` encapsula Resend. Toda llamada pasa por
  `sendTemplatedEmail(templateCode, ...)`, que registra el intento en
  `notification_log` antes/después de enviar.
- Las peticiones de oración nunca pasan `content` a una plantilla de
  email; solo un aviso genérico + link a la app.

## 7. Despliegue

Ver [`docs/deployment.md`](deployment.md). Arquitectura pensada para
Vercel (Next.js) + Supabase Cloud, sin servidores propios que mantener.
