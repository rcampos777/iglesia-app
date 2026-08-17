# Despliegue

## 1. Requisitos previos

- Proyecto de **Supabase** (Cloud) creado, con la contraseña de la base
  guardada de forma segura.
- Cuenta de **Vercel** con el repositorio conectado.
- Cuenta de **Resend** con dominio verificado para envío de emails.
- Todas las variables de `.env.example` completadas como _Environment
  Variables_ en Vercel (Production y Preview, con valores distintos si
  se usan proyectos Supabase separados por entorno).

## 2. Base de datos (Supabase)

```bash
# Instalar CLI (si no está disponible)
npm install -g supabase

# Vincular el proyecto local al proyecto remoto
supabase link --project-ref TU_PROJECT_ID

# Aplicar todas las migraciones versionadas en supabase/migrations/
supabase db push
```

**Nota — conexión directa vs. pooler**: los proyectos nuevos de Supabase
solo exponen el host directo (`db.<ref>.supabase.co`) por **IPv6**. Si
`supabase db push` falla con un error de resolución/conexión (típico en
entornos sin salida IPv6 completa a puertos TCP no estándar, incluyendo
este entorno de agente), usar el **connection string del pooler**
(Project Settings → Database → Connection string → "Session pooler"),
que sí tiene IPv4:

```bash
supabase db push --db-url "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

- Las migraciones son **aditivas y ordenadas** (`0001_...` en adelante).
  No editar una migración ya aplicada en producción: crear una nueva.
- Después de aplicar, verificar en el dashboard de Supabase que **todas**
  las tablas nuevas tengan RLS habilitado (checklist en
  `docs/security.md`).
- Sembrar datos: en producción **nunca** se corre `scripts/seed.ts`
  (datos sintéticos). Producción arranca vacía; el primer
  `administrador` se otorga manualmente (ver sección 4) — o, si se usó
  `npm run seed` en un proyecto de desarrollo, el usuario
  `admin@iglesia.test` ya queda con rol `administrador` automáticamente.

## 3. Aplicación (Vercel)

- Framework preset: Next.js (detectado automáticamente).
- Build command: `npm run build` (por defecto).
- Node version: la que fije `package.json`/`.nvmrc` si se agrega; usar
  una LTS reciente compatible con la versión de Next.js instalada.

## 4. Primer administrador

No hay UI de "crear administrador" (por seguridad, no se expone
auto-elevación de roles). Pasos:

1. El primer usuario se registra normalmente (queda con rol `miembro`).
2. Con la `service_role key` (nunca desde el cliente), se ejecuta una
   vez:
   ```sql
   insert into user_roles (user_id, role)
   values ('UUID_DEL_USUARIO', 'administrador');
   ```
   directamente en el SQL editor de Supabase (solo por quien tiene
   acceso al dashboard del proyecto).

## 5. Checklist antes de producción

- [ ] Todas las tablas tienen RLS habilitado y políticas revisadas.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` solo existe como variable server-side
      en Vercel, nunca prefijada `NEXT_PUBLIC_`.
- [ ] Dominio de Resend verificado; `RESEND_FROM_EMAIL` usa ese dominio.
- [ ] `QR_CHECKIN_SECRET` es un valor aleatorio largo generado para
      producción (no el de `.env.example` ni el de desarrollo).
- [ ] `npm run build` pasa limpio.
- [ ] Pruebas E2E críticas pasan contra un entorno de staging.
- [ ] Se revisó `docs/security.md` completo.
- [ ] El usuario (dueño del producto) autorizó explícitamente publicar en
      producción — **no publicar sin esta autorización**, incluso si
      todo lo técnico está listo.

## 6. Estado real de este proyecto

Ver `docs/progress.md`. Las 16 migraciones se aplicaron y verificaron
exitosamente contra un proyecto Supabase Cloud de **desarrollo**
(`jlmabwnbtwjrtqaxfafx`), incluyendo `npm run seed` y verificación
manual en navegador con múltiples roles (login real, RLS positivo y
negativo, mutaciones vía Server Actions). Sigue pendiente: repetir este
proceso contra el proyecto de **producción** cuando exista, y todo lo
listado en el checklist de la sección 5.
