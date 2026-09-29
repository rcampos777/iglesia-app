import type { StatusTone } from "@/components/ui-brand/status-badge";
import type {
  ActivityStatus,
  CheckinState,
  DonationLetterStatus,
  DonationStatus,
  ClassStatus,
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

export const classTone: Record<ClassStatus, StatusTone> = {
  planificada: "neutral",
  activa: "active",
  completada: "tracking",
  cancelada: "idle",
};

export const checkinStateTone: Record<CheckinState, StatusTone> = {
  abierto: "active",
  pendiente: "tracking",
  cerrado: "idle",
  cancelado: "error",
};

export const donationStatusTone: Record<DonationStatus, StatusTone> = {
  vigente: "active",
  anulada: "error",
};

export const letterStatusTone: Record<DonationLetterStatus, StatusTone> = {
  vigente: "active",
  requiere_revision: "warning",
  reemplazada: "idle",
};
