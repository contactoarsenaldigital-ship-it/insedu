-- ═══════════════════════════════════════════════════════════════════════════
-- INSEDU · Proyecto Supabase BÓVEDA · Expediente Confidencial de Salvaguarda
--
-- Este proyecto es FÍSICAMENTE distinto del principal. Reglas:
--   * Ningún cliente (anon / authenticated) tiene acceso: solo el servicio de bóveda,
--     que corre en el servidor con su propia credencial y aplica la política de
--     packages/domain/src/safeguarding/policy.ts antes de cada operación.
--   * El contenido se guarda CIFRADO (envelope AES-256-GCM, llave por colegio).
--     Un administrador con acceso a esta base solo ve bytes cifrados.
--   * El log de accesos es inmutable.
-- ═══════════════════════════════════════════════════════════════════════════

-- gen_random_uuid() es nativo desde PostgreSQL 13; no se requiere pgcrypto.
create schema if not exists vault;

revoke all on schema vault from public;
revoke all on schema vault from anon, authenticated;

-- Titular vigente y suplencia formal por establecimiento (uno por colegio).
create table vault.assignments (
  tenant_id uuid primary key,
  titular_user_id uuid not null,
  titular_active boolean not null default true,
  substitute_user_id uuid,
  substitute_from timestamptz,
  substitute_until timestamptz,
  updated_at timestamptz not null default now(),
  check ((substitute_user_id is null) = (substitute_from is null)
     and (substitute_from is null) = (substitute_until is null)),
  check (substitute_user_id is null or substitute_user_id <> titular_user_id)
);

-- Historial de designaciones (procedimiento formal, dos aprobaciones).
create table vault.designations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  previous_user_id uuid,
  new_user_id uuid not null,
  kind text not null check (kind in ('titular','suplencia','revocacion')),
  approvals uuid[] not null check (cardinality(approvals) >= 2),
  at timestamptz not null default now()
);

-- Expediente: un caso por estudiante y motivo; contenido cifrado.
create table vault.cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  student_id uuid not null,              -- id del estudiante en el proyecto principal
  opened_at timestamptz not null default now(),
  status text not null default 'abierto' check (status in ('abierto','seguimiento','cerrado')),
  protocol text,                          -- protocolo interno activado
  sealed jsonb not null                   -- SealedRecord: { v, kp, wrappedDek, payload }
);

-- Antecedentes depositados por profesionales (depósito sin lectura).
create table vault.deposits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  student_id uuid not null,
  deposited_by uuid not null,
  deposited_role text not null,
  kind text not null check (kind in ('entrevista','derivacion','documento','nota_seguimiento','revelacion')),
  sealed jsonb not null,
  deposited_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- Activación de protocolos y deber de denuncia (plazos y cumplimiento, sin relato).
create table vault.protocol_activations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null references vault.cases(id),
  protocol text not null,
  activated_by uuid not null,
  activated_at timestamptz not null default now(),
  report_due_at timestamptz,               -- p. ej. denuncia en 24 horas
  reported_at timestamptz,
  reported_to text,                        -- organismo
  report_reference text
);

-- Break-glass: alcance mínimo (un estudiante), vigencia corta, revisión posterior.
create table vault.break_glass_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  granted_to uuid not null,
  student_id uuid not null,
  reason text not null check (reason in ('riesgo_inminente','obligacion_legal')),
  justification text not null check (length(justification) >= 20),
  approved_by uuid[] not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at <= created_at + interval '4 hours'),
  reviewed_at timestamptz,
  review_note text
);

-- Log de accesos inmutable (lo ve el panel de auditoría, sin contenido).
create table vault.access_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  actor_id uuid not null,
  action text not null check (action in ('open','export','deposit','break_glass','designation','denied')),
  student_id uuid,
  basis text,
  reason text,
  at timestamptz not null default now()
);

create or replace function vault.immutable() returns trigger
language plpgsql as $$ begin raise exception 'Registro inmutable'; end $$;
create trigger trg_access_log_immutable before update or delete on vault.access_log
  for each row execute function vault.immutable();
create trigger trg_designations_immutable before update or delete on vault.designations
  for each row execute function vault.immutable();

-- RLS habilitado SIN políticas: nadie entra salvo el rol de servicio del servidor.
do $$
declare t text;
begin
  foreach t in array array['assignments','designations','cases','deposits','protocol_activations','break_glass_grants','access_log'] loop
    execute format('alter table vault.%I enable row level security', t);
    execute format('alter table vault.%I force row level security', t);
    execute format('revoke all on vault.%I from anon, authenticated', t);
  end loop;
end $$;

create index on vault.cases (tenant_id, student_id);
create index on vault.access_log (tenant_id, at);
