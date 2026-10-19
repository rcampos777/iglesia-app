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

- Las migraciones son **aditivas y ordenadas** (`0001_...` en adelante,
  29 al 2026-09-05: `0027`/`0028`/`0029` cierran los hallazgos de la
  auditoría de identidad/autorización — ver `docs/decisions.md`
  2026-09-05). No editar una migración ya aplicada en producción: crear
  una nueva.
- **Un proyecto Supabase por iglesia + uno de demostración.**
  `jlmabwnbtwjrtqaxfafx` es el proyecto de **demo/desarrollo**: solo
  datos sintéticos, se usa para pruebas de carga y para enseñar la app a
  otras iglesias. Cada iglesia real tiene su propio proyecto (arranca
  vacío; se aplican todas las migraciones en orden). Ver "Alta de una
  iglesia nueva" abajo.
- **0031–0033 (cultos recurrentes y ujieres, 2026-09-28)**: aplicar y
  desplegar la app **en el mismo paso** (0032 elimina
  `services.is_checkin_open`). 0033 activa pg_cron. Pasos exactos y
  consultas de verificación en `docs/services-schedule.md` §6.
- **0034–0035 (Donaciones y Finanzas, 2026-09-28)**: aditivas. Después,
  alta inicial del Apóstol en el SQL Editor (`bootstrap_first_apostol`,
  ver `docs/finance.md` §7). Nadie tiene acceso financiero hasta ese paso.
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

### Variables adicionales

- `AUTH_OAUTH_PROVIDERS`: `google`, `apple` o `google,apple`. Vacío = sin
  botones. Encender solo después de configurar el proveedor (§7).

- `CRON_SECRET`: valor aleatorio largo. Vercel lo manda al cron de
  recordatorios de inscripciones (`vercel.json`, diario 13:00 UTC = 9:00
  a. m. en PR). Sin él, el cron responde 401 y no salen recordatorios.
- `NEXT_PUBLIC_SITE_URL` (opcional): dominio público para mostrar el
  enlace de las formas de inscripción. Por defecto
  `https://ciudaddeavivamiento.org`.
- Orden: aplicar la migración `0040` **antes** de desplegar el código que
  la usa (la página de actividades lee sus columnas nuevas).

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

## 7. Acceso con Google y Apple (0052)

El código ya está; falta configurar los proveedores. `<ref>` es el id del
proyecto de Supabase (producción: `ccempuwuefjnaarmxbkz`) y `<app>` el
dominio de la app (`NEXT_PUBLIC_APP_URL`). Ningún secreto va en el código
ni en el repositorio: se pegan solo en el panel de Supabase.

### Orden

1. Aplicar `0052` en producción **antes** de desplegar el código:
   `npx supabase db push --db-url "postgresql://postgres.<ref>:<password>@<host-pooler>:5432/postgres"`.
   Sin la columna `profile_completed_at`, la app mandaría a todas las
   cuentas a "Completa tu perfil".
2. Desplegar el código (los botones siguen ocultos).
3. Configurar Google y/o Apple (abajo).
4. En Vercel → Settings → Environment Variables (Production):
   `AUTH_OAUTH_PROVIDERS=google,apple` (o solo uno) y volver a desplegar.
5. Probar con una cuenta real: primer acceso → "Completa tu perfil";
   salir sin guardar y volver → lo pide otra vez; guardar → entra; tercer
   acceso → entra directo.

### Supabase (ambos proveedores)

- Authentication → URL Configuration:
  - Site URL: `https://<app>`.
  - Redirect URLs: `https://<app>/auth/callback**` (y en el proyecto de
    desarrollo `http://localhost:3000/auth/callback**`).
- La URL de retorno que piden Google y Apple es la de Supabase:
  `https://<ref>.supabase.co/auth/v1/callback` (aparece en el panel de
  cada proveedor).
- Si el email del proveedor ya tiene cuenta (verificada), Supabase la
  vincula a esa misma cuenta: no se crea otra persona.

### Google Cloud

1. console.cloud.google.com → crear o elegir un proyecto.
2. Google Auth Platform → Branding (pantalla de consentimiento): nombre de
   la app, email de soporte, logo opcional, dominios autorizados
   (`<app>` sin `https://` y `supabase.co`), enlace al aviso de privacidad
   (`https://ciudaddeavivamiento.org/privacidad`).
