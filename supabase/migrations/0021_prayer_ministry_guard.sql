-- Defensa en profundidad para el flag `grants_prayer_access`.
--
-- 0020 lo introdujo, pero la política `ministries_write_staff` permite a
-- administrador/pastor/coordinador_ministerio actualizar CUALQUIER
-- columna de `ministries`. Es decir: un coordinador con un token de API
-- podía marcar su propio ministerio y concederse acceso de lectura a las
-- peticiones de oración — datos confidenciales y auditados
-- (CLAUDE.md §3.11). El guard del servidor ya lo impedía desde la app,
-- pero CLAUDE.md §3.10 exige que la autorización viva también en la base.
--
-- Se le quita a `authenticated` el privilegio sobre esa columna y se
-- expone una única vía controlada.

revoke update (grants_prayer_access) on ministries from authenticated;
revoke insert (grants_prayer_access) on ministries from authenticated;

create or replace function set_prayer_ministry(p_ministry_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_role('administrador') then
    raise exception 'Solo un administrador puede designar el ministerio de intercesión.'
      using errcode = '42501';
  end if;

  -- Solo un ministerio a la vez (hay además un índice único parcial):
  -- se limpia el anterior antes de marcar el nuevo.
  if p_enabled then
    update ministries
      set grants_prayer_access = false
      where grants_prayer_access and id <> p_ministry_id;
  end if;

  update ministries
    set grants_prayer_access = p_enabled
    where id = p_ministry_id;

  perform log_audit_event(
    'set_prayer_ministry',
    'ministry',
    p_ministry_id,
    jsonb_build_object('enabled', p_enabled)
  );
end;
$$;

comment on function set_prayer_ministry is
  'Única vía para designar el ministerio de intercesión. Exige rol '
  'administrador y queda registrado en audit_log.';

revoke all on function set_prayer_ministry(uuid, boolean) from public;
grant execute on function set_prayer_ministry(uuid, boolean) to authenticated;
