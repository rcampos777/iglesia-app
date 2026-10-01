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
  | "correccion_asistencia"
  | "apostol"
  | "finanzas"
  | "sitio_web";

export type MembershipStatus = "visitante" | "asistente_habitual" | "miembro" | "inactivo";
export type PersonSource = "manual" | "importacion" | "inscripcion_actividad" | "registro_cuenta";

export type GenderType = "masculino" | "femenino" | "no_especifica";

export type ClassStatus = "planificada" | "activa" | "completada" | "cancelada";

export type EnrollmentStatus = "inscrito" | "en_progreso" | "completado" | "retirado";

export type AttendanceStatus = "presente" | "ausente" | "excusado" | "tarde";

export type ServiceType = "culto_general" | "oracion" | "jovenes" | "ninos" | "otro";

export type MinistryMemberRole = "lider" | "colider" | "miembro";

export type ActivityStatus = "planificada" | "abierta" | "realizada" | "cancelada";

export type CheckinMethod = "qr" | "manual";

export type DonationType = "diezmo" | "ofrenda" | "semilla" | "primicias";

export type DonationPaymentMethod =
  "efectivo" | "ath" | "credito" | "ath_movil" | "cheque" | "giro";

export type DonationStatus = "vigente" | "anulada";

export type DonationLetterStatus = "vigente" | "requiere_revision" | "reemplazada";

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
  source: PersonSource;
  source_activity_id: string | null;
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

export type DonationRow = {
  id: string;
  person_id: string | null;
  is_anonymous: boolean;
  donation_date: string;
  /** Centavos enteros. */
  amount_cents: number;
  donation_type: DonationType;
  payment_method: DonationPaymentMethod;
  reference: string | null;
  status: DonationStatus;
  version: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};

export type FinanceSettingsRow = {
  id: boolean;
  church_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  letter_recipient: string;
  letter_body: string;
  letter_closing: string;
  signer_name: string | null;
  signer_title: string | null;
  template_status: "borrador" | "aprobada";
  updated_at: string;
  updated_by: string | null;
};

export type DonationListItem = {
  id: string;
  donation_date: string;
  person_id: string | null;
  donor_name: string | null;
  is_anonymous: boolean;
  amount_cents: number;
  donation_type: DonationType;
  payment_method: DonationPaymentMethod;
  reference: string | null;
  status: DonationStatus;
  created_at: string;
  total_count: number;
};

export type DonationTotals = {
  total_cents: number;
  count: number;
  identified_cents: number;
  identified_count: number;
  anonymous_cents: number;
  anonymous_count: number;
  by_type: { key: DonationType; cents: number; count: number }[];
  by_method: { key: DonationPaymentMethod; cents: number; count: number }[];
};

export type DonationRevision = {
  revision: number;
  action: "creada" | "corregida" | "anulada";
  before: Partial<DonationRow> | null;
  after: Partial<DonationRow>;
  reason: string | null;
  created_at: string;
  actor_name: string | null;
};

export type DonationDetail = {
  donation: DonationRow;
  donor_name: string | null;
  created_by_name: string | null;
  has_prayer_note: boolean;
  revisions: DonationRevision[];
};

export type LetterData = {
  person_name: string;
  total_cents: number;
  donation_count: number;
  next_version: number;
  donations: { date: string; type: DonationType; amount_cents: number }[];
  settings: Omit<FinanceSettingsRow, "id" | "updated_at" | "updated_by">;
};

export type DonationLetterListItem = {
  id: string;
  person_id: string;
  person_name: string;
  period_start: string;
  period_end: string;
  version: number;
  document_code: string;
  total_cents: number;
  donation_count: number;
  status: DonationLetterStatus;
  review_reason: string | null;
  issued_at: string;
  issued_by_name: string | null;
};

export type SiteMediaRow = {
  id: string;
  storage_path: string;
  thumb_path: string;
  alt_text: string;
  width: number | null;
  height: number | null;
  created_at: string;
  created_by: string | null;
};

export type SiteSettingsRow = {
  id: boolean;
  hero_eyebrow: string;
  hero_title: string;
  hero_subtitle: string | null;
  hero_media_id: string | null;
  about_title: string;
  about_text: string | null;
  about_media_id: string | null;
  mission_text: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  map_query: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  youtube_url: string | null;
  portal_url: string;
  updated_at: string;
  updated_by: string | null;
};

export type SiteAlbumRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  album_date: string | null;
  cover_media_id: string | null;
  published: boolean;
  sort_order: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
};

export type SiteAlbumPhotoRow = {
  album_id: string;
  media_id: string;
  sort_order: number;
  caption: string | null;
};

export type SitePostRow = {
  id: string;
  kind: "evento" | "anuncio";
  title: string;
  body: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  media_id: string | null;
  link_url: string | null;
  link_label: string | null;
  visible_until: string | null;
  published: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string;
};

export type SiteVideoRow = {
  id: string;
  title: string;
  youtube_id: string;
  description: string | null;
  recorded_on: string | null;
  featured: boolean;
  published: boolean;
  created_at: string;
  created_by: string | null;
};

