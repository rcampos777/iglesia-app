# CLAUDE.md — Instrucciones permanentes del proyecto

Este archivo contiene las instrucciones que **cualquier agente o desarrollador**
debe seguir al trabajar en este repositorio. Léelo completo antes de escribir
código. Los documentos detallados están en [`docs/`](docs/).

## 1. Qué es este proyecto

Aplicación web para la administración integral de una iglesia local:
personas/miembros/visitantes, cursos y clases, matrícula/asistencia/progreso,
importación de datos legados (Excel/CSV/Access), seguimiento de visitantes,
portal del miembro, check-in por QR, peticiones de oración confidenciales,
notificaciones/emails/encuestas, y paneles de reportes.

La interfaz es **en español**. El código, comentarios (mínimos) y commits
están en **inglés o español simple**, prioriza claridad sobre convención.

## 2. Stack tecnológico (no cambiar sin registrar decisión en `docs/decisions.md`)

- **Next.js (App Router)** — Vercel-first, Server Components por defecto.
- **TypeScript estricto** (`strict: true` + `noUncheckedIndexedAccess`, etc).
- **PostgreSQL vía Supabase** (Auth + DB + Row Level Security).
- **Tailwind CSS v4** + **shadcn/ui** (Radix) para componentes.
- **Zod** para validación de datos (client y server).
- **React Hook Form** para formularios.
- **Playwright** para pruebas E2E.
- **Resend** para envío de emails transaccionales.

## 3. Reglas de negocio inquebrantables

Estas reglas vienen directas del dueño del producto y **no se negocian**
sin una decisión explícita registrada en `docs/decisions.md`:

1. **Una persona = un solo registro.** Nunca se crean registros duplicados
   de la misma persona a propósito. Ver `docs/import-process.md` para el
   proceso de detección/fusión de duplicados.
2. **Una persona puede existir sin cuenta de usuario.** La tabla `people`
   es independiente de `auth.users`. No todo `person` tiene login.
3. **Nunca usar nombres como identificador único.** Todo `person` tiene un
   `id` UUID generado por la base de datos. Nombres, teléfonos y emails
   pueden repetirse o cambiar.
4. **Nunca importar archivos directamente a tablas finales.** Toda
   importación pasa por tablas de staging (`import_batches`,
   `import_rows`), validación con Zod, y revisión humana antes de
   promover datos a tablas reales.
5. **Nunca fusionar duplicados inciertos automáticamente.** La fusión de
   posibles duplicados siempre requiere confirmación humana explícita.
6. **Los datos importados no disparan emails/notificaciones automáticas.**
   Solo acciones realizadas por un usuario dentro de la app (o programadas
   explícitamente) pueden encolar notificaciones.
7. **Nunca usar datos personales reales en desarrollo o pruebas.** Usar
   siempre los generadores de datos sintéticos (`scripts/seed.ts`).
8. **Nunca commitear secretos ni archivos personales.** Ver `.gitignore`.
   Si accidentalmente se agrega un archivo con datos reales, deténte y
   avisa al usuario — no lo elimines silenciosamente del historial.
9. **Toda tabla expuesta vía Supabase debe tener Row Level Security (RLS)
   habilitado**, con políticas explícitas. Ninguna tabla nueva se despliega
   sin RLS. Ver `docs/security.md`.
10. **La autorización se aplica en el servidor Y en la base de datos**
    (defensa en profundidad). Nunca confiar solo en ocultar UI en el
    cliente.
11. **Las peticiones de oración tienen acceso restringido y auditado.**
    Solo el rol Intercesor, el Administrador, y el **líder del ministerio
    de intercesión** (o el autor) pueden leerlas. El rol `pastor` por sí
    solo **no** da acceso — ver decisión del 2026-09-02 en
    `docs/decisions.md`. El ministerio de intercesión se designa con el
    flag `ministries.grants_prayer_access`, que solo un administrador
    puede cambiar (RPC `set_prayer_ministry`, protegido además por
    trigger). Todo acceso de lectura queda registrado en
    `prayer_request_access_log`.
