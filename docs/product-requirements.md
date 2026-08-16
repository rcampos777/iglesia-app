# Requisitos del producto

## 1. Visión

Centralizar la administración de una iglesia local en una sola aplicación
web seria, segura y usable desde el celular, reemplazando hojas de Excel,
bases de Access y papel.

## 2. Usuarios objetivo

- **Pastor / Administrador**: visión completa, configuración, reportes.
- **Coordinador de ministerio**: gestiona personas, cursos y visitantes de
  su área.
- **Maestro**: gestiona sus propias clases, matrícula y asistencia.
- **Seguimiento**: da seguimiento a visitantes.
- **Intercesor**: atiende peticiones de oración.
- **Miembro**: usa el portal del miembro (su información, sus cursos, sus
  peticiones).

## 3. Módulos (alcance del MVP)

1. **Directorio de personas** — miembros y visitantes, un registro único
   por persona, con o sin cuenta de usuario.
2. **Cursos y clases** — categorías configurables (hombres, mujeres,
   adoración, nuevos convertidos, liderazgo, otros), catálogo de cursos,
   clases/cohortes con horario.
3. **Matrícula, asistencia y progreso** — inscripción a clases, asistencia
   por sesión, porcentaje de progreso.
4. **Importación de datos** — Excel, CSV, exportaciones de Access, vía
   staging + revisión humana + deduplicación asistida.
5. **Entrada manual de registros en papel** — formularios optimizados
   para captura rápida de registros históricos.
6. **Visitantes y retención** — registro de primera visita, asignación de
   seguimiento, bitácora de contactos.
7. **Portal del miembro** — perfil propio, cursos, asistencia, peticiones
   de oración propias.
8. **Check-in por QR** — check-in de servicios escaneando un QR personal.
9. **Peticiones de oración confidenciales** — acceso restringido y
   auditado.
10. **Notificaciones, emails y encuestas** — envío vía Resend, encuestas
    simples.
11. **Paneles y reportes** — métricas clave por rol.

## 4. Fuera de alcance del MVP

- Gestión financiera/donaciones.
- Facturación o pagos.
- Información sensible detallada de menores (más allá de un flag
  informativo `is_minor`).
- Multi-iglesia / multi-tenant (se asume una sola congregación por
  despliegue).
- App móvil nativa (se cubre con diseño responsive web).
- Integración en vivo con Microsoft Access (solo se soportan
  exportaciones a CSV/Excel de Access).

Ver `docs/assumptions.md` para supuestos adicionales tomados sin
confirmación explícita del usuario.

## 5. Requisitos no funcionales

- **Español** como idioma de la interfaz.
- **Responsive**: uso principal esperado desde celular en el
  check-in/portal; escritorio para administración.
- **Seguridad**: RLS en toda tabla expuesta, autorización en servidor y
  BD, auditoría de accesos a datos sensibles.
- **Accesibilidad básica**: labels en formularios, contraste adecuado,
  navegación por teclado en flujos clave.
- **Sin datos reales en desarrollo/pruebas**: solo datos sintéticos.

## 6. Orden de prioridad de implementación

Ver la tabla de fases en [`docs/progress.md`](progress.md).
