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
    check-in/                                # panel staff: servicios, QR fijo, toggle abierto/cerrado
    check-in/publico/                          # auto check-in (cualquier persona autenticada)
    oracion/                                     # bandeja de peticiones (intercesor+)
    importar/                                      # asistente de importación (CSV + manual)
    portal/                                          # portal del miembro (self-service)
    encuestas/                                         # crear/responder/ver resultados
    reportes/                                            # paneles agregados por rol
    admin/                                                 # usuarios y roles
```

No hay Route Handlers bajo `api/` para estos flujos: check-in, importación
y encuestas se implementaron como **Server Actions** (en cada
`actions.ts` junto a las páginas), que es el patrón por defecto de este
proyecto — un Route Handler solo se justifica para webhooks externos o
respuestas que no son HTML/RSC (ninguno existe todavía en el MVP salvo
`auth/callback`, que Supabase requiere como redirect URL).

## 5. Check-in: dos flujos complementarios

**(a) QR fijo en la entrada (auto check-in, flujo principal).** La
iglesia imprime un único QR estático que apunta a `/check-in/publico`
(no codifica ningún token ni cambia nunca). Cada persona lo escanea con
su propio celular, inicia sesión si hace falta (con `?next=` de vuelta a
esa página), y confirma su propia asistencia a cualquier servicio con
`is_checkin_open = true`. La autorización real vive en RLS
(`service_checkins_insert_self`: `person_id = current_person_id()` y el
servicio debe estar abierto) — la Server Action (`selfCheckinAction`)
es la primera barrera, no la única. Staff abre/cierra el check-in por
servicio con un switch en `/check-in`.

**(b) QR personal + operador (check-in asistido).** El QR de una persona
(visible en su portal) codifica un **token firmado (HMAC,
`QR_CHECKIN_SECRET`) de corta vigencia** con su `person_id`, no el
`person_id` en texto plano permanente, para evitar que una foto del
carnet permita check-in indefinido de terceros si se comparte. (Ver
`docs/security.md`.) Un operador (rol `seguimiento` o superior) escanea
ese código (o lo pega/lee con un lector físico) en `/check-in/[servicio]`,
que valida la firma en el servidor (`scanCheckinAction`) y crea el
`service_checkin` con la sesión del operador (no el cliente admin),
respetando RLS. Útil para niños, visitantes sin cuenta, o cuando alguien
prefiere que lo registren en la puerta.

Ambos flujos escriben en la misma tabla `service_checkins`
(`method: 'qr'` para ambos — se distinguen por quién quedó como
`checked_in_by`, no hay un método separado "auto").

## 6. Envío de emails

- `src/lib/email/` encapsula Resend. Toda llamada pasa por
  `sendTemplatedEmail(templateCode, ...)`, que registra el intento en
  `notification_log` antes/después de enviar.
- Las peticiones de oración nunca pasan `content` a una plantilla de
  email; solo un aviso genérico + link a la app.

## 7. Despliegue

Ver [`docs/deployment.md`](deployment.md). Arquitectura pensada para
Vercel (Next.js) + Supabase Cloud, sin servidores propios que mantener.