12. **Los emails sobre peticiones de oración nunca incluyen el texto
    completo de la petición** — solo un aviso genérico con link a la app.
13. **No se implementa información detallada de menores de edad** sin
    requisitos explícitos adicionales (consentimiento, custodia, etc). Por
    ahora `people.is_minor` es un flag informativo; no se recopilan datos
    sensibles adicionales de menores.
14. **No publicar en producción sin autorización explícita del usuario.**

## 4. Roles mínimos (RBAC)

`miembro`, `maestro`, `seguimiento`, `intercesor`, `coordinador_ministerio`,
`pastor`, `administrador`.

- Un usuario puede tener **múltiples roles** simultáneamente.
- **`pastor` NO equivale a administrador.** En esta iglesia hay muchos
  pastores de áreas distintas, y varios son pastores de título sin nada a
  su cargo; el rango más alto son los apóstoles. Por eso `pastor` es un
  rol **acotado**: ve y gestiona las clases que imparte y los ministerios
  que lidera, no la administración del sistema. Solo `administrador`
  otorga roles y ve todo.
- Aplica siempre el **mínimo acceso necesario** (principio de menor
  privilegio) al diseñar una política RLS o un chequeo de permisos.
- Ver `docs/roles-and-permissions.md` para la matriz completa de permisos
  por módulo.

## 5. Cuándo detenerse y pedir al usuario

Trabaja de forma autónoma y continua. **Detente solo si necesitas:**

- Credenciales reales de Supabase, Resend, Vercel u otro servicio externo.
- Una decisión de negocio que cambie significativamente el producto.
- Autorización para eliminar o sobrescribir datos reales.
- Autorización para crear recursos pagados.
- Autorización para publicar en producción (`vercel --prod` o equivalente).

Si faltan credenciales: implementa/continúa con una alternativa local o
simulada (ej. Supabase local vía CLI, o mocks documentados), anota lo
pendiente en `docs/progress.md` y sigue con el resto del trabajo. No
esperes a que el usuario responda para continuar otras tareas.

## 6. Ciclo de trabajo autónomo

1. Lee este archivo y los documentos relevantes en `docs/`.
2. Revisa `docs/progress.md` para ver el estado actual.
3. Selecciona la tarea incompleta de mayor prioridad (ver orden en
   `docs/progress.md` / PRD).
4. Implementa la funcionalidad completa (UI + server actions/route
   handlers + validación + RLS + tests).
5. Ejecuta: `npm run format`, `npm run lint`, `npm run typecheck`,
   `npm run test:e2e` (si aplica), `npm run build`.
6. Prueba manualmente el flujo afectado (usa el navegador si es UI).
7. Corrige la causa raíz de cualquier problema (no soluciones cosméticas).
8. Añade pruebas contra regresiones cuando el bug era real.
9. Revisa: seguridad/RLS, permisos por rol, responsive/móvil,
   accesibilidad básica (labels, contraste, foco, `aria-*`).
10. Actualiza la documentación afectada y `docs/progress.md`.
11. Continúa con la siguiente tarea de mayor prioridad.

## 7. Definición de "terminado"

Una funcionalidad no se marca completa hasta que:

- [ ] Funciona de principio a fin (UI real, no solo mocks).
- [ ] Tiene autorización y validación (cliente Zod + servidor + RLS).
- [ ] Maneja errores de forma explícita (mensajes claros en español).
- [ ] Tiene pruebas apropiadas (unitarias y/o E2E Playwright).
- [ ] Funciona en móvil (verificado con viewport angosto).
- [ ] Pasa `npm run lint` y `npm run typecheck` sin errores.
- [ ] Pasa `npm run build` (producción).
- [ ] Está documentada en el doc correspondiente de `docs/`.
- [ ] `docs/progress.md` está actualizado.

## 8. Comandos principales

