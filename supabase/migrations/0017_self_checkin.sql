-- Auto check-in: la iglesia imprime UN solo QR fijo en la entrada (apunta
-- a /check-in/publico, no codifica ningún token). Cada persona lo escanea
-- con su propio celular, inicia sesión si hace falta, y confirma su
-- propia asistencia a un servicio con is_checkin_open = true.
--
-- Se permite insertar un check-in propio sin importar el rol (cualquier
-- persona autenticada puede marcarse a sí misma), siempre que el servicio
-- esté abierto para check-in. El check-in por staff (manual u operador
-- escaneando el QR personal del miembro) sigue funcionando igual.

create policy service_checkins_insert_self on service_checkins
  for insert
  with check (
    person_id = current_person_id()
    and exists (
      select 1 from services s
      where s.id = service_checkins.service_id
        and s.is_checkin_open
    )
  );
