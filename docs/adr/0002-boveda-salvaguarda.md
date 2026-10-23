# ADR 0002 · Bóveda de Salvaguarda en proyecto separado

- **Estado:** aceptada (15-oct-2026)

## Decisión
- El Expediente Confidencial vive en un proyecto de base de datos distinto (`supabase/vault`), sin acceso
  para roles cliente (RLS habilitado y forzado sin políticas; privilegios revocados).
- Contenido cifrado con envelope AES-256-GCM, una llave por colegio y datos asociados (tenant + registro).
- Acceso ordinario exclusivo del titular vigente; durante la suplencia formal accede solo el suplente.
- Profesionales de apoyo: depósito sin lectura.
- Break-glass: un estudiante, máximo 4 horas, justificación, segundo factor; no permite exportar.
- El Encargado de Salvaguarda activa los protocolos internos (incluida la denuncia) y la bóveda registra plazos
  y cumplimiento, sin copiar el relato.

## Verificación
- `packages/domain/test/safeguarding.test.ts`: pruebas negativas para director, administradores, docentes,
  inspectoría, profesionales, apoderados y estudiantes.
- `packages/sql-tests/test/rls.test.ts`: el rol `authenticated` no puede leer `vault.cases`.
