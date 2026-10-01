import type { NextConfig } from "next";

// Cabeceras de seguridad para toda la app (auditoría 2026-10-01,
// docs/audit/2026-10-privacidad-seguridad.md). La CSP se limita a lo que
// no rompe Next.js (sin restringir scripts): no se deja incrustar la app
// en otros sitios, ni plugins, ni enviar formularios a otros dominios.
// La cámara se permite solo en el propio sitio (check-in por QR).
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
