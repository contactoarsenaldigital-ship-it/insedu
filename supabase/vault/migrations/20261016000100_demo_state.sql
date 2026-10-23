-- ═══════════════════════════════════════════════════════════════════════════
-- INSEDU · Proyecto BÓVEDA · Estado de la demostración (Etapa 1)
--
-- La Etapa 1 trabaja SOLO con el colegio ficticio. Su estado se guarda como documentos JSON
-- (casos, depósitos, protocolos y log de accesos; el contenido de los casos va CIFRADO) para que todas las instancias
-- de Vercel compartan los mismos datos y nada se pierda al reiniciar.
--
-- La Etapa 2 (datos reales) usa el esquema de 20261015000100_vault.sql.
-- Ver docs/adr/0004-persistencia-etapa-1.md.
--
-- Acceso: solo el servidor (conexión directa con credenciales de servidor). Ningún rol de
-- cliente (anon / authenticated) puede leer ni escribir estas tablas.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists demo;

create table if not exists demo.documents (
  tenant_id text not null,
  collection text not null,
  id text not null,
  seq bigint generated always as identity,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, collection, id)
);
create index if not exists documents_order on demo.documents (tenant_id, collection, seq);

create table if not exists demo.revisions (
  tenant_id text primary key,
  rev bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table demo.documents enable row level security;
alter table demo.revisions enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema demo from anon';
    execute 'revoke all on all tables in schema demo from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema demo from authenticated';
    execute 'revoke all on all tables in schema demo from authenticated';
  end if;
end $$;
