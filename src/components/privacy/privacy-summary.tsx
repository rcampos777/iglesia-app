import Link from "next/link";
import { PRIVACY_PATH } from "@/lib/privacy";

/**
 * Resumen del aviso de privacidad (registro y pantalla de aceptación).
 * Solo describe lo que el sistema hace hoy; ver docs/privacy.md antes de
 * cambiar una frase.
 */
export function PrivacySummary() {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      <ul className="text-muted-foreground list-disc space-y-1.5 pl-5">
        <li>
          La iglesia guarda tu nombre, email y los datos de contacto que des, y tu participación
          (clases, asistencia, ministerios y actividades) para atender a la congregación.
        </li>
        <li>
          Cada persona del equipo ve solo lo que su función necesita. Las donaciones solo las ven
          los pastores generales y Finanzas; las peticiones de oración, solo el equipo de
          intercesión y la administración.
        </li>
        <li>No vendemos tus datos ni los usamos para publicidad.</li>
        <li>
          Puedes ver y corregir tus datos en <b>Mi portal</b>, y borrar tu perfil desde ahí mismo.
        </li>
      </ul>
      <p>
        <Link
          href={PRIVACY_PATH}
          target="_blank"
          className="text-foreground font-medium underline underline-offset-4"
        >
          Leer el aviso de privacidad completo
        </Link>
      </p>
    </div>
  );
}
