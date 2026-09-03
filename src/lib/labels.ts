import type {
  AppRole,
  FollowupStatus,
  GenderType,
  MembershipStatus,
  MinistryMemberRole,
  ActivityStatus,
} from "@/types/database";

export const membershipStatusLabels: Record<MembershipStatus, string> = {
  visitante: "Visitante",
  asistente_habitual: "Asistente habitual",
  miembro: "Miembro",
  inactivo: "Inactivo",
};

export const genderLabels: Record<GenderType, string> = {
  masculino: "Masculino",
  femenino: "Femenino",
  no_especifica: "Prefiere no decir",
};

export const roleLabels: Record<AppRole, string> = {
  miembro: "Miembro",
  maestro: "Maestro",
  seguimiento: "Seguimiento",
  intercesor: "Intercesor",
  coordinador_ministerio: "Coordinador de ministerio",
  pastor: "Pastor",
  administrador: "Administrador",
};

export const followupStatusLabels: Record<FollowupStatus, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
  no_contactable: "No contactable",
};

export const ministryMemberRoleLabels: Record<MinistryMemberRole, string> = {
  lider: "Líder",
  colider: "Colíder",
  miembro: "Miembro del equipo",
};

export const activityStatusLabels: Record<ActivityStatus, string> = {
  planificada: "Planificada",
  abierta: "Inscripciones abiertas",
  realizada: "Realizada",
  cancelada: "Cancelada",
};
