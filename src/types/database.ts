/**
 * Tipos de la base de datos, escritos a mano a partir de
 * `supabase/migrations/`. Cuando exista un proyecto Supabase real,
 * reemplazar/regenerar con:
 *   npx supabase gen types typescript --project-id TU_PROJECT_ID > src/types/database.ts
 */

export type AppRole =
  | "miembro"
  | "maestro"
  | "seguimiento"
  | "intercesor"
  | "coordinador_ministerio"
  | "pastor"
  | "administrador"
  | "ujier"
  | "gestion_cultos"
  | "control_checkin"
  | "correccion_asistencia";

export type MembershipStatus = "visitante" | "asistente_habitual" | "miembro" | "inactivo";

export type GenderType = "masculino" | "femenino" | "no_especifica";

export type ClassStatus = "planificada" | "activa" | "completada" | "cancelada";

export type EnrollmentStatus = "inscrito" | "en_progreso" | "completado" | "retirado";

export type AttendanceStatus = "presente" | "ausente" | "excusado" | "tarde";

export type ServiceType = "culto_general" | "oracion" | "jovenes" | "ninos" | "otro";

export type MinistryMemberRole = "lider" | "colider" | "miembro";

export type ActivityStatus = "planificada" | "abierta" | "realizada" | "cancelada";

export type CheckinMethod = "qr" | "manual";

export type ServiceStatus = "programado" | "cancelado";

/** Estado calculado por `service_checkin_state()` en la base de datos. */
export type CheckinState = "abierto" | "pendiente" | "cerrado" | "cancelado";

export type FollowupStatus = "pendiente" | "en_progreso" | "completado" | "no_contactable";

export type PrayerUrgency = "normal" | "urgente";

export type PrayerStatus = "nueva" | "en_oracion" | "respondida" | "cerrada";

export type NotificationChannel = "email";
export type NotificationStatus = "en_cola" | "enviado" | "fallido";

export type SurveyQuestionType = "texto" | "opcion_unica" | "opcion_multiple" | "escala";

export type ImportSourceType = "excel" | "csv" | "access" | "manual";
export type ImportBatchStatus =
  "cargando" | "en_revision" | "aprobado_parcial" | "completado" | "descartado";
export type ImportMatchStatus = "nuevo" | "posible_duplicado" | "duplicado_confirmado" | "invalido";
export type ImportRowDecision = "pendiente" | "aprobar_nuevo" | "aprobar_fusion" | "rechazar";

