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

## 5. Estado actual

Ver `docs/progress.md` para qué pruebas existen realmente hoy en
`tests/e2e/` versus qué queda pendiente. Esta sección describe el
objetivo, no necesariamente el 100% ya implementado.
