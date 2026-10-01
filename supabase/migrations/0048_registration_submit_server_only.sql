-- CAPTCHA en la forma pública de inscripción (2026-10-01, docs/security.md
-- §8.n). La llave anónima es pública: si el público pudiera llamar
-- submit_activity_registration() directo, un bot se saltaría el CAPTCHA,
-- la trampa y el tiempo mínimo. Desde ahora solo la llama el servidor de
-- la app (service_role), después de verificar el CAPTCHA.
-- public_registration_activity() (solo lectura de la actividad) sigue
-- siendo pública.

revoke execute on function submit_activity_registration(
  text, text, text, text, integer, text, text, text, text, boolean, text, boolean, text, boolean
) from anon, authenticated, public;

grant execute on function submit_activity_registration(
  text, text, text, text, integer, text, text, text, text, boolean, text, boolean, text, boolean
) to service_role;

notify pgrst, 'reload schema';