3. Audience: External. Publicar la app ("In production"); en modo
   "Testing" solo entran los usuarios de prueba agregados.
4. Data access: solo `openid`, `.../auth/userinfo.email` y
   `.../auth/userinfo.profile` (no requieren verificación de Google).
5. Clients → Create client → Web application:
   - Authorized JavaScript origins: `https://<app>` (y
     `http://localhost:3000` si se usa en desarrollo).
   - Authorized redirect URIs: `https://<ref>.supabase.co/auth/v1/callback`.
6. Copiar Client ID y Client secret → Supabase → Authentication → Sign In /
   Providers → Google → activar, pegar ambos, guardar.

### Apple Developer (requiere la membresía pagada del Apple Developer Program)

1. Certificates, Identifiers & Profiles → Identifiers → App IDs: crear (o
   usar) un App ID con la capacidad **Sign in with Apple**. Anotar el
   Team ID (arriba a la derecha).
2. Identifiers → **Services IDs** → registrar uno, p. ej.
   `org.ciudaddeavivamiento.web`. Este es el "Client ID" para Supabase.
   Activar Sign in with Apple → Configure:
   - Primary App ID: el del paso 1.
   - Domains and Subdomains: `<ref>.supabase.co`.
   - Return URLs: `https://<ref>.supabase.co/auth/v1/callback`.
3. Keys → crear una key con Sign in with Apple (asociada al App ID).
   Descargar el `.p8` (solo se puede una vez) y anotar el Key ID.
4. Generar el "secret" (un JWT firmado con el `.p8`, Team ID, Key ID y
   Services ID) con la herramienta de la guía de Apple en la documentación
   de Supabase. **Vence a los 6 meses como máximo**: anotar la fecha y
   renovarlo antes, o el acceso con Apple dejará de funcionar.
5. Supabase → Authentication → Sign In / Providers → Apple → activar,
   Client IDs: el Services ID; Secret Key: el JWT; guardar.
6. "Ocultar mi email": Apple entrega una dirección
   `@privaterelay.appleid.com`. Para que los emails de la app (Resend)
   lleguen ahí, registrar el dominio y el remitente en Apple Developer →
   Services → Sign in with Apple for Email Communication (requiere SPF del
   dominio de envío).

## 8. Registro central de personas (0054)

1. Aplicar `0054` **antes** de desplegar el código (el directorio, Visitantes
   y Ministerios llaman a sus funciones):
   `npx supabase db push --db-url "postgresql://postgres.<ref>:<password>@<host-pooler>:5432/postgres"`.
   No une datos existentes.
2. La vinculación por código usa Resend (`RESEND_API_KEY`,
   `RESEND_FROM_EMAIL`, ya configurados) y la service_role key en el
   servidor. Sin Resend la app ofrece la revisión por un administrador.
3. SMS: no configurado (ver `docs/person-registry.md` §5).

## Alta de una iglesia nueva

1. Crear el proyecto en Supabase (región cercana a la iglesia). Guardar
   la contraseña de la base en un gestor de contraseñas.
2. Crear `.env.production.local` (ignorado por git) con la URL, la anon
   key y la service role key del proyecto nuevo.
3. Aplicar las migraciones con el connection string del **Session
   pooler** (IPv4):
   `npx supabase db push --db-url "postgresql://postgres.<ref>:<password>@<host-pooler>:5432/postgres"`
4. Copiar `church.example.json` a `<iglesia>.local.json` (ignorado por
   git) con las cuentas iniciales reales y correr:
   `npx tsx --env-file=.env.production.local scripts/bootstrap-church.ts <iglesia>.local.json`
   El script se niega a correr contra el proyecto de demo. Sin SMTP
   configurado, agregar `--temp-passwords` (quedan en
   `church-passwords.local.txt`; entregarlas en privado y borrar).
5. En Supabase → Authentication → URL Configuration: Site URL = dominio
   de la iglesia; Redirect URLs = `https://<dominio>/auth/callback`.
6. Configurar SMTP propio (Resend) en Authentication → Emails.
7. En Vercel: variables de entorno de producción apuntando al proyecto
   nuevo y dominio conectado. Publicar solo con autorización explícita.
