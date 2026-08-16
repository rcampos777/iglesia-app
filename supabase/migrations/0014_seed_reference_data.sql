-- Datos de referencia (no sintéticos, no personales): categorías de
-- curso por defecto. Seguro de aplicar en cualquier ambiente, incluido
-- producción. Los datos de prueba con personas van en scripts/seed.ts,
-- nunca aquí.

insert into course_categories (code, name, description) values
  ('hombres', 'Hombres', 'Cursos y clases del ministerio de hombres'),
  ('mujeres', 'Mujeres', 'Cursos y clases del ministerio de mujeres'),
  ('adoracion', 'Adoración', 'Formación para el equipo de adoración'),
  ('nuevos_convertidos', 'Nuevos convertidos', 'Discipulado inicial para nuevos creyentes'),
  ('liderazgo', 'Liderazgo', 'Formación de líderes y servidores'),
  ('otros', 'Otros', 'Otros cursos y clases no clasificados')
on conflict (code) do nothing;
