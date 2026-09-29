-- Rol "Editor del sitio web": sube fotos y publica eventos, anuncios,
-- videos, álbumes, ministerios y equipo pastoral en el sitio público. No
-- da acceso a datos internos (no es staff). Lo asigna un administrador en
-- "Cuenta y permisos". Va aparte porque un valor nuevo de enum no se puede
-- usar en la misma transacción que lo agrega (ver 0038).

alter type app_role add value if not exists 'sitio_web';