export type PersonRow = {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  birth_date: string | null;
  gender: GenderType | null;
  email: string | null;
  phone: string | null;
  address_line: string | null;
  city: string | null;
  marital_status: string | null;
  membership_status: MembershipStatus;
  joined_at: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type PersonInsert = Pick<PersonRow, "first_name" | "last_name" | "membership_status"> &
  Partial<
    Omit<
      PersonRow,
      "id" | "created_at" | "updated_at" | "first_name" | "last_name" | "membership_status"
    >
  >;

export type PersonUpdate = Partial<PersonInsert>;

export type ProfileRow = {
  id: string;
  person_id: string;
  display_name: string | null;
  created_at: string;
};

export type UserRoleRow = {
  user_id: string;
  role: AppRole;
  granted_at: string;
  granted_by: string | null;
};

export type CourseCategoryRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

export type CourseRow = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type ClassOfferingRow = {
  id: string;
  course_id: string;
  label: string;
  teacher_person_id: string | null;
  location: string | null;
  schedule_text: string | null;
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
  status: ClassStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type ClassSessionRow = {
  id: string;
  class_offering_id: string;
  session_date: string;
  topic: string | null;
  created_at: string;
};

export type EnrollmentRow = {
  id: string;
  class_offering_id: string;
  person_id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  enrolled_by: string | null;
  completed_at: string | null;
  notes: string | null;
};

export type EnrollmentProgressRow = {
  enrollment_id: string;
  class_offering_id: string;
  person_id: string;
  status: EnrollmentStatus;
  total_sessions: number;
  attended_sessions: number;
  attendance_percent: number;
};

export type AttendanceRecordRow = {
  id: string;
  class_session_id: string;
  person_id: string;
  status: AttendanceStatus;
  recorded_at: string;
  recorded_by: string | null;
};

export type ServiceRow = {
  id: string;
  name: string;
  service_type: ServiceType;
  /** Fecha local (America/Puerto_Rico), derivada de starts_at. */
  service_date: string;
  /** Hora local, derivada de starts_at. */
  start_time: string | null;
  location: string | null;
  series_id: string | null;
  series_rule_id: string | null;
  occurrence_date: string | null;
  starts_at: string;
  status: ServiceStatus;
  is_exception: boolean;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  checkin_opens_at: string;
  checkin_closes_at: string | null;
  checkin_manual_state: "abierto" | "cerrado" | null;
  checkin_state_changed_at: string | null;
  checkin_state_changed_by: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type ServiceCheckinRow = {
  id: string;
  service_id: string;
  person_id: string;
  method: CheckinMethod;
  checked_in_at: string;
  checked_in_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  is_correction: boolean;
  correction_reason: string | null;
};

export type ServiceSeriesRow = {
  id: string;
  name: string;
  created_at: string;
  created_by: string | null;
};

export type ServiceSeriesRuleRow = {
  id: string;
  series_id: string;
  name: string;
  service_type: ServiceType;
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  local_time: string;
  location: string | null;
  checkin_opens_minutes_before: number;
  checkin_closes_minutes_after: number | null;
  effective_from: string;
  effective_until: string | null;
  created_at: string;
  created_by: string | null;
};

export type ServiceScheduleSettingsRow = {
  id: boolean;
  timezone: string;
  horizon_weeks: number;
  updated_at: string;
  updated_by: string | null;
};

export type ServiceWithState = {
  id: string;
  name: string;
  service_type: ServiceType;
  service_date: string;
  start_time: string | null;
  starts_at: string;
  location: string | null;
  status: ServiceStatus;
  is_exception: boolean;
  series_id: string | null;
  occurrence_date: string | null;
  checkin_opens_at: string;
  checkin_closes_at: string | null;
  checkin_manual_state: "abierto" | "cerrado" | null;
  checkin_state: CheckinState;
  cancel_reason: string | null;
  /** null si quien consulta no opera asistencia. */
  attendance: number | null;
};

export type CheckinSearchResult = {
  person_id: string;
  display_name: string;
  hint: string | null;
  membership_status: MembershipStatus;
  already_checked_in: boolean;
};

export type ServiceAttendanceEntry = {
  checkin_id: string;
  person_id: string;
  display_name: string;
  checked_in_at: string;
  method: CheckinMethod;
  is_correction: boolean;
  correction_reason: string | null;
  recorded_by_name: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

export type RecordAttendanceResult = {
  result: "registrado" | "ya_registrado";
  checkin_id?: string;
  checked_in_at?: string;
  person_name: string;
  by_me?: boolean;
};

export type VisitorFollowUpRow = {
  id: string;
  person_id: string;
  assigned_to: string | null;
  status: FollowupStatus;
  first_visit_date: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type FollowUpNoteRow = {
  id: string;
  follow_up_id: string;
  contact_method: string | null;
  note: string;
  contacted_at: string;
  created_by: string | null;
};

export type PrayerRequestRow = {
  id: string;
  requester_person_id: string | null;
  submitted_by_user_id: string | null;
  is_anonymous: boolean;
  is_confidential: boolean;
  category: string | null;
  urgency: PrayerUrgency;
  content: string;
  status: PrayerStatus;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

export type PrayerRequestAccessLogRow = {
  id: string;
  prayer_request_id: string;
  accessed_by: string;
  action: string;
  accessed_at: string;
};

export type NotificationTemplateRow = {
  id: string;
  code: string;
  subject: string;
  body_markdown: string;
  created_at: string;
  updated_at: string;
};

export type NotificationLogRow = {
  id: string;
  channel: NotificationChannel;
  template_code: string | null;
  recipient_person_id: string | null;
  recipient_email: string | null;
  subject: string | null;
  status: NotificationStatus;
  related_entity_type: string | null;
  related_entity_id: string | null;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
  created_by: string | null;
};

export type SurveyRow = {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
};

export type SurveyQuestionRow = {
  id: string;
  survey_id: string;
  question_text: string;
  question_type: SurveyQuestionType;
  options: unknown;
  order_index: number;
  is_required: boolean;
};

export type SurveyResponseRow = {
  id: string;
  survey_id: string;
  person_id: string | null;
  submitted_at: string;
};

export type SurveyAnswerRow = {
  id: string;
  response_id: string;
  question_id: string;
  answer_text: string | null;
  answer_options: unknown;
};

export type ImportBatchRow = {
  id: string;
  source_type: ImportSourceType;
  target_entity: string;
  file_name: string | null;
  status: ImportBatchStatus;
  total_rows: number;
  created_at: string;
  updated_at: string;
  created_by: string;
};

export type ImportRowRow = {
  id: string;
  batch_id: string;
  row_number: number;
  raw_data: Record<string, unknown>;
  normalized_data: Record<string, unknown> | null;
  match_status: ImportMatchStatus;
  matched_person_id: string | null;
  candidate_person_ids: string[];
  validation_errors: unknown[];
  decision: ImportRowDecision;
  promoted_person_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

export type PortalInvitationRow = {
  id: string;
  person_id: string;
  email: string;
  token_hash: string;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by_user_id: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
};

export type MinistryRow = {
  id: string;
  name: string;
  description: string | null;
  grants_prayer_access: boolean;
  leader_person_id: string | null;
  meeting_schedule_text: string | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type MinistryMembershipRow = {
  id: string;
  ministry_id: string;
  person_id: string;
  role_in_ministry: MinistryMemberRole;
  joined_at: string;
  left_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type ActivityRow = {
  id: string;
  ministry_id: string | null;
  name: string;
  description: string | null;
  activity_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  capacity: number | null;
  status: ActivityStatus;
  responsible_person_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type ActivityParticipantRow = {
  id: string;
  activity_id: string;
  person_id: string;
  registered_at: string;
  attended: boolean;
  attended_at: string | null;
  notes: string | null;
  created_by: string | null;
};

export type AuditLogRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

/**
 * Forma genérica usada por `@supabase/supabase-js` /
 * `@supabase/ssr` (`createClient<Database>`). Solo cubre lo que el
 * MVP consume hoy; se amplía a medida que se necesite (Insert/Update
 * completos, Functions, etc). No es una alternativa a generar los
 * tipos reales desde un proyecto Supabase vivo.
 */
type TableDef<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      people: TableDef<PersonRow, PersonInsert, PersonUpdate>;
      profiles: TableDef<ProfileRow>;
      user_roles: TableDef<UserRoleRow>;
      course_categories: TableDef<CourseCategoryRow>;
      courses: TableDef<CourseRow>;
      class_offerings: TableDef<ClassOfferingRow>;
      class_sessions: TableDef<ClassSessionRow>;
      enrollments: TableDef<EnrollmentRow>;
      attendance_records: TableDef<AttendanceRecordRow>;
      services: TableDef<ServiceRow>;
      service_checkins: TableDef<ServiceCheckinRow>;
      service_series: TableDef<ServiceSeriesRow>;
      service_series_rules: TableDef<ServiceSeriesRuleRow>;
      service_schedule_settings: TableDef<ServiceScheduleSettingsRow>;
      visitor_follow_ups: TableDef<VisitorFollowUpRow>;
      follow_up_notes: TableDef<FollowUpNoteRow>;
      prayer_requests: TableDef<PrayerRequestRow>;
      prayer_request_access_log: TableDef<PrayerRequestAccessLogRow>;
      notification_templates: TableDef<NotificationTemplateRow>;
      notification_log: TableDef<NotificationLogRow>;
      surveys: TableDef<SurveyRow>;
      survey_questions: TableDef<SurveyQuestionRow>;
      survey_responses: TableDef<SurveyResponseRow>;
      survey_answers: TableDef<SurveyAnswerRow>;
      import_batches: TableDef<ImportBatchRow>;
      import_rows: TableDef<ImportRowRow>;
      activities: TableDef<ActivityRow>;
      activity_participants: TableDef<ActivityParticipantRow>;
      ministries: TableDef<MinistryRow>;
      ministry_memberships: TableDef<MinistryMembershipRow>;
      audit_log: TableDef<AuditLogRow>;
      portal_invitations: TableDef<PortalInvitationRow>;
    };
    Views: {
      enrollment_progress: {
        Row: EnrollmentProgressRow;
        Relationships: [];
      };
    };
    Functions: {
      has_role: { Args: { check_role: AppRole }; Returns: boolean };
      has_any_role: { Args: { check_roles: AppRole[] }; Returns: boolean };
      is_staff: { Args: Record<string, never>; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      current_person_id: { Args: Record<string, never>; Returns: string | null };
      is_ministry_leader: { Args: { p_ministry_id: string }; Returns: boolean };
      is_prayer_reader: { Args: Record<string, never>; Returns: boolean };
      can_manage_activity: { Args: { p_ministry_id: string | null }; Returns: boolean };
      set_prayer_ministry: {
        Args: { p_ministry_id: string; p_enabled: boolean };
        Returns: undefined;
      };
      list_people_for_ministry_picker: {
        Args: Record<string, never>;
        Returns: { id: string; first_name: string; last_name: string }[];
      };
      log_prayer_request_access: {
        Args: { request_id: string; access_action?: string };
        Returns: undefined;
      };
      log_audit_event: {
        Args: {
          p_action: string;
          p_entity_type: string;
          p_entity_id: string | null;
          p_metadata?: Record<string, unknown>;
        };
        Returns: undefined;
      };
      promote_import_row: {
        Args: {
          p_row_id: string;
          p_decision: ImportRowDecision;
          p_target_person_id?: string | null;
        };
        Returns: string | null;
      };
      update_own_contact_info: {
        Args: {
          p_phone?: string | null;
          p_email?: string | null;
          p_address_line?: string | null;
          p_city?: string | null;
          p_preferred_name?: string | null;
        };
        Returns: undefined;
      };
      list_users_with_roles: {
        Args: { p_search?: string | null; p_limit?: number; p_offset?: number };
        Returns: {
          user_id: string;
          email: string | null;
          created_at: string;
          roles: AppRole[];
          person_id: string | null;
          person_first_name: string | null;
          person_last_name: string | null;
          total_count: number;
        }[];
      };
      admin_get_account_for_person: {
        Args: { p_person_id: string };
        Returns: {
          user_id: string;
          email: string | null;
          email_confirmed_at: string | null;
          account_created_at: string;
          roles: AppRole[];
        }[];
      };
      admin_set_person_roles: {
        Args: {
          p_person_id: string;
          p_expected_roles: AppRole[];
          p_new_roles: AppRole[];
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      create_portal_invitation: {
        Args: { p_person_id: string; p_email: string };
        Returns: string;
      };
      revoke_portal_invitation: {
        Args: { p_invitation_id: string };
        Returns: undefined;
      };
      admin_relink_profile: {
        Args: { p_user_id: string; p_new_person_id: string; p_reason?: string | null };
        Returns: undefined;
      };
      can_record_attendance: { Args: Record<string, never>; Returns: boolean };
      can_manage_services: { Args: Record<string, never>; Returns: boolean };
      can_control_checkin: { Args: Record<string, never>; Returns: boolean };
      can_correct_attendance: { Args: Record<string, never>; Returns: boolean };
      ensure_service_occurrences: { Args: Record<string, never>; Returns: number };
      list_services_with_state: {
        Args: { p_from?: string | null; p_to?: string | null; p_service_id?: string | null };
        Returns: ServiceWithState[];
      };
      search_people_for_checkin: {
        Args: { p_service_id: string; p_query: string; p_limit?: number };
        Returns: CheckinSearchResult[];
      };
      list_service_attendance: {
        Args: { p_service_id: string; p_include_voided?: boolean };
        Returns: ServiceAttendanceEntry[];
      };
      record_service_attendance: {
        Args: { p_service_id: string; p_person_id: string; p_method: CheckinMethod };
        Returns: RecordAttendanceResult;
      };
      set_service_checkin_state: {
        Args: { p_service_id: string; p_state: "abierto" | "cerrado" };
        Returns: undefined;
      };
      correct_attendance_add: {
        Args: { p_service_id: string; p_person_id: string; p_reason: string };
        Returns: RecordAttendanceResult;
      };
      void_service_attendance: {
        Args: { p_checkin_id: string; p_reason: string };
        Returns: undefined;
      };
      create_special_service: {
        Args: {
          p_name: string;
          p_service_type: ServiceType;
          p_local_date: string;
          p_local_time: string;
          p_location?: string | null;
          p_closes_minutes_after?: number | null;
        };
        Returns: string;
      };
      cancel_service: {
        Args: { p_service_id: string; p_reason: string | null };
        Returns: undefined;
      };
      reinstate_service: { Args: { p_service_id: string }; Returns: undefined };
      reschedule_service: {
        Args: {
          p_service_id: string;
          p_local_date: string;
          p_local_time: string;
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      update_service_series: {
        Args: {
          p_series_id: string;
          p_effective_from: string;
          p_name: string | null;
          p_service_type: ServiceType | null;
          p_weekday: number | null;
          p_local_time: string | null;
          p_location: string | null;
          p_opens_minutes_before: number | null;
          p_closes_minutes_after: number | null;
          p_end_series?: boolean;
        };
        Returns: { removed: number; kept: number; created: number; new_rule_id: string | null };
      };
      update_service_schedule_settings: { Args: { p_horizon_weeks: number }; Returns: number };
      service_attendance_report: {
        Args: { p_from: string; p_to: string; p_service_type?: ServiceType | null };
        Returns: {
          service_id: string;
          name: string;
          service_type: ServiceType;
          service_date: string;
          start_time: string | null;
          attendance: number;
        }[];
      };
      service_attendance_unique_people: {
        Args: { p_from: string; p_to: string; p_service_type?: ServiceType | null };
        Returns: number;
      };
    };
    Enums: {
      app_role: AppRole;
    };
  };
}
