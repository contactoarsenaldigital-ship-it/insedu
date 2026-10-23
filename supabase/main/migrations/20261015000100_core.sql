-- ═══════════════════════════════════════════════════════════════════════════
-- INSEDU · Proyecto Supabase PRINCIPAL · Esquema núcleo multi-tenant
-- Aislamiento por establecimiento con Row Level Security.
--
-- Contexto de seguridad:
--   * El backend fija el tenant y el usuario por transacción:
--       select set_config('app.tenant_id', '<uuid>', true);
--       select set_config('app.user_id',   '<uuid>', true);
--   * Para clientes con JWT de Supabase, se usa el claim "tenant_id".
--   Las políticas NO dependen de funciones exclusivas de Supabase, de modo que el mismo
--   esquema funciona en Cloud SQL (Etapa 2).
--
-- El Expediente Confidencial de Salvaguarda NO vive en esta base: está en otro proyecto
-- (supabase/vault). Aquí solo existen las instrucciones mínimas de protección.
-- ═══════════════════════════════════════════════════════════════════════════

-- gen_random_uuid() es nativo desde PostgreSQL 13; no se requiere pgcrypto.
create schema if not exists app;

-- ── Contexto ────────────────────────────────────────────────────────────────
create or replace function app.tenant_id() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('app.tenant_id', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'tenant_id'
  )::uuid
$$;

create or replace function app.user_id() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('app.user_id', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

-- ── Catálogo de roles (Plan Maestro §3) ─────────────────────────────────────
create type app.role as enum (
  'platform_admin','school_admin','director','teacher','head_teacher','inspector','gatekeeper',
  'psychologist','counselor','social_worker','nurse','safeguarding_lead',
  'guardian_academic','guardian_financial','student'
);

-- ── Institución ─────────────────────────────────────────────────────────────
create table app.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rbd text not null,
  time_zone text not null default 'America/Santiago',
  data_mode text not null default 'synthetic' check (data_mode in ('synthetic','real')),
  settings jsonb not null default '{}'::jsonb,   -- umbrales de alertas, reglas de refuerzo, etc.
  created_at timestamptz not null default now()
);

create table app.people (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  auth_user_id uuid unique,                       -- usuario de autenticación, si tiene acceso
  rut text not null,                              -- normalizado: cuerpo + DV, sin puntos ni guion
  first_name text not null,
  last_name text not null,
  email text,
  photo_path text,                                -- Storage privado, URL firmada
  created_at timestamptz not null default now(),
  unique (tenant_id, rut)
);

create table app.memberships (
  tenant_id uuid not null references app.tenants(id),
  person_id uuid not null references app.people(id),
  role app.role not null,
  active boolean not null default true,
  primary key (tenant_id, person_id, role)
);

create or replace function app.has_role(r app.role) returns boolean
language sql stable security definer set search_path = app, public as $$
  select exists (
    select 1 from app.memberships m join app.people p on p.id = m.person_id
    where m.tenant_id = app.tenant_id() and p.auth_user_id = app.user_id()
      and m.role = r and m.active
  )
$$;

create or replace function app.my_person_id() returns uuid
language sql stable security definer set search_path = app, public as $$
  select id from app.people where tenant_id = app.tenant_id() and auth_user_id = app.user_id()
$$;

create table app.courses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  year int not null,
  name text not null,                -- "7° Básico A"
  level text not null,
  head_teacher_id uuid references app.people(id),
  start_time time not null default '08:00'
);

create table app.subjects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  course_id uuid not null references app.courses(id),
  name text not null,
  teacher_id uuid references app.people(id)
);

create table app.enrollments (
  tenant_id uuid not null references app.tenants(id),
  student_id uuid not null references app.people(id),
  course_id uuid not null references app.courses(id),
  active boolean not null default true,
  primary key (tenant_id, student_id, course_id)
);

create table app.guardianships (
  tenant_id uuid not null references app.tenants(id),
  guardian_id uuid not null references app.people(id),
  student_id uuid not null references app.people(id),
  kind text not null check (kind in ('academic','financial')),
  primary key (tenant_id, guardian_id, student_id, kind)
);

