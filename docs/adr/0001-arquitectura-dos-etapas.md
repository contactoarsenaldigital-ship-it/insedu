# ADR 0001 · Arquitectura en dos etapas con el mismo código

- **Estado:** aceptada (15-oct-2026)
- **Decisión:** Etapa 1 en Vercel + Supabase con datos sintéticos; Etapa 2 en Google Cloud región Santiago.

## Contexto
INSEDU necesita un MVP demostrable para conseguir colegios piloto (SLEP Marga Marga, Corporación Municipal
de Colina) con bajo costo, y un entorno productivo con datos en Chile cuando el piloto se formalice.

## Decisión
- La lógica de negocio vive en `packages/domain` (TypeScript puro, sin dependencias de proveedor).
- PostgreSQL estándar; las políticas RLS usan `app.tenant_id()` / `app.user_id()` basados en
  `set_config`, compatibles con Supabase y Cloud SQL.
- Next.js corre igual en Vercel y en un contenedor de Cloud Run.
- Adaptadores para lo que cambia: proveedor de llaves (`KeyProvider`: HKDF local → Cloud KMS),
  proveedor de IA (`AiProvider`: Gemini gratuito → Gemini pagado), almacenamiento y colas.

## Consecuencias
- Migrar a GCP no exige reescribir dominio ni esquema.
- Supabase no tiene región en Chile; aceptable solo con datos sintéticos.