export type SiteMinistryRow = {
  id: string;
  name: string;
  description: string | null;
  media_id: string | null;
  sort_order: number;
  published: boolean;
  created_at: string;
};

export type SiteTeamRow = {
  id: string;
  name: string;
  role_title: string | null;
  bio: string | null;
  media_id: string | null;
  sort_order: number;
  published: boolean;
  created_at: string;
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
  end_date: string | null;
  registration_open: boolean;
  registration_slug: string | null;
  registration_closes_on: string | null;
  price_cents: number | null;
  deposit_cents: number | null;
  payment_instructions: string | null;
  what_to_bring: string | null;
  contact_info: string | null;
  confirmation_message: string | null;
  flyer_media_id: string | null;
  notify_emails: string[];
};

export type RegistrationMatchStatus = "vinculado" | "posible_duplicado";
export type RegistrationPaymentMethod = "ath_movil" | "efectivo" | "cheque" | "otro";

export type ActivityRegistrationRow = {
  id: string;
  activity_id: string;
  first_name: string;
  last_name: string;
  address: string;
  age: number;
  phone: string;
  email: string;
  emergency_name: string;
  emergency_phone: string;
  attends_church: boolean;
  church_name: string | null;
  has_medical_condition: boolean;
  medical_details: string | null;
  terms_accepted_at: string;
  person_id: string | null;
  match_status: RegistrationMatchStatus;
  candidate_person_ids: string[];
  amount_paid_cents: number;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  notes: string | null;
};

export type ActivityRegistrationPaymentRow = {
  id: string;
  registration_id: string;
  amount_cents: number;
  method: RegistrationPaymentMethod;
  paid_on: string;
  reference: string | null;
  created_at: string;
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

export type CertificationTypeRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  created_by: string | null;
};

