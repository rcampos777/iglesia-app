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
  | "administrador";

export type MembershipStatus = "visitante" | "asistente_habitual" | "miembro" | "inactivo";

export type GenderType = "masculino" | "femenino" | "no_especifica";

export type ClassStatus = "planificada" | "activa" | "completada" | "cancelada";

export type EnrollmentStatus = "inscrito" | "en_progreso" | "completado" | "retirado";

export type AttendanceStatus = "presente" | "ausente" | "excusado" | "tarde";

export type ServiceType = "culto_general" | "oracion" | "jovenes" | "ninos" | "otro";

export type CheckinMethod = "qr" | "manual";

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
  is_minor: boolean;
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
      | "id"
      | "is_minor"
      | "created_at"
      | "updated_at"
      | "first_name"
      | "last_name"
      | "membership_status"
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
  service_date: string;
  start_time: string | null;
  location: string | null;
  is_checkin_open: boolean;
  created_at: string;
  created_by: string | null;
};

export type ServiceCheckinRow = {
  id: string;
  service_id: string;
  person_id: string;
  method: CheckinMethod;
  checked_in_at: string;
  checked_in_by: string | null;
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
      audit_log: TableDef<AuditLogRow>;
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
    };
    Enums: {
      app_role: AppRole;
    };
  };
}
