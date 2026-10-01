import type { StatusTone } from "@/components/ui-brand/status-badge";
import { addDaysToDateKey } from "@/lib/datetime";

export const CERTIFICATION_BUCKET = "certificaciones";

/** Días antes del vencimiento en que una certificación se marca "Vence pronto". */
export const EXPIRING_SOON_DAYS = 30;

export const certificationStatusValues = [
  "vencida",
  "vence_pronto",
  "vigente",
  "sin_vencimiento",
] as const;
export type CertificationStatus = (typeof certificationStatusValues)[number];

export const certificationStatusLabels: Record<CertificationStatus, string> = {
  vencida: "Vencida",
  vence_pronto: "Vence pronto",
  vigente: "Vigente",
  sin_vencimiento: "Sin fecha de vencimiento",
};

export const certificationStatusTone: Record<CertificationStatus, StatusTone> = {
  vencida: "error",
  vence_pronto: "warning",
  vigente: "active",
  sin_vencimiento: "neutral",
};

/** `today` es la fecha de la iglesia (YYYY-MM-DD, churchDateKey()). */
export function certificationStatus(expiresOn: string | null, today: string): CertificationStatus {
  if (!expiresOn) return "sin_vencimiento";
  if (expiresOn < today) return "vencida";
  if (expiresOn <= addDaysToDateKey(today, EXPIRING_SOON_DAYS)) return "vence_pronto";
  return "vigente";
}

export const CERTIFICATION_FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const CERTIFICATION_MAX_BYTES = 10 * 1024 * 1024;

/** Ruta en el bucket: <persona>/<uuid>.<ext> (la base valida el mismo patrón). */
export const CERTIFICATION_PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/;
