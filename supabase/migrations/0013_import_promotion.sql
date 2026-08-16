-- Promoción de filas de importación a la tabla final `people`.
-- Se ejecuta con los privilegios del usuario que llama (no SECURITY
-- DEFINER): confía en las políticas RLS ya existentes de `people` e
-- `import_rows`, así que solo roles de staff autorizados pueden invocarla
-- con éxito. Nunca inserta directamente sin pasar por import_rows.
--
-- No dispara ningún email/notificación (cumple la regla: los datos
-- importados no activan notificaciones automáticas).

create or replace function promote_import_row(
  p_row_id uuid,
  p_decision import_row_decision,
  p_target_person_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_normalized jsonb;
  v_new_person_id uuid;
begin
  select batch_id, normalized_data
  into v_batch_id, v_normalized
  from import_rows
  where id = p_row_id
  for update;

  if v_batch_id is null then
    raise exception 'import_row % no encontrada', p_row_id;
  end if;

  if p_decision = 'aprobar_nuevo' then
    insert into people (
      first_name, last_name, email, phone, birth_date, gender,
      address_line, city, membership_status, created_by
    )
    values (
      v_normalized ->> 'first_name',
      v_normalized ->> 'last_name',
      nullif(v_normalized ->> 'email', ''),
      nullif(v_normalized ->> 'phone', ''),
      nullif(v_normalized ->> 'birth_date', '')::date,
      nullif(v_normalized ->> 'gender', '')::gender_type,
      nullif(v_normalized ->> 'address_line', ''),
      nullif(v_normalized ->> 'city', ''),
      coalesce(nullif(v_normalized ->> 'membership_status', '')::membership_status, 'asistente_habitual'),
      auth.uid()
    )
    returning id into v_new_person_id;

    update import_rows
    set decision = p_decision,
        promoted_person_id = v_new_person_id,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_row_id;

  elsif p_decision = 'aprobar_fusion' then
    if p_target_person_id is null then
      raise exception 'aprobar_fusion requiere p_target_person_id';
    end if;

    update import_rows
    set decision = p_decision,
        promoted_person_id = p_target_person_id,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_row_id;

    v_new_person_id := p_target_person_id;

  elsif p_decision = 'rechazar' then
    update import_rows
    set decision = p_decision,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_row_id;
  else
    raise exception 'decisión no soportada: %', p_decision;
  end if;

  return v_new_person_id;
end;
$$;