-- ¿El usuario actual tiene vínculo funcional con el estudiante?
create or replace function app.can_see_student(sid uuid) returns boolean
language sql stable security definer set search_path = app, public as $$
  select
    app.has_role('director') or app.has_role('school_admin') or app.has_role('inspector')
    or app.has_role('psychologist') or app.has_role('counselor') or app.has_role('social_worker')
    or app.has_role('nurse') or app.has_role('safeguarding_lead')
    or sid = app.my_person_id()
    or exists (select 1 from app.guardianships g where g.tenant_id = app.tenant_id()
               and g.guardian_id = app.my_person_id() and g.student_id = sid)
    or exists (select 1 from app.enrollments e
               join app.courses c on c.id = e.course_id
               left join app.subjects s on s.course_id = c.id
               where e.tenant_id = app.tenant_id() and e.student_id = sid and e.active
                 and (c.head_teacher_id = app.my_person_id() or s.teacher_id = app.my_person_id()))
$$;

-- ── Asistencia ──────────────────────────────────────────────────────────────
-- Escaneos crudos: idempotentes por client_id (UUIDv7 generado en el dispositivo).
create table app.attendance_scans (
  client_id uuid primary key,
  tenant_id uuid not null references app.tenants(id),
  raw_code text not null,
  student_id uuid references app.people(id),
  scanned_at timestamptz not null,
  scanned_by uuid not null references app.people(id),
  device_id text not null,
  access_point text not null,
  outcome text not null check (outcome in ('recorded','duplicate','invalid_code','unknown_student')),
  received_at timestamptz not null default now()
);

-- Registro oficial diario: una fila por estudiante y día; se corrige, nunca se sobrescribe.
create table app.attendance_daily (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  student_id uuid not null references app.people(id),
  date date not null,
  status text not null check (status in ('present','late','absent','justified')),
  arrived_at timestamptz,
  source text not null check (source in ('credential_scan','teacher','import')),
  recorded_by uuid not null references app.people(id),
  recorded_at timestamptz not null default now(),
  unique (tenant_id, student_id, date)
);

-- Asistencia por clase (registrada por el docente) y leccionario
create table app.lessons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  subject_id uuid not null references app.subjects(id),
  date date not null,
  block text not null,                -- "1-2"
  content text not null,              -- leccionario
  teacher_id uuid not null references app.people(id),
  signed_at timestamptz               -- firma del docente: tras firmar, solo correcciones
);

create table app.lesson_attendance (
  tenant_id uuid not null references app.tenants(id),
  lesson_id uuid not null references app.lessons(id),
  student_id uuid not null references app.people(id),
  status text not null check (status in ('present','late','absent','justified')),
  primary key (lesson_id, student_id)
);

-- ── Calificaciones ──────────────────────────────────────────────────────────
create table app.evaluations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  subject_id uuid not null references app.subjects(id),
  title text not null,
  date date not null,
  weight numeric(5,2) not null default 1
);

create table app.grades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  evaluation_id uuid not null references app.evaluations(id),
  student_id uuid not null references app.people(id),
  value numeric(2,1) not null check (value between 1.0 and 7.0),
  recorded_by uuid not null references app.people(id),
  recorded_at timestamptz not null default now(),
  unique (evaluation_id, student_id)
);

-- Trazabilidad de correcciones del registro oficial (asistencia, notas, leccionario)
create table app.corrections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  table_name text not null,
  row_id uuid not null,
  old_value jsonb not null,
  new_value jsonb not null,
  reason text not null check (length(reason) >= 5),
  corrected_by uuid not null,
  corrected_at timestamptz not null default now()
);

create or replace function app.track_correction() returns trigger
language plpgsql security definer set search_path = app, public as $$
declare
  why text := nullif(current_setting('app.correction_reason', true), '');
