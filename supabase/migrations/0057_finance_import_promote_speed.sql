-- Importar donaciones: la primera tanda tardaba más que el límite de
-- tiempo de Supabase (~8 s) con archivos grandes (434 donantes, 2,115
-- filas) y fallaba con "No se pudo completar la operación". Causa: la
-- búsqueda de donantes a crear revisaba, por cada donante, TODAS las filas
-- de importación (de todos los lotes) con un OR que no usaba índices.
-- Ahora es una sola pasada por las filas pendientes del lote. El resto de
-- la función es idéntico a 0053.

create or replace function finance_import_promote(p_batch_id uuid, p_limit int default 250)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d donation_import_donors%rowtype;
  v_r record;
  v_person uuid;
  v_res jsonb;
  n_imp int := 0;
  n_skip int := 0;
  n_rep int := 0;
  v_remaining int;
  v_review int;
begin
  perform finance_import_lock_batch(p_batch_id);

  if exists (select 1 from donation_import_donors where batch_id = p_batch_id and decision = 'pendiente') then
    raise exception 'PENDIENTE: Faltan donantes por decidir.';
  end if;
  if exists (
    select 1 from donation_import_rows r
      join donation_import_donors d on d.id = r.donor_id
      left join donation_import_donors t on t.id = d.same_as_donor_id
     where r.batch_id = p_batch_id and r.status = 'pendiente'
       and coalesce(t.decision, d.decision) <> 'omitir'
       and (r.donation_type is null or r.payment_method is null)
  ) then
    raise exception 'PENDIENTE: Hay valores de Categoría o Forma de pago sin asignar.';
  end if;

  -- Donantes nuevos (solo si tienen algo que importar).
  for v_d in
    select * from donation_import_donors d
     where d.batch_id = p_batch_id and d.decision = 'crear' and d.person_id is null
       and d.id in (
         -- Una sola pasada por las filas pendientes de ESTE lote: el donante
         -- de la fila y, si ese donante es "el mismo que" otro, también ese.
         select r.donor_id from donation_import_rows r
          where r.batch_id = p_batch_id and r.status = 'pendiente'
         union
         select u.same_as_donor_id from donation_import_rows r
           join donation_import_donors u on u.id = r.donor_id
          where r.batch_id = p_batch_id and r.status = 'pendiente'
            and u.same_as_donor_id is not null)
     for update of d
  loop
    insert into people (first_name, last_name, source, finance_only, created_by, updated_by)
    values (v_d.new_first_name, coalesce(v_d.new_last_name, ''), 'finanzas', true, auth.uid(), auth.uid())
    returning id into v_person;
    update donation_import_donors set person_id = v_person where id = v_d.id;
  end loop;

  for v_r in
    select r.id, r.donation_date, r.amount_cents, r.donation_type, r.payment_method,
           r.reference, r.allow_repeat,
           coalesce(t.decision, d.decision) as decision,
           coalesce(t.person_id, d.person_id) as person_id
      from donation_import_rows r
      join donation_import_donors d on d.id = r.donor_id
      left join donation_import_donors t on t.id = d.same_as_donor_id
     where r.batch_id = p_batch_id and r.status = 'pendiente'
     order by r.row_number
     limit greatest(1, least(coalesce(p_limit, 250), 500))
  loop
    if v_r.decision = 'omitir' then
      update donation_import_rows set status = 'omitida', status_detail = 'Donante omitido.'
       where id = v_r.id;
      n_skip := n_skip + 1;
      continue;
    end if;

    -- ¿Ya estaba registrada (a mano o en otro lote)? Las iguales dentro
    -- de este mismo archivo sí se importan (dos sobres iguales son válidos).
    if not v_r.allow_repeat and exists (
      select 1 from donations dn
       where dn.status = 'vigente' and dn.donation_date = v_r.donation_date
         and dn.amount_cents = v_r.amount_cents and dn.donation_type = v_r.donation_type
         and (case when v_r.decision = 'anonima' then dn.is_anonymous
                   else dn.person_id = v_r.person_id end)
         and not exists (select 1 from donation_import_rows x
                          where x.donation_id = dn.id and x.batch_id = p_batch_id)
    ) then
      update donation_import_rows
         set status = 'posible_repetida',
             status_detail = 'Ya hay una donación igual (persona, fecha, monto y tipo).'
       where id = v_r.id;
      n_rep := n_rep + 1;
      continue;
    end if;

    begin
      v_res := create_donation(
        v_r.id,
        case when v_r.decision = 'anonima' then null else v_r.person_id end,
        v_r.decision = 'anonima',
        v_r.donation_date, v_r.amount_cents, v_r.donation_type, v_r.payment_method,
        v_r.reference, null, false, false
      );
      update donation_import_rows
         set status = 'importada', status_detail = null, donation_id = (v_res ->> 'id')::uuid
       where id = v_r.id;
      n_imp := n_imp + 1;
    exception when others then
      update donation_import_rows
         set status = 'omitida', status_detail = left(regexp_replace(sqlerrm, '^[A-Z_]+: ', ''), 200)
       where id = v_r.id;
      n_skip := n_skip + 1;
    end;
  end loop;

  select count(*) filter (where status = 'pendiente'), count(*) filter (where status = 'posible_repetida')
    into v_remaining, v_review
    from donation_import_rows where batch_id = p_batch_id;

  update donation_import_batches
     set imported_count = (select count(*) from donation_import_rows
                            where batch_id = p_batch_id and status = 'importada')
   where id = p_batch_id;

  if v_remaining = 0 and v_review = 0 then
    update donation_import_batches set status = 'completado', completed_at = now()
     where id = p_batch_id;
    perform finance_log('importar_donaciones.completar', 'donation_import_batches', p_batch_id,
      jsonb_build_object('importadas', (select imported_count from donation_import_batches where id = p_batch_id)));
  end if;

  return jsonb_build_object('imported', n_imp, 'skipped', n_skip, 'repeated', n_rep,
                            'remaining', v_remaining, 'review', v_review);
end;
$$;

revoke all on function finance_import_promote(uuid, int) from public, anon;
grant execute on function finance_import_promote(uuid, int) to authenticated;

notify pgrst, 'reload schema';
