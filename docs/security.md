# Seguridad

## 1. Modelo de amenazas (resumen)

| Amenaza                                                     | Mitigación                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Un usuario ve/edita datos de otra persona sin permiso       | RLS en toda tabla + revalidación en servidor                                                        |
| Escalación de privilegios (un miembro se autoasigna un rol) | `user_roles` solo escribible por `administrador`/`pastor` vía RLS; nunca expuesto a escritura libre |
| Fuga de peticiones de oración                               | RLS estricta + auditoría de acceso + emails sin contenido                                           |
| QR de check-in reutilizado/falsificado                      | Token HMAC firmado de corta vigencia, no el `person_id` en crudo                                    |
| Import masivo crea duplicados o pisa datos reales           | Staging obligatorio + revisión humana + sin fusión automática                                       |
| Fuga de datos reales en un entorno de desarrollo            | Prohibido por convención (`docs/testing.md`) + `.gitignore` bloquea archivos de datos               |
| Secretos en el repositorio                                  | `.gitignore` + revisión de `git status`/`git diff` antes de commitear                               |
| Uso indebido de la `service_role key`                       | Aislada en `src/lib/supabase/admin.ts`, nunca en código de cliente, uso justificado caso por caso   |

## 2. Row Level Security (RLS)

- **Todas** las tablas expuestas tienen `alter table ... enable row level
security;` en la misma migración donde se crean.
- Las políticas usan funciones auxiliares (`has_role`, `has_any_role`,
  `is_staff`, `is_admin`, `current_person_id`) para evitar duplicar lógica
  y mantenerla auditable en un solo lugar (`0002_roles.sql`,
  `0004_profiles.sql`).
- Ninguna política usa `using (true)` para escritura. Las de lectura
  amplia (`auth.uid() is not null`) se reservan para catálogos no
  sensibles (categorías de curso, cursos, clases, servicios).

## 3. Autorización en el servidor

- Cada Server Action valida el rol del usuario **antes** de intentar la
  operación (ver `src/lib/auth/require-role.ts`), para poder devolver un
  error claro en español — la RLS es la última línea de defensa, no la
  primera experiencia de error del usuario.
- Ninguna ruta de API confía en un `role` u otro dato de autorización
  enviado por el cliente en el body/query; siempre se deriva de la
  sesión (`auth.uid()`) en el servidor.

## 4. Peticiones de oración

- Acceso de lectura restringido por RLS a: intercesor, pastor,
  administrador, la persona asignada, o el autor (si no es anónimo).
- Toda lectura de **detalle** de una petición pasa por
  `src/lib/data/prayer-requests.ts`, que llama a
  `log_prayer_request_access(id)` (función `security definer`) para
  dejar constancia en `prayer_request_access_log`. Postgres no dispara
  triggers en `SELECT`, así que esta auditoría depende de que toda
  lectura de detalle pase por esa función — es una invariante de la capa
  de aplicación, documentada aquí para que no se rompa accidentalmente
  agregando un `select` directo desde un componente cliente.
- Los emails relacionados con una petición (ej. "tienes una nueva
  petición asignada") **nunca** incluyen `content`; solo un aviso
  genérico con link a la app, donde el acceso vuelve a pasar por RLS +
  auditoría.

## 5. Check-in por QR

- El QR de una persona no codifica su `person_id` en texto plano de
  forma permanente. Codifica un token firmado (HMAC-SHA256 con
  `QR_CHECKIN_SECRET`) que incluye `person_id` + `exp` (expiración
  corta). Ver `src/lib/checkin/token.ts`.
- `POST /api/checkin/scan` valida la firma y expiración en el servidor
  antes de crear el `service_checkin`, usando el cliente Supabase de
  servidor con la sesión del operador (respeta RLS, no usa
  `service_role`).
- Si el token expiró, se rechaza con un mensaje claro para regenerar el
  QR (el portal del miembro puede regenerarlo bajo demanda).

## 6. Importación de datos

Ver `docs/import-process.md` para el flujo completo. Resumen de
controles: staging obligatorio, validación Zod, matching asistido sin
auto-fusión, sin notificaciones automáticas, y todas las promociones
pasan por `promote_import_row()` que respeta RLS (solo roles
autorizados pueden invocarla con éxito).

## 7. Manejo de secretos

- `.env.local` (no versionado) contiene todos los secretos reales.
- `.env.example` documenta las variables sin valores reales.
- La `service_role key` de Supabase solo se usa server-side, en
  operaciones explícitamente marcadas como administrativas.
- `QR_CHECKIN_SECRET` y `RESEND_API_KEY` nunca se exponen a
  `NEXT_PUBLIC_*`.

## 8. Auditoría realizada (2026-08-16)

- **RLS**: confirmado programáticamente que las 24 tablas creadas en
  `supabase/migrations/` tienen `enable row level security` (coinciden
  1:1 con las tablas creadas).
- **Guards de autorización**: confirmado que cada función exportada en
  cada archivo `"use server"` del área autenticada invoca
  `requireRole`/`requireAuth` antes de operar.
- **Inyección de filtros PostgREST**: se encontró y corrigió
  interpolación sin sanitizar de entradas de usuario (búsqueda del
  directorio, matching de duplicados de importación) en filtros
  `.or()`/`.ilike()`. RLS ya acotaba el impacto real — un filtro
  manipulado no puede saltarse RLS, Postgres la sigue aplicando
  siempre — pero se corrigió con `src/lib/supabase/filter-utils.ts`
  para evitar romper consultas o alterar de forma inesperada qué filas
  ya visibles para el usuario se listan.
- **No verificado todavía** (requiere una base de datos real): las
  políticas RLS no se han probado en la práctica contra Postgres — ver
  `docs/progress.md` para el estado y qué falta.

## 9. Datos de menores

Por ahora el modelo solo guarda `people.is_minor` (derivado de
`birth_date`) como dato informativo. No se implementa manejo especial de
consentimiento parental, contactos de emergencia, ni restricciones
adicionales de visualización de menores — se documenta como decisión
pendiente en `docs/assumptions.md` hasta recibir requisitos explícitos
del usuario (regla explícita: "no implementes información detallada de
menores sin requisitos explícitos").

## 10. Checklist de revisión de seguridad antes de producción

Ver la sección correspondiente en `docs/deployment.md`.