begin
  if why is null then
    raise exception 'Las correcciones del registro oficial exigen motivo (app.correction_reason)';
  end if;
  insert into app.corrections(tenant_id, table_name, row_id, old_value, new_value, reason, corrected_by)
  values (old.tenant_id, tg_table_name, old.id, to_jsonb(old), to_jsonb(new), why, app.user_id());
  return new;
end $$;

create trigger trg_attendance_correction before update on app.attendance_daily
  for each row execute function app.track_correction();
create trigger trg_grades_correction before update on app.grades
  for each row execute function app.track_correction();
create trigger trg_lessons_correction before update on app.lessons
  for each row when (old.signed_at is not null) execute function app.track_correction();

-- ── Conducta y disciplina ───────────────────────────────────────────────────
create table app.conduct_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  student_id uuid not null references app.people(id),
  date date not null,
  kind text not null check (kind in ('positive','negative','commendation')),
  severity text check (severity in ('leve','grave','gravisima')),
  description text not null,
  formative_measure text,
  recorded_by uuid not null references app.people(id),
  recorded_at timestamptz not null default now(),
  check (kind <> 'negative' or severity is not null)
);

-- ── Salud integral (no confidencial: lo confidencial va a la bóveda) ────────
create table app.health_profiles (
  tenant_id uuid not null references app.tenants(id),
  student_id uuid primary key references app.people(id),
  allergies text,
  restrictions text,                  -- relevantes para la actividad escolar
  emergency_contact text,
  height_cm numeric(5,1),
  weight_kg numeric(5,1),
  updated_at timestamptz not null default now()
);

create table app.nurse_visits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  student_id uuid not null references app.people(id),
  at timestamptz not null default now(),
  reason text not null,
  action_taken text,
  sent_home boolean not null default false,
  nurse_id uuid not null references app.people(id)
);

-- ── Refuerzos positivos ─────────────────────────────────────────────────────
create table app.recognitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  student_id uuid not null references app.people(id),
  at timestamptz not null default now(),
  event_type text not null,
  points int not null check (points > 0),   -- los puntos nunca se descuentan
  badge text,
  message text not null,
  validated_by uuid references app.people(id)
);

-- ── Alertas de indicadores deficitarios ─────────────────────────────────────
create table app.alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  student_id uuid not null references app.people(id),
  dimension text not null check (dimension in ('asistencia','academica','conducta','salud')),
  code text not null,
  severity text not null check (severity in ('media','alta')),
  reason text not null,
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  owner_id uuid references app.people(id),
  action_note text
);

-- ── Instrucciones mínimas de protección (emitidas desde la bóveda) ─────────
create table app.protection_instructions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  student_id uuid not null references app.people(id),
  action text not null check (length(action) between 10 and 280),
  target_role app.role not null,
  target_person_id uuid references app.people(id),
  valid_from date not null,
  valid_until date not null check (valid_until > valid_from),
  return_channel text not null,
  issued_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

-- ── Comunicación ────────────────────────────────────────────────────────────
create table app.announcements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  course_id uuid references app.courses(id),
  title text not null,
  body text not null,
  requires_ack boolean not null default false,
  author_id uuid not null references app.people(id),
  published_at timestamptz not null default now()
);

create table app.announcement_reads (
  announcement_id uuid not null references app.announcements(id),
  person_id uuid not null references app.people(id),
  read_at timestamptz not null default now(),
  primary key (announcement_id, person_id)
);

create table app.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants(id),
  thread_id uuid not null,
  sender_id uuid not null references app.people(id),
  recipient_id uuid not null references app.people(id),
  body text not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz
);

-- ── Auditoría (solo inserción) ──────────────────────────────────────────────
create table app.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid,
  actor_id uuid,
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create or replace function app.audit_immutable() returns trigger
language plpgsql as $$ begin raise exception 'audit_log es inmutable'; end $$;
create trigger trg_audit_no_update before update or delete on app.audit_log
  for each row execute function app.audit_immutable();

