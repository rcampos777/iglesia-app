# Sitio web público

Migraciones `0037_site_editor_role.sql`, `0038_site_content.sql`,
`0039_site_storage.sql`. Reemplaza la landing estática de `landing/`.

## Qué es

- La página pública de la iglesia vive **dentro de esta misma app**, en
  `/sitio` (`src/app/(sitio)/sitio`). En el dominio raíz
  (`ciudaddeavivamiento.org`, `www.`) el `proxy` reescribe todo a `/sitio`,
  sin sesión. `app.ciudaddeavivamiento.org` sigue siendo la app.
- Diseño: fondo `#1D191A`, crema `#F1E5C6`, blanco roto `#F5F0E8`, letra
  **Manrope** (300/400/500), titulares grandes finos, tarjetas de fecha de
  68×90, botón de reproducir crema, menú a pantalla completa, aparición suave
  (600 ms) y efecto de máquina de escribir en los títulos (solo con
  JavaScript y si la persona no pidió reducir movimiento; el texto completo
  siempre está para lectores de pantalla y Google). Se basó en un diseño de
  referencia de 3 pantallas de celular, adaptado a web y con fotos propias.

## Secciones

Inicio: portada (foto, título, frase, "Visítanos", "Portal de miembros");
cita del equipo pastoral o misión + tarjeta "Próximo"; predicación
destacada + "Próximos" (eventos y cultos); anuncios; quiénes somos y
ministerios; equipo pastoral; álbumes; horarios; cómo llegar (mapa);
pie con redes. Páginas: `/sitio/eventos` (+ detalle), `/sitio/albumes`
(+ álbum con visor de fotos), `/sitio/videos`.

**Horarios**: no se duplican. Salen de Asistencia → Programación de
cultos (`public_service_schedule()`); si cambias un horario allí, el sitio
se actualiza solo.

## Cómo se edita (app → **Sitio web**)

Pestañas: General (textos, fotos de portada y de "Quiénes somos", contacto,
redes, enlace del portal), Fotos (subir varias a la vez; se reducen solas a
1920 px + miniatura 640 px en el navegador), Álbumes (crear, agregar fotos,
ordenar, portada, publicar), Eventos y anuncios (evento con fecha/hora de
PR; anuncio con "mostrar hasta"), Videos (pegar enlace de YouTube;
"destacado" sale en la portada), Ministerios, Equipo pastoral. Todo tiene
**Publicado**: los borradores no se ven. Los cambios aparecen de inmediato
(y el sitio se regenera cada 5 minutos de todos modos).

**Quién edita**: `administrador`, SuperAdmin y el rol nuevo **Editor del
sitio web** (`sitio_web`), que un administrador asigna en "Cuenta y
permisos". Ese rol no da acceso a datos internos.

## Seguridad

- RLS: el público (`anon`) solo lee lo publicado; escriben solo
  `can_edit_site()`. Pruebas en `tests/db/site.test.ts`.
- Fotos en el bucket **público** `sitio` (son para la web): cualquiera con
  la URL puede verlas, incluidas las que están en borradores. Subir, cambiar
  y borrar solo editores. Solo JPEG/PNG/WebP, 10 MB.
- Enlaces solo `http(s)://`; videos solo IDs de YouTube válidos; los videos
  se cargan con `youtube-nocookie` al tocarlos.
- El sitio usa un cliente anónimo sin cookies y se sirve cacheado (ISR).

## Activación (pendiente)

1. Aplicar 0037, 0038 y 0039 (proyecto de producción).
2. Desplegar la app.
3. En Vercel → proyecto `iglesia-app` → Settings → Domains: agregar
   `ciudaddeavivamiento.org` y `www.ciudaddeavivamiento.org` (Vercel indica
   los registros DNS que hay que poner en GoDaddy).
4. En la app → Sitio web: subir las fotos (las de `landing/images/` son un
   buen comienzo), elegir portada, crear álbumes, eventos, videos, equipo.
