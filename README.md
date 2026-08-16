# Iglesia App

Aplicación web para la administración integral de una iglesia local:
personas y visitantes, cursos y clases, matrícula/asistencia/progreso,
importación de datos, seguimiento de visitantes, portal del miembro,
check-in por QR, peticiones de oración confidenciales, notificaciones y
encuestas, y reportes.

Interfaz en español. Ver [`CLAUDE.md`](CLAUDE.md) para las reglas e
instrucciones permanentes del proyecto, y [`docs/`](docs/) para toda la
documentación (requisitos, arquitectura, modelo de datos, seguridad,
etc). El estado actual y lo que falta está en
[`docs/progress.md`](docs/progress.md).

## Stack

Next.js (App Router) · TypeScript estricto · Supabase (Postgres + Auth +
Row Level Security) · Tailwind CSS + shadcn/ui · Zod · React Hook Form ·
Playwright · Resend.

## Empezar

```bash
npm install
cp .env.example .env.local   # completa con las credenciales de tu proyecto Supabase
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### Base de datos

```bash
npx supabase link --project-ref TU_PROJECT_ID
npx supabase db push          # aplica supabase/migrations/
npm run seed                  # datos sintéticos de desarrollo (nunca en producción)
```

Ver [`docs/deployment.md`](docs/deployment.md) para el detalle completo,
incluyendo cómo otorgar el primer rol de `administrador`.

## Comandos

```bash
npm run dev            # servidor de desarrollo
npm run build          # build de producción
npm run lint            # ESLint
npm run typecheck        # TypeScript
npm run format             # Prettier
npm run check                # lint + typecheck + format:check
npm run test:e2e               # Playwright
npm run seed                     # datos sintéticos
```

## Documentación

| Documento                                                        | Contenido                                       |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                                         | Reglas e instrucciones permanentes del proyecto |
| [`docs/product-requirements.md`](docs/product-requirements.md)   | Alcance y prioridades                           |
| [`docs/architecture.md`](docs/architecture.md)                   | Arquitectura técnica                            |
| [`docs/data-model.md`](docs/data-model.md)                       | Modelo de datos                                 |
| [`docs/roles-and-permissions.md`](docs/roles-and-permissions.md) | Matriz de permisos                              |
| [`docs/security.md`](docs/security.md)                           | RLS, amenazas, mitigaciones                     |
| [`docs/import-process.md`](docs/import-process.md)               | Importación y deduplicación                     |
| [`docs/testing.md`](docs/testing.md)                             | Estrategia de pruebas                           |
| [`docs/deployment.md`](docs/deployment.md)                       | Despliegue                                      |
| [`docs/assumptions.md`](docs/assumptions.md)                     | Supuestos tomados                               |
| [`docs/decisions.md`](docs/decisions.md)                         | Registro de decisiones técnicas                 |
| [`docs/progress.md`](docs/progress.md)                           | Estado actual y próxima tarea                   |