```bash
npm run dev          # servidor de desarrollo
npm run build        # build de producción
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run format         # Prettier (escribe)
npm run format:check   # Prettier (verifica)
npm run check          # lint + typecheck + format:check
npm run test:e2e        # Playwright
npm run seed             # genera datos sintéticos de desarrollo
```

Supabase local (requiere Supabase CLI, ver `docs/deployment.md`):

```bash
npx supabase start          # levanta Postgres/Auth/Storage local
npx supabase db reset       # aplica migrations/ + seed/ desde cero
npx supabase migration new NOMBRE
```

## 9. Estructura de carpetas

```
src/
  app/                # Next.js App Router
    (auth)/            # login, registro, recuperar-contraseña
    (app)/              # área autenticada (layout con nav + guard de rol)
    api/                 # route handlers (webhooks, QR, export, etc.)
  components/
    ui/                   # shadcn/ui (generado, no editar a mano el core)
    layout/ people/ courses/ attendance/ visitors/ checkin/ prayer/
    import/ dashboard/
  lib/
    supabase/             # clientes browser/server/middleware
    auth/                  # helpers de sesión y permisos
    validations/            # esquemas Zod compartidos
    data/                    # data access layer (server-only)
  types/                      # tipos generados de Supabase + dominio
supabase/
  migrations/                  # SQL versionado (fuente de verdad del esquema)
  seed/                          # datos sintéticos versionados
scripts/                          # scripts Node (seed, utilidades)
tests/e2e/                         # Playwright
docs/                                # documentación del proyecto
```

## 10. Convenciones de código

- Server Components por defecto; `"use client"` solo cuando se necesita
  interactividad/estado/efectos.
- Mutaciones vía **Server Actions** o **Route Handlers**, nunca lógica de
  negocio sensible en el cliente.
- Todo input externo (formularios, importación, query params) se valida
  con **Zod** antes de tocar la base de datos.
- El data access layer (`src/lib/data/*`) es la única capa que llama a
  Supabase directamente desde el servidor; los componentes no llaman a
  Supabase inline salvo casos triviales de lectura ya filtrados por RLS.
- No crear abstracciones para casos hipotéticos futuros. Preferir
  duplicación pequeña sobre indirección prematura.
- Comentarios solo cuando el _por qué_ no es obvio.
- Commits pequeños y descriptivos; no usar `--no-verify`.
- **`src/types/database.ts`: los tipos `Row`/`Insert`/`Update` deben
  declararse con `type X = {...}`, nunca con `interface X {...}`.** Con
  la versión instalada de `@supabase/supabase-js`/`postgrest-js`, usar
  `interface` para esos tipos hace que el cliente tipado
  (`createClient<Database>()`) resuelva las consultas (`.from(...).select(...)`)
  como `never` silenciosamente (sin error en la definición, solo al
  usarlas). Ya se corrigió una vez; no reintroducir el patrón.

## 11. Documentos del proyecto

| Documento                                                        | Contenido                                      |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| [`docs/product-requirements.md`](docs/product-requirements.md)   | Alcance, módulos, prioridades                  |
| [`docs/architecture.md`](docs/architecture.md)                   | Arquitectura técnica                           |
| [`docs/data-model.md`](docs/data-model.md)                       | Modelo de datos y ERD                          |
| [`docs/roles-and-permissions.md`](docs/roles-and-permissions.md) | Matriz de permisos                             |
| [`docs/security.md`](docs/security.md)                           | RLS, amenazas, mitigaciones                    |
| [`docs/import-process.md`](docs/import-process.md)               | Proceso de importación y deduplicación         |
| [`docs/testing.md`](docs/testing.md)                             | Estrategia de pruebas                          |
| [`docs/deployment.md`](docs/deployment.md)                       | Despliegue en Vercel + Supabase                |
| [`docs/assumptions.md`](docs/assumptions.md)                     | Supuestos tomados sin confirmar con el usuario |
| [`docs/decisions.md`](docs/decisions.md)                         | Registro de decisiones técnicas (ADR ligero)   |
| [`docs/progress.md`](docs/progress.md)                           | Estado actual, próxima tarea                   |
