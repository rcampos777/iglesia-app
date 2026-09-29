import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Manrope } from "next/font/google";
import "./site.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: { default: "Ciudad de Avivamiento | Ponce", template: "%s | Ciudad de Avivamiento" },
  description:
    "Ciudad de Avivamiento — una iglesia en Ponce, Puerto Rico. Horarios, eventos, predicaciones y fotos.",
};

// Marca la página como animable solo si hay JavaScript y la persona no
// pidió reducir el movimiento. Sin esto, todo el texto se ve de inmediato.
const TW_SCRIPT =
  "try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.currentScript.parentElement.dataset.tw='1'}catch(e){}";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${manrope.className} ${manrope.variable} min-h-screen bg-[#1D191A] text-white antialiased`}
      suppressHydrationWarning
    >
      <script dangerouslySetInnerHTML={{ __html: TW_SCRIPT }} />
      {children}
    </div>
  );
}
