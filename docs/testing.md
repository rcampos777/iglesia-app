# Estrategia de pruebas

## 1. Regla dura

**Nunca usar datos personales reales en pruebas o desarrollo.** Todo
dato de prueba viene de `scripts/seed.ts` (sintético, generado
programáticamente) o de fixtures explícitamente inventados en
`tests/e2e/fixtures/`.

## 2. Niveles

- **Tipos y lint** (`npm run typecheck`, `npm run lint`): primera línea
  de defensa, corren en cada iteración.
- **E2E con Playwright** (`npm run test:e2e`): cubren los flujos
  críticos de principio a fin contra una instancia de Supabase local
  (o de pruebas) con datos sembrados por `scripts/seed.ts`.
- **Pruebas manuales guiadas**: para UI, antes de marcar una tarea como
  terminada, se verifica en el navegador (incluyendo viewport móvil).

## 3. Qué cubrir con Playwright (prioridad)

1. Login/logout y protección de rutas por rol.
2. Alta de persona + que no se pueda duplicar por accidente desde la UI
   normal (fuera del flujo de importación).
3. Crear curso → clase → matricular → tomar asistencia → ver progreso.
4. Flujo de importación: subir CSV sintético → revisar → aprobar
   nuevo/fusionar → verificar que aparece en el directorio.
5. Registrar visitante → crear seguimiento → cambiar estado.
6. Enviar petición de oración como miembro → verificar que un `miembro`
   sin rol de intercesor **no puede ver el detalle de otra petición**
   (prueba negativa de seguridad, no solo positiva).
7. Generar QR de una persona → simular escaneo → verificar check-in.
8. Portal del miembro: ver solo los propios datos.

Las pruebas de seguridad (acceso denegado) son tan importantes como las
de flujo feliz — cada módulo sensible (personas, oración, roles) debe
tener al menos una prueba que confirme que un rol _sin_ permiso recibe
un error, no un dato parcial.

## 4. Entorno de pruebas

- Local: `supabase start` (Supabase CLI + Docker) levanta Postgres/Auth
  local; `supabase db reset` aplica `supabase/migrations/` +
  `supabase/seed/` desde cero.
- `npm run seed` puebla datos sintéticos adicionales vía
  `@supabase/supabase-js` con la `service_role key` local.
- Playwright usa `NEXT_PUBLIC_APP_URL` apuntando al servidor de
  desarrollo (`npm run dev`) y usuarios sintéticos creados por el seed
  (ver `docs/assumptions.md` para las credenciales de prueba estándar).

## 4.b Scripts de verificación de seguridad (autocontenidos)

`scripts/verify-security-phase1.ts` (`npm run verify:phase1`) prueba
contra Postgres real, sin depender de datos sembrados: suplantación de
identidad vía metadata pública, auto-reasignación de `profiles.person_id`,
el camino legítimo de invitación de portal, el ámbito real de `pastor`
en cursos/ministerios, y la escalada de acceso a oración vía membresía
(otorgamiento bloqueado para no-admin, revocación sí permitida). Crea y
borra sus propios datos sintéticos (prefijo `verif-phase1-`). Requiere
`0027`/`0028`/`0029` aplicadas. Se agregan scripts equivalentes según se
auditen las fases siguientes.

`scripts/verify-permissions-management.ts` (`npm run verify:permissions`)
cubre la gestión de permisos vía "Cuenta y permisos" (`0030`): persona
sin cuenta, no-op sin escritura/auditoría, guardado transaccional con
auditoría completa, un fallo no deja cambios parciales, protección de
último administrador (incluso vía DELETE directo con service_role, para
ejercitar el trigger), ediciones concurrentes con `STALE_ROLES`, roles
sin privilegio de admin rechazados en las tres RPC nuevas, escritura
directa a `user_roles` ahora bloqueada por RLS, Mi portal sin
regresión, y búsqueda/paginación de `list_users_with_roles`. Mismo
patrón de datos sintéticos autocontenidos (prefijo `verif-perms-`).
Requiere `0030` aplicada (después de `0029`).

## 5. Estado actual

Implementado: `tests/e2e/auth.spec.ts` — smoke tests que **no** requieren
base de datos (renderizado de páginas públicas, protección de rutas).
Corren con `npm run test:e2e` contra `npm run dev`.

Pendiente (bloqueado por no tener un proyecto Supabase real disponible,
ver `docs/progress.md`): toda la lista de la sección 3 que requiere
datos/sesión reales. Cuando haya credenciales, sembrar con
`npm run seed` (crea cuentas de prueba, una por rol, contraseña
`Iglesia2026!Dev` — ver `scripts/seed.ts`) y escribir esas pruebas.