export type PersonCertificationRow = {
  id: string;
  person_id: string;
  type_id: string;
  issued_on: string | null;
  expires_on: string | null;
  file_path: string | null;
  file_name: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type CertificationListRow = {
  id: string;
  person_id: string;
  person_name: string;
  type_id: string;
  type_name: string;
  issued_on: string | null;
  expires_on: string | null;
  has_file: boolean;
  file_name: string | null;
  notes: string | null;
  updated_at: string;
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
      donations: TableDef<DonationRow>;
      site_media: TableDef<SiteMediaRow>;
      site_settings: TableDef<SiteSettingsRow>;
      site_albums: TableDef<SiteAlbumRow>;
      site_album_photos: TableDef<SiteAlbumPhotoRow>;
      site_posts: TableDef<SitePostRow>;
      site_videos: TableDef<SiteVideoRow>;
      certification_types: TableDef<CertificationTypeRow>;
      person_certifications: TableDef<PersonCertificationRow>;
      site_ministries: TableDef<SiteMinistryRow>;
      site_team: TableDef<SiteTeamRow>;
      finance_settings: TableDef<FinanceSettingsRow>;
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
      activity_registrations: TableDef<ActivityRegistrationRow>;
      activity_registration_payments: TableDef<ActivityRegistrationPaymentRow>;
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
      activity_taken_spots: { Args: { p_activity_id: string }; Returns: number };
      public_registration_activity: {
        Args: { p_slug: string };
        Returns: {
          name: string;
          description: string | null;
          activity_date: string;
          end_date: string | null;
          start_time: string | null;
          end_time: string | null;
          location: string | null;
          price_cents: number | null;
          deposit_cents: number | null;
          payment_instructions: string | null;
          contact_info: string | null;
          flyer_path: string | null;
          flyer_alt: string | null;
          is_open: boolean;
          is_full: boolean;
        }[];
      };
      submit_activity_registration: {
        Args: {
          p_slug: string;
          p_first_name: string;
          p_last_name: string;
          p_address: string;
          p_age: number;
          p_phone: string;
          p_email: string;
          p_emergency_name: string;
          p_emergency_phone: string;
          p_attends_church: boolean;
          p_church_name: string | null;
          p_has_medical_condition: boolean;
          p_medical_details: string | null;
          p_accept_terms: boolean;
        };
        Returns: {
          registration_id: string;
          person_id: string | null;
          match_status: RegistrationMatchStatus;
        }[];
      };
      link_activity_registration: {
        Args: { p_registration_id: string; p_person_id: string | null };
        Returns: string;
      };
      set_prayer_ministry: {
        Args: { p_ministry_id: string; p_enabled: boolean };
        Returns: undefined;
      };
      person_delete_blockers: {
        Args: { p_person_id: string };
        Returns: Record<string, number>;
      };
      delete_person: {
        Args: { p_person_id: string; p_reason: string };
        Returns: undefined;
      };
      list_people_for_class_enrollment: {
        Args: { p_class_offering_id: string };
        Returns: { id: string; first_name: string; last_name: string }[];
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
      can_edit_site: { Args: Record<string, never>; Returns: boolean };
      public_service_schedule: {
        Args: Record<string, never>;
        Returns: { weekday: number; local_time: string; name: string }[];
      };
      has_finance_access: { Args: Record<string, never>; Returns: boolean };
      is_apostol: { Args: Record<string, never>; Returns: boolean };
      apostol_set_financial_role: {
        Args: { p_user_id: string; p_role: AppRole; p_grant: boolean; p_reason?: string | null };
        Returns: "concedido" | "revocado" | "sin_cambios";
      };
      finance_list_role_holders: {
        Args: Record<string, never>;
        Returns: {
          user_id: string;
          display_name: string;
          email: string | null;
          role: AppRole;
          granted_at: string;
          granted_by_name: string | null;
        }[];
      };
      finance_search_accounts: {
        Args: { p_query: string };
        Returns: {
          user_id: string;
          display_name: string;
          email: string | null;
          roles: AppRole[];
        }[];
      };
      certifications_list: {
        Args: { p_person_id?: string | null };
        Returns: CertificationListRow[];
      };
      certification_log_file_view: {
        Args: { p_certification_id: string };
        Returns: string;
      };
      finance_get_person: {
        Args: { p_person_id: string };
        Returns: { person_id: string; display_name: string }[];
      };
      finance_search_people: {
        Args: { p_query: string };
        Returns: { person_id: string; display_name: string; hint: string | null }[];
      };
      create_donation: {
        Args: {
          p_idempotency_key: string;
          p_person_id: string | null;
          p_is_anonymous: boolean;
          p_donation_date: string;
          p_amount_cents: number;
          p_donation_type: DonationType;
          p_payment_method: DonationPaymentMethod;
          p_reference?: string | null;
          p_prayer_text?: string | null;
          p_share_with_intercession?: boolean;
          p_share_authorized?: boolean;
        };
        Returns: { id: string; created: boolean };
      };
      correct_donation: {
        Args: {
          p_donation_id: string;
          p_expected_version: number;
          p_person_id: string | null;
          p_is_anonymous: boolean;
          p_donation_date: string;
          p_amount_cents: number;
          p_donation_type: DonationType;
          p_payment_method: DonationPaymentMethod;
          p_reference: string | null;
          p_reason: string;
        };
        Returns: number;
      };
      void_donation: {
        Args: { p_donation_id: string; p_expected_version: number; p_reason: string };
        Returns: number;
      };
      read_donation_prayer_note: {
        Args: { p_donation_id: string };
        Returns: {
          content: string;
          created_at: string;
          shared: boolean;
          share_authorized_at: string | null;
          share_authorized_by_name: string | null;
        }[];
      };
      share_donation_prayer_note: {
        Args: { p_donation_id: string; p_authorized: boolean };
        Returns: "compartida" | "ya_compartida";
      };
      finance_list_donations: {
        Args: {
          p_from?: string | null;
          p_to?: string | null;
          p_person_id?: string | null;
          p_type?: DonationType | null;
          p_method?: DonationPaymentMethod | null;
          p_status?: DonationStatus | null;
          p_identity?: "identificadas" | "anonimas" | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: DonationListItem[];
      };
      finance_donation_totals: {
        Args: {
          p_from?: string | null;
          p_to?: string | null;
          p_person_id?: string | null;
          p_type?: DonationType | null;
          p_method?: DonationPaymentMethod | null;
          p_identity?: "identificadas" | "anonimas" | null;
        };
        Returns: DonationTotals;
      };
      finance_donor_yearly: {
        Args: { p_person_id: string };
        Returns: { year: number; total_cents: number; donation_count: number }[];
      };
      finance_get_donation: { Args: { p_donation_id: string }; Returns: DonationDetail | null };
      finance_record_export: {
        Args: { p_filters: Record<string, unknown>; p_rows: number };
        Returns: undefined;
      };
      finance_update_settings: {
        Args: {
          p_church_name: string;
          p_address: string | null;
          p_phone: string | null;
          p_email: string | null;
          p_tax_id: string | null;
          p_letter_recipient: string;
          p_letter_body: string;
          p_letter_closing: string;
          p_signer_name: string | null;
          p_signer_title: string | null;
          p_template_status: "borrador" | "aprobada";
        };
        Returns: undefined;
      };
      finance_letter_data: {
        Args: { p_person_id: string; p_from: string; p_to: string };
        Returns: LetterData;
      };
      issue_donation_letter: {
        Args: {
          p_letter_id: string;
          p_person_id: string;
          p_from: string;
          p_to: string;
          p_expected_total_cents: number;
          p_expected_count: number;
          p_expected_version: number;
          p_document_code: string;
          p_snapshot: Record<string, unknown>;
          p_pdf_base64: string;
        };
        Returns: { id: string; created: boolean };
      };
      list_donation_letters: {
        Args: { p_person_id?: string | null };
        Returns: DonationLetterListItem[];
      };
      get_donation_letter_pdf: {
        Args: { p_letter_id: string };
        Returns: { document_code: string; pdf_base64: string }[];
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
