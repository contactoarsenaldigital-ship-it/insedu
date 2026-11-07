-- ═══════════════════════════════════════════════════════════════════════════
-- INSEDU · Proyecto PRINCIPAL · Documentos escaneados (Etapa 1)
--
-- Contenido de los documentos adjuntos (resoluciones, poderes, justificativos). Va separado de
-- demo.documents porque el estado se carga completo en cada solicitud y los archivos no: se leen
-- solo al descargarlos. La ficha de cada documento (nombre, tipo, huella) vive en demo.documents.
--
-- El contenido se guarda CIFRADO por el servidor (AES-256-GCM). La base nunca ve el archivo en claro.
-- Acceso: solo el servidor. Ningún rol de cliente puede leer ni escribir esta tabla.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists demo;

create table if not exists demo.files (
  tenant_id text not null,
  id text not null,
  content bytea not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

alter table demo.files enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on demo.files from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on demo.files from authenticated';
  end if;
end $$;
