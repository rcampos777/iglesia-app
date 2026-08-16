# Supuestos

Decisiones tomadas sin confirmación explícita del usuario, para no
bloquear el avance. Revisar y corregir si no reflejan la realidad de la
iglesia.

1. **Una sola congregación por despliegue** (no multi-tenant). Si en el
   futuro se necesita administrar varias sedes/iglesias desde la misma
   instancia, requiere una decisión de arquitectura nueva (registrar en
   `docs/decisions.md`).
2. **Idioma**: interfaz 100% en español. No se planeó internacionalización
   (i18n) en el MVP; si se necesita inglés u otro idioma, se puede
   introducir `next-intl` más adelante sin rediseñar el modelo de datos.
3. **Menores de edad**: solo se guarda `people.is_minor` (derivado de
   fecha de nacimiento) como dato informativo. No se implementó
   consentimiento parental, contacto de emergencia obligatorio, ni
   restricciones especiales de visualización — pendiente de requisitos
   explícitos (regla del usuario: no implementar esto sin pedirlo).
4. **Sin gestión financiera**: el MVP no incluye diezmos, ofrendas ni
   donaciones. Se asume que ese dominio, si existe, vive en otro sistema
   por ahora.
5. **Acceso a Microsoft Access**: se asume que el usuario exporta desde
   Access a CSV/Excel manualmente; la app no abre archivos `.mdb`/`.accdb`
   directamente (requeriría un driver/servicio adicional fuera del
   alcance de una app web en Vercel).
6. **Un check-in por persona por servicio**: `service_checkins` tiene
   `unique(service_id, person_id)`. Si un mismo servicio necesita
   múltiples check-ins (ej. entrar y salir), esto debe revisarse.
7. **`membership_status` por defecto al importar**: `asistente_habitual`
   si el archivo no especifica estatus, en vez de `visitante` o
   `miembro`, para no sobre/sub-declarar membresía formal sin evidencia.
8. **Primer administrador**: se otorga manualmente vía SQL con la
   `service_role key` (ver `docs/deployment.md`), no hay endpoint de
   auto-elevación por razones de seguridad.
9. **Entorno de desarrollo sin Docker/Supabase CLI disponibles** en esta
   iteración: no se pudo levantar Postgres local para ejecutar las
   migraciones contra una base real ni probar RLS de punta a punta. El
   código, migraciones y pruebas están escritos y listos; falta
   ejecutarlos contra un proyecto Supabase real (local con Docker, o
   Supabase Cloud) — ver `docs/progress.md`.
10. **Fotos de perfil**: se asume el uso de Supabase Storage (bucket
    `people-photos`) para `people.photo_url`; el bucket y sus políticas
    de Storage aún no están creados en migraciones (pendiente, ver
    `docs/progress.md`) — hasta entonces `photo_url` puede quedar vacío.
