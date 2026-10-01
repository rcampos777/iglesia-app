import type {
  AppRole,
  CheckinMethod,
  CheckinState,
  DonationLetterStatus,
  DonationPaymentMethod,
  DonationStatus,
  DonationType,
  ServiceType,
  FollowupStatus,
  GenderType,
  MembershipStatus,
  PersonSource,
  MinistryMemberRole,
  ActivityStatus,
  ClassStatus,
  EnrollmentStatus,
  PrayerStatus,
} from "@/types/database";

export const membershipStatusLabels: Record<MembershipStatus, string> = {
  visitante: "Visitante",
  asistente_habitual: "Asistente habitual",
  miembro: "Miembro",
  inactivo: "Inactivo",
};

export const personSourceLabels: Record<PersonSource, string> = {
  manual: "Alta manual",
  importacion: "Importación",
  inscripcion_actividad: "Inscripción en línea",
  registro_cuenta: "Registro de cuenta",
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
  ujier: "Servidor / Ujier",
  gestion_cultos: "Gestionar cultos",
  control_checkin: "Controlar check-in",
  correccion_asistencia: "Corregir asistencia",
  apostol: "SuperAdmin",
  finanzas: "Finanzas",
  sitio_web: "WebMaster (sitio web)",
};

export const roleDescriptions: Record<AppRole, string> = {
  miembro: "Acceso a Mi portal: puede ver y actualizar sus propios datos de contacto.",
  maestro: "Gestiona asistencia y matrícula de las clases donde figura como maestro.",
  seguimiento: "Da seguimiento a visitantes y puede registrar personas nuevas.",
  intercesor: "Puede ver y atender las peticiones de oración asignadas o del equipo.",
  coordinador_ministerio: "Gestiona personas, cursos, clases y ministerios de su área.",
  pastor: "Gestiona las clases que imparte y los ministerios que lidera (no es acceso global).",
  administrador: "Acceso completo: gestión de roles, configuración y todos los módulos.",
  ujier:
    "Registrar asistencia (check-in): ve los cultos, busca personas con datos mínimos y confirma asistencia o escanea su QR. No da acceso a administración, oración ni edición de personas.",
  gestion_cultos:
    "Crear cultos especiales, reprogramar o cancelar fechas y configurar las recurrencias semanales.",
  control_checkin: "Abrir o cerrar el registro de asistencia de un culto.",
  correccion_asistencia:
    "Anular o agregar asistencias fuera de la ventana, siempre con motivo y queda auditado.",
  apostol:
    "Pastores generales (apóstoles): todos los permisos de la app (administración, oración, asistencia y finanzas). Único que concede o revoca SuperAdmin y Finanzas; lo gestiona un SuperAdmin, no el administrador.",
  finanzas:
    "Registra y consulta donaciones, totales, cartas y exportaciones. Lo concede un SuperAdmin, no el administrador.",
  sitio_web:
    "Sube fotos y publica eventos, anuncios, videos, álbumes, ministerios y equipo pastoral en el sitio web. No da acceso a datos internos.",
};

export const serviceTypeLabels: Record<ServiceType, string> = {
  culto_general: "Culto general",
  oracion: "Oración",
  jovenes: "Jóvenes",
  ninos: "Niños",
  otro: "Otro",
};

export const checkinStateLabels: Record<CheckinState, string> = {
  abierto: "Registro abierto",
  pendiente: "Aún no abre",
  cerrado: "Registro cerrado",
  cancelado: "Cancelado",
};

export const checkinMethodLabels: Record<CheckinMethod, string> = {
  manual: "Búsqueda",
  qr: "QR",
};

/** Índice = extract(dow): 0 = domingo. */
export const weekdayLabels = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export const donationTypeLabels: Record<DonationType, string> = {
  diezmo: "Diezmo",
  ofrenda: "Ofrenda",
  semilla: "Semilla",
  primicias: "Primicias",
};

export const paymentMethodLabels: Record<DonationPaymentMethod, string> = {
  efectivo: "Efectivo (Cash)",
  ath: "ATH",
  credito: "Crédito",
  ath_movil: "ATH Móvil",
  cheque: "Cheque",
  giro: "Giro",
};

export const donationStatusLabels: Record<DonationStatus, string> = {
  vigente: "Vigente",
  anulada: "Anulada",
};

export const letterStatusLabels: Record<DonationLetterStatus, string> = {
  vigente: "Vigente",
  requiere_revision: "Requiere revisión",
  reemplazada: "Reemplazada",
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

export const classStatusLabels: Record<ClassStatus, string> = {
  planificada: "Planificada",
  activa: "Activa",
  completada: "Completada",
  cancelada: "Cancelada",
};

export const enrollmentStatusLabels: Record<EnrollmentStatus, string> = {
  inscrito: "Inscrito",
  en_progreso: "En progreso",
  completado: "Completado",
  retirado: "Retirado",
};

export const prayerStatusLabels: Record<PrayerStatus, string> = {
  nueva: "Nueva",
  en_oracion: "En oración",
  respondida: "Respondida",
  cerrada: "Cerrada",
};
