import type { AppRole } from "@/types/database";
import { hasAnyRole, type CurrentUser } from "./session";

/**
 * Capacidades de asistencia a cultos. Espejan las funciones SQL de
 * 0032_recurring_services_attendance.sql (`can_record_attendance()`,
 * etc.), que son la barrera real: estas listas solo deciden qué se
 * muestra y cortan temprano en las Server Actions.
 */

/** Solo ujier (y SuperAdmin, implícito en hasAnyRole). Decisión 2026-10-01, 0044. */
export const RECORD_ATTENDANCE_ROLES: AppRole[] = ["ujier"];
export const MANAGE_SERVICES_ROLES: AppRole[] = ["administrador", "gestion_cultos"];
export const CONTROL_CHECKIN_ROLES: AppRole[] = ["administrador", "control_checkin"];
export const CORRECT_ATTENDANCE_ROLES: AppRole[] = ["administrador", "correccion_asistencia"];

/** Cualquiera que opere cultos ve la pantalla de Asistencia. */
export const ATTENDANCE_AREA_ROLES: AppRole[] = [
  ...new Set([
    ...RECORD_ATTENDANCE_ROLES,
    ...MANAGE_SERVICES_ROLES,
    ...CONTROL_CHECKIN_ROLES,
    ...CORRECT_ATTENDANCE_ROLES,
  ]),
];

export type AttendanceCapabilities = {
  record: boolean;
  manage: boolean;
  control: boolean;
  correct: boolean;
};

export function attendanceCapabilities(user: CurrentUser | null): AttendanceCapabilities {
  return {
    record: hasAnyRole(user, RECORD_ATTENDANCE_ROLES),
    manage: hasAnyRole(user, MANAGE_SERVICES_ROLES),
    control: hasAnyRole(user, CONTROL_CHECKIN_ROLES),
    correct: hasAnyRole(user, CORRECT_ATTENDANCE_ROLES),
  };
}
