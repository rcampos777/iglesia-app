import type { AppRole } from "@/types/database";

export interface NavItem {
  href: string;
  label: string;
  /** Si se omite, visible para cualquier usuario autenticado. */
  roles?: AppRole[];
}

/**
 * Un usuario con solo el rol `miembro` ve únicamente "Mi portal" (y el
 * panel): sus cursos, los ministerios donde sirve y sus peticiones de
 * oración están todos ahí. Los catálogos completos (personas, cursos,
 * ministerios, encuestas) son de staff. Ocultar el enlace NO es la
 * barrera: cada página redirige y además hay RLS (docs/security.md).
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Panel" },
  {
    href: "/personas",
    label: "Personas",
    roles: [
      "maestro",
      "seguimiento",
      "intercesor",
      "coordinador_ministerio",
      "pastor",
      "administrador",
    ],
  },
  {
    href: "/cursos",
    label: "Cursos y clases",
    roles: [
      "maestro",
      "seguimiento",
      "intercesor",
      "coordinador_ministerio",
      "pastor",
      "administrador",
    ],
  },
  {
    href: "/ministerios",
    label: "Ministerios",
    roles: [
      "maestro",
      "seguimiento",
      "intercesor",
      "coordinador_ministerio",
      "pastor",
      "administrador",
    ],
  },
  {
    href: "/check-in",
    label: "Check-in",
    roles: ["seguimiento", "coordinador_ministerio", "pastor", "administrador"],
  },
  {
    href: "/visitantes",
    label: "Visitantes",
    roles: ["seguimiento", "coordinador_ministerio", "pastor", "administrador"],
  },
  {
    href: "/oracion",
    label: "Peticiones de oración",
    // `pastor` ya no entra por rol: además de estos, lo ve el líder del
    // ministerio de intercesión — que no es una condición de rol, así que
    // se añade en `visibleNavItems` con el flag `isPrayerReader`.
    roles: ["intercesor", "administrador"],
  },
  {
    href: "/importar",
    label: "Importar datos",
    roles: ["seguimiento", "coordinador_ministerio", "pastor", "administrador"],
  },
  { href: "/portal", label: "Mi portal" },
  {
    href: "/encuestas",
    label: "Encuestas",
    roles: [
      "maestro",
      "seguimiento",
      "intercesor",
      "coordinador_ministerio",
      "pastor",
      "administrador",
    ],
  },
  {
    href: "/reportes",
    label: "Reportes",
    roles: [
      "maestro",
      "seguimiento",
      "intercesor",
      "coordinador_ministerio",
      "pastor",
      "administrador",
    ],
  },
  { href: "/admin", label: "Administración", roles: ["administrador"] },
];

export function visibleNavItems(
  userRoles: AppRole[],
  extras: { isPrayerReader?: boolean } = {},
): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.href === "/oracion" && extras.isPrayerReader) return true;
    return !item.roles || item.roles.some((r) => userRoles.includes(r));
  });
}
