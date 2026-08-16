-- Notificaciones, emails y encuestas.

create type notification_channel as enum ('email');
create type notification_status as enum ('en_cola', 'enviado', 'fallido');

create table notification_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  subject text not null,
  body_markdown text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger notification_templates_set_updated_at
  before update on notification_templates
  for each row
  execute function moddatetime_updated_at();

alter table notification_templates enable row level security;

create policy notification_templates_select_staff on notification_templates
  for select
  using (is_staff());

create policy notification_templates_write_admin on notification_templates
  for all
  using (is_admin())
  with check (is_admin());

-- Registro de cada envío (o intento) de notificación. No almacena
-- contenido confidencial (ver regla: emails de oración sin texto completo).
create table notification_log (
  id uuid primary key default gen_random_uuid(),
  channel notification_channel not null default 'email',
  template_code text,
  recipient_person_id uuid references people (id),
  recipient_email text,
  subject text,
  status notification_status not null default 'en_cola',
  related_entity_type text,
  related_entity_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  created_by uuid references auth.users (id)
);

create index notification_log_recipient_idx on notification_log (recipient_person_id);
create index notification_log_status_idx on notification_log (status);

alter table notification_log enable row level security;

create policy notification_log_select_staff on notification_log
  for select
  using (is_staff() or recipient_person_id = current_person_id());

create policy notification_log_write_staff on notification_log
  for all
  using (is_staff())
  with check (is_staff());

-- Encuestas simples.
create type survey_question_type as enum ('texto', 'opcion_unica', 'opcion_multiple', 'escala');

create table surveys (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

alter table surveys enable row level security;

create policy surveys_select_authenticated on surveys
  for select
  using (auth.uid() is not null and (is_active or is_staff()));

create policy surveys_write_staff on surveys
  for all
  using (is_staff())
  with check (is_staff());

create table survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys (id) on delete cascade,
  question_text text not null,
  question_type survey_question_type not null default 'texto',
  options jsonb,
  order_index integer not null default 0,
  is_required boolean not null default false
);

create index survey_questions_survey_idx on survey_questions (survey_id);

alter table survey_questions enable row level security;

create policy survey_questions_select_authenticated on survey_questions
  for select
  using (auth.uid() is not null);

create policy survey_questions_write_staff on survey_questions
  for all
  using (is_staff())
  with check (is_staff());

create table survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys (id) on delete cascade,
  person_id uuid references people (id),
  submitted_at timestamptz not null default now(),
  unique (survey_id, person_id)
);

create index survey_responses_survey_idx on survey_responses (survey_id);

alter table survey_responses enable row level security;

create policy survey_responses_select on survey_responses
  for select
  using (is_staff() or person_id = current_person_id());

create policy survey_responses_insert_own on survey_responses
  for insert
  with check (person_id = current_person_id() or person_id is null);

create table survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references survey_responses (id) on delete cascade,
  question_id uuid not null references survey_questions (id),
  answer_text text,
  answer_options jsonb
);

create index survey_answers_response_idx on survey_answers (response_id);

alter table survey_answers enable row level security;

create policy survey_answers_select on survey_answers
  for select
  using (
    is_staff()
    or exists (
      select 1 from survey_responses sr
      where sr.id = survey_answers.response_id
        and sr.person_id = current_person_id()
    )
  );

create policy survey_answers_insert_own on survey_answers
  for insert
  with check (
    exists (
      select 1 from survey_responses sr
      where sr.id = survey_answers.response_id
        and (sr.person_id = current_person_id() or sr.person_id is null)
    )
  );
