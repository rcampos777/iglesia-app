-- FASE 1.C — Cierra la escalada de acceso a oración vía membresía.
--
-- `0021`/`0022` blindaron correctamente QUIÉN puede marcar
-- `ministries.grants_prayer_access` (solo administrador, con trigger).
-- Pero `is_prayer_reader()` (0020) no concede el acceso por ESE flag
-- solamente: lo concede a cualquiera con membresía ACTIVA `lider` o
-- `colider` EN el ministerio marcado. Nadie protegió ESE otro camino:
--
--   `ministry_memberships_write` (0018, corregida en 0028) deja escribir
--   la membresía a cualquier `coordinador_ministerio` (rol global, no
--   acotado a ese ministerio) o al líder de ese ministerio concreto
--   (`is_ministry_leader`). `updateMemberRoleAction()`
--   (ministerios/actions.ts) hace un `update` directo de
--   `role_in_ministry` sin ninguna comprobación especial.
--
--   Resultado: un `coordinador_ministerio` — o el propio líder del
--   ministerio de intercesión — podía agregarse a sí mismo o a un
--   tercero como `colider` de ESE ministerio mediante una edición
--   ORDINARIA de membresía, y de un plumazo esa persona pasaba a leer
--   TODAS las peticiones de oración. Ni pasa por `set_prayer_ministry()`
--   ni por el trigger de 0022 (que solo mira la columna
--   `grants_prayer_access`, no la membresía) — cero fricción, cero
--   auditoría dedicada. Exactamente lo que pide la Fase 1.C: "un
--   coordinador o líder no puede concederse ni conceder a terceros
--   acceso confidencial mediante una edición ordinaria".
--
-- Corrección: trigger en `ministry_memberships` que bloquea, SOLO
-- cuando el ministerio afectado tiene `grants_prayer_access = true`,
-- cualquier cambio que RESULTE en una membresía activa `lider`/`colider`
-- (alta nueva, ascenso desde `miembro`, o reactivar una que había
-- salido) — salvo que quien lo haga sea `administrador`. La
-- REVOCACIÓN (bajar a `miembro`, marcar `left_at`) sigue abierta a
-- cualquiera con permiso de escritura sobre esa membresía: reducir
-- acceso no es la operación peligrosa, otorgarlo sí.
--
-- Bonus relacionado: `is_prayer_reader()` también exige
-- `m.is_active`. Sin guardarlo, alguien con escritura general sobre
-- `ministries` (coordinador) podía reactivar (`is_active = true`) un
-- ministerio de intercesión que un administrador hubiera desactivado a
-- propósito para suspender el acceso, restaurándolo sin tocar el flag
-- protegido. Se extiende el trigger de 0022 para cubrir también
-- `is_active` cuando el ministerio ya otorga (u otorgaba) acceso a
-- oración.

create or replace function ministry_memberships_guard_prayer_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flagged boolean;
  v_will_grant boolean;
  v_was_granting boolean;
begin
  select grants_prayer_access into v_flagged from ministries where id = new.ministry_id;

  if not coalesce(v_flagged, false) then
    return new;
  end if;

  v_will_grant := new.role_in_ministry in ('lider', 'colider') and new.left_at is null;

  if tg_op = 'INSERT' then
    if v_will_grant and not has_role('administrador') then
      raise exception
        'Solo un administrador puede asignar líder/colíder del ministerio de intercesión.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: compara contra el estado anterior de ESTA fila. Si ya
  -- otorgaba el mismo acceso (p. ej. sigue siendo líder activo, o solo
  -- cambian notas/fecha), no hay nada nuevo que autorizar. Si el cambio
  -- HACE que la fila empiece a otorgar acceso (alta de miembro→líder,
  -- reactivar left_at, o mover la fila a este ministerio), exige admin.
  v_was_granting := old.role_in_ministry in ('lider', 'colider') and old.left_at is null;

  if v_will_grant and not v_was_granting and not has_role('administrador') then
    raise exception
      'Solo un administrador puede asignar líder/colíder del ministerio de intercesión.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function ministry_memberships_guard_prayer_grant is
  'Solo administrador puede crear/ascender/reactivar una membresía '
  'lider o colider en el ministerio marcado grants_prayer_access — '
  'cierra la vía de escalada que 0021/0022 no cubrían (esas protegían '
  'la columna del flag, no la membresía). Ver 0029.';

create trigger ministry_memberships_guard_prayer_grant_trg
  before insert or update on ministry_memberships
  for each row
  execute function ministry_memberships_guard_prayer_grant();

-- Extiende el guard de 0022 para que reactivar `is_active` en un
-- ministerio que otorga (u otorgaba) acceso a oración también requiera
-- administrador — mismo espíritu que proteger `grants_prayer_access`
-- directamente, porque `is_prayer_reader()` depende de ambas columnas.
create or replace function ministries_guard_prayer_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.grants_prayer_access and not has_role('administrador') then
      raise exception 'Solo un administrador puede designar el ministerio de intercesión.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.grants_prayer_access is distinct from old.grants_prayer_access
     and not has_role('administrador') then
    raise exception 'Solo un administrador puede designar el ministerio de intercesión.'
      using errcode = '42501';
  end if;

  -- (new.is_active hereda el default de old.is_active si no se toca en
  -- el UPDATE, así que "distinct from" solo dispara con un cambio real.)
  if (coalesce(old.grants_prayer_access, false) or coalesce(new.grants_prayer_access, false))
     and new.is_active is distinct from old.is_active
     and not has_role('administrador') then
    raise exception
      'Solo un administrador puede activar/desactivar el ministerio de intercesión.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function ministries_guard_prayer_flag is
  'Impide que alguien que no sea administrador cambie grants_prayer_access '
  'o reactive/desactive (is_active) el ministerio ya marcado como de '
  'intercesión, sin importar la vía (app, API directa, etc). Ver 0022 y 0029.';
