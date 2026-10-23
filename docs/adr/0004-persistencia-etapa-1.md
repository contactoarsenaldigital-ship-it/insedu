# ADR 0004 · Persistencia de la Etapa 1 por documentos sincronizados

- **Estado:** aceptada (16-oct-2026)

## Contexto
Vercel ejecuta la aplicación en varias instancias que pueden encenderse y apagarse en cualquier
momento. Con el estado solo en memoria, lo registrado en una instancia no se veía en otra y se perdía
al reiniciar. La Etapa 1 trabaja exclusivamente con el colegio ficticio y debe estar disponible para
demostraciones a SLEP y corporaciones municipales.

## Decisión
- El estado de la demostración se guarda en PostgreSQL (Supabase) como **documentos JSON, uno por
  registro** (`demo.documents`), con un número de revisión por establecimiento (`demo.revisions`).
- Cada instancia mantiene el estado en memoria y lo sincroniza (`packages/persistence`):
  - al comenzar cada solicitud compara la revisión y recarga si cambió;
  - al terminar cada acción guarda solo los registros modificados y sube la revisión;
  - la siembra inicial ocurre una sola vez gracias a un bloqueo consultivo de PostgreSQL.
- La bóveda de Salvaguarda usa **otra base de datos** (`VAULT_DATABASE_URL`, otro proyecto Supabase),
  guarda el contenido de los casos **cifrado** y exige `VAULT_MASTER_KEY` común a todas las instancias.
- Ningún rol de cliente (`anon`, `authenticated`) tiene acceso al esquema `demo`.

## Consecuencias
- Lo registrado se ve en todas las instancias y sobrevive reinicios y nuevos despliegues.
- Concurrencia: la última escritura gana por registro; si otra instancia escribió entre medio, la
  revisión lo detecta y se recarga. Adecuado para demostraciones, no para datos reales.
- El esquema relacional con RLS (`20261015000100_core.sql`) queda para la **Etapa 2**, con datos reales.
  Las pantallas y reglas no cambian: se reemplaza la capa de datos detrás de los mismos contratos.
- Con unos 18.000 registros, la carga completa de una instancia nueva toma alrededor de un segundo;
  las solicitudes siguientes solo consultan la revisión.

## Verificación
- `packages/persistence/test/sync.test.ts`: siembra única con dos instancias simultáneas, visibilidad
  cruzada, escrituras cruzadas sin pérdida, reinicio y modo memoria.
- `e2e/multi-instancia.mjs`: dos servidores Next.js sobre la misma base (felicitación, evaluación,
  antecedente a Salvaguarda y escaneos duplicados entre servidores).