-- ═══════════════════════════ ROW LEVEL SECURITY ═══════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'tenants','people','memberships','courses','subjects','enrollments','guardianships',
    'attendance_scans','attendance_daily','lessons','lesson_attendance','evaluations','grades',
    'corrections','conduct_records','health_profiles','nurse_visits','recognitions','alerts',
    'protection_instructions','announcements','announcement_reads','messages','audit_log'
  ] loop
    -- Sin FORCE: las funciones security definer (dueño del esquema) evalúan pertenencia
    -- sin recursión de políticas; los clientes usan el rol "authenticated", sujeto a RLS.
    execute format('alter table app.%I enable row level security', t);
  end loop;
end $$;

-- Privilegios base para el rol de clientes; RLS decide qué filas.
grant usage on schema app to authenticated;
grant select, insert, update on all tables in schema app to authenticated;
revoke update on app.audit_log from authenticated;
grant execute on all functions in schema app to authenticated;
grant usage on all sequences in schema app to authenticated;
revoke all on schema app from anon;

-- Aislamiento de tenant (base de todas las tablas con tenant_id)
create policy tenant_self on app.tenants for select using (id = app.tenant_id());

create policy people_read on app.people for select using (
  tenant_id = app.tenant_id() and (id = app.my_person_id() or app.can_see_student(id)
    or exists (select 1 from app.memberships m where m.person_id = people.id and m.role not in ('student')))
);
create policy memberships_read on app.memberships for select using (tenant_id = app.tenant_id());
create policy courses_read on app.courses for select using (tenant_id = app.tenant_id());
create policy subjects_read on app.subjects for select using (tenant_id = app.tenant_id());
create policy enrollments_read on app.enrollments for select using (tenant_id = app.tenant_id() and app.can_see_student(student_id));
create policy guardianships_read on app.guardianships for select using (tenant_id = app.tenant_id() and app.can_see_student(student_id));

-- Asistencia: escanean portería, inspectoría y docentes; leen quienes tienen vínculo.
create policy scans_insert on app.attendance_scans for insert with check (
  tenant_id = app.tenant_id() and scanned_by = app.my_person_id()
  and (app.has_role('gatekeeper') or app.has_role('inspector') or app.has_role('teacher') or app.has_role('head_teacher'))
);
create policy scans_read on app.attendance_scans for select using (
  tenant_id = app.tenant_id() and (app.has_role('inspector') or app.has_role('director') or scanned_by = app.my_person_id())
);
create policy attendance_read on app.attendance_daily for select using (tenant_id = app.tenant_id() and app.can_see_student(student_id));
create policy attendance_write on app.attendance_daily for insert with check (
  tenant_id = app.tenant_id() and (app.has_role('gatekeeper') or app.has_role('inspector') or app.has_role('teacher') or app.has_role('head_teacher'))
);
create policy attendance_correct on app.attendance_daily for update using (
  tenant_id = app.tenant_id() and (app.has_role('inspector') or app.has_role('head_teacher') or app.has_role('school_admin'))
);

create policy lessons_rw on app.lessons for all using (
  tenant_id = app.tenant_id() and (teacher_id = app.my_person_id() or app.has_role('director') or app.has_role('school_admin'))
) with check (tenant_id = app.tenant_id() and teacher_id = app.my_person_id());
create policy lesson_att_read on app.lesson_attendance for select using (tenant_id = app.tenant_id() and app.can_see_student(student_id));
create policy lesson_att_write on app.lesson_attendance for insert with check (
  tenant_id = app.tenant_id() and exists (select 1 from app.lessons l where l.id = lesson_id and l.teacher_id = app.my_person_id())
);

create policy evaluations_read on app.evaluations for select using (tenant_id = app.tenant_id());
create policy evaluations_write on app.evaluations for insert with check (
  tenant_id = app.tenant_id() and exists (select 1 from app.subjects s where s.id = subject_id and s.teacher_id = app.my_person_id())
);
create policy grades_read on app.grades for select using (tenant_id = app.tenant_id() and app.can_see_student(student_id));
create policy grades_write on app.grades for insert with check (
  tenant_id = app.tenant_id() and recorded_by = app.my_person_id()
  and exists (select 1 from app.evaluations e join app.subjects s on s.id = e.subject_id
              where e.id = evaluation_id and s.teacher_id = app.my_person_id())
);
create policy grades_correct on app.grades for update using (
  tenant_id = app.tenant_id() and (recorded_by = app.my_person_id() or app.has_role('school_admin'))
);
create policy corrections_read on app.corrections for select using (
  tenant_id = app.tenant_id() and (app.has_role('director') or app.has_role('school_admin') or app.has_role('inspector'))
);

