import type { StatusTone } from "@/components/ui-brand/status-badge";
import type {
  ActivityStatus,
  EnrollmentStatus,
  FollowupStatus,
  MembershipStatus,
  PrayerStatus,
} from "@/types/database";

/**
 * Mapeo de los estados del dominio al color semántico que les toca.
 * Centralizado para que el mismo estado se vea igual en toda la app.
 */

export const activityTone: Record<ActivityStatus, StatusTone> = {
  planificada: "neutral",
  abierta: "tracking",
  realizada: "active",
  cancelada: "idle",
};

export const followupTone: Record<FollowupStatus, StatusTone> = {
  pendiente: "warning",
  en_progreso: "tracking",
  completado: "active",
  no_contactable: "idle",
};

export const enrollmentTone: Record<EnrollmentStatus, StatusTone> = {
  inscrito: "neutral",
  en_progreso: "tracking",
  completado: "active",
  retirado: "idle",
};

export const membershipTone: Record<MembershipStatus, StatusTone> = {
  visitante: "tracking",
  asistente_habitual: "neutral",
  miembro: "active",
  inactivo: "idle",
};

export const prayerTone: Record<PrayerStatus, StatusTone> = {
  nueva: "warning",
  en_oracion: "tracking",
  respondida: "active",
  cerrada: "idle",
};
