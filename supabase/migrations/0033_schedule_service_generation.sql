-- Programa la generación diaria de cultos recurrentes con pg_cron (incluido
-- en todos los planes de Supabase; corre dentro de la base de datos, sin
-- endpoint HTTP que alguien pueda invocar).
--
-- 04:15 UTC = 12:15 a. m. en Puerto Rico (UTC-4 todo el año).
-- cron.schedule() con el mismo nombre reemplaza el trabajo existente, así
-- que volver a aplicar esta migración no duplica nada.
--
-- Verificar tras aplicarla:
--   select jobname, schedule, active from cron.job;
--   select status, start_time from cron.job_run_details order by start_time desc limit 5;

create extension if not exists pg_cron;

select cron.schedule(
  'generate-service-occurrences',
  '15 4 * * *',
  $$select public.generate_service_occurrences()$$
);