create policy conduct_read on app.conduct_records for select using (tenant_id = app.tenant_id() and app.can_see_student(student_id));
create policy conduct_write on app.conduct_records for insert with check (
  tenant_id = app.tenant_id() and recorded_by = app.my_person_id()
  and (app.has_role('teacher') or app.has_role('head_teacher') or app.has_role('inspector'))
);

-- Salud: ficha visible para enfermería, profesionales, el propio estudiante y su apoderado.
create policy health_read on app.health_profiles for select using (
  tenant_id = app.tenant_id() and (
    app.has_role('nurse') or app.has_role('psychologist') or app.has_role('counselor') or app.has_role('safeguarding_lead')
    or student_id = app.my_person_id()
    or exists (select 1 from app.guardianships g where g.tenant_id = app.tenant_id() and g.guardian_id = app.my_person_id() and g.student_id = health_profiles.student_id)
  )
);
create policy health_write on app.health_profiles for all using (tenant_id = app.tenant_id() and app.has_role('nurse'))
  with check (tenant_id = app.tenant_id() and app.has_role('nurse'));
create policy nurse_read on app.nurse_visits for select using (tenant_id = app.tenant_id() and app.can_see_student(student_id));
create policy nurse_write on app.nurse_visits for insert with check (tenant_id = app.tenant_id() and app.has_role('nurse') and nurse_id = app.my_person_id());

create policy recognitions_read on app.recognitions for select using (tenant_id = app.tenant_id() and app.can_see_student(student_id));
create policy alerts_read on app.alerts for select using (
  tenant_id = app.tenant_id() and app.can_see_student(student_id) and not app.has_role('student')
  and not app.has_role('guardian_academic') and not app.has_role('guardian_financial')
);
create policy alerts_update on app.alerts for update using (
  tenant_id = app.tenant_id() and (owner_id = app.my_person_id() or app.has_role('head_teacher') or app.has_role('inspector'))
);

-- Instrucción mínima: solo el destinatario (rol o persona) la ve.
create policy instructions_read on app.protection_instructions for select using (
  tenant_id = app.tenant_id() and (target_person_id = app.my_person_id() or (target_person_id is null and app.has_role(target_role)))
);
create policy instructions_ack on app.protection_instructions for update using (
  tenant_id = app.tenant_id() and (target_person_id = app.my_person_id() or (target_person_id is null and app.has_role(target_role)))
);

create policy announcements_read on app.announcements for select using (tenant_id = app.tenant_id());
create policy announcements_write on app.announcements for insert with check (
  tenant_id = app.tenant_id() and author_id = app.my_person_id()
  and (app.has_role('teacher') or app.has_role('head_teacher') or app.has_role('director') or app.has_role('inspector'))
);
create policy reads_own on app.announcement_reads for all using (person_id = app.my_person_id()) with check (person_id = app.my_person_id());
create policy messages_own on app.messages for select using (
  tenant_id = app.tenant_id() and (sender_id = app.my_person_id() or recipient_id = app.my_person_id())
);
create policy messages_send on app.messages for insert with check (tenant_id = app.tenant_id() and sender_id = app.my_person_id());

create policy audit_insert on app.audit_log for insert with check (tenant_id = app.tenant_id());
create policy audit_read on app.audit_log for select using (tenant_id = app.tenant_id() and app.has_role('director'));

-- Índices de uso frecuente
create index on app.attendance_daily (tenant_id, date);
create index on app.grades (tenant_id, student_id);
create index on app.conduct_records (tenant_id, student_id, date);
create index on app.alerts (tenant_id, status, severity);
