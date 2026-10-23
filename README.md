# INSEDU · MVP Etapa 1

Plataforma PWA de acompañamiento integral del estudiante (académico, salud integral, conducta),
según el **Plan Maestro v1.2** y el documento *INSEDU – Análisis, Propuesta de Solución y Plan de Implementación*.

**Etapa 1:** MVP demostrable en **Vercel + Supabase** con un colegio **sintético** (sin datos reales).
**Etapa 2:** piloto productivo en **Google Cloud Santiago**, con Gemini pagado (ver `docs/adr`).

## Qué incluye (E1-F0 a E1-F4)

| Área | Estado |
| --- | --- |
| Monorepo pnpm, TypeScript estricto | ✅ |
| Dominio: RUT y credencial (código de barras = RUT), escaneo offline idempotente con detección de duplicados | ✅ probado |
| Motor de refuerzo positivo (Skinner/Pavlov) y ranking de progreso personal | ✅ probado |
| Indicadores deficitarios por estudiante y curso (asistencia, académico, conducta, salud) | ✅ probado |
| Salvaguarda: política de acceso exclusivo, suplencia, depósito sin lectura, break-glass, instrucción mínima | ✅ probado |
| Cifrado de sobre AES-256-GCM con llave por colegio | ✅ probado |
| AI Gateway con bloqueo del nivel gratuito ante datos reales, detector de datos personales y cuotas | ✅ probado |
| Exportación para MINEDUC por plantillas + informe de consistencia | ✅ probado (formatos oficiales por confirmar) |
| Migraciones Supabase: proyecto principal con RLS y proyecto bóveda aislado | ✅ probado en PostgreSQL embebido |
| PWA Next.js: paneles por rol, escáner con cámara, Copiloto Docente, exportación | ✅ compila y responde |
| Libro de clases: asistencia por clase, leccionario con firma, notas ponderadas (aproximación 0,05), anotaciones | ✅ E1-F1 · probado de extremo a extremo |
| Correcciones del registro oficial con motivo, valor anterior, autor y fecha | ✅ E1-F1 |
| Ingreso de demostración por usuario ficticio con permisos aplicados en el servidor | ✅ E1-F1 |
| Salud integral: ficha de salud, atenciones de enfermería, aviso de atenciones repetidas, derivación | ✅ E1-F2 |
| Bóveda de Salvaguarda operativa: casos cifrados, depósito sin lectura, protocolos con plazos, instrucciones mínimas con acuse, suplencia, acceso de emergencia, auditoría | ✅ E1-F2 · probado de extremo a extremo |
| Verificación en dos pasos (demostración) para abrir el expediente | ✅ E1-F2 |
| Refuerzos: saldo y niveles (canjear no baja de nivel), insignias, catálogo, canje validado por el profesor jefe, metas cooperativas del curso | ✅ E1-F3 · probado de extremo a extremo |
| Comunicación: comunicados con confirmación de lectura, mensajería con horario de contacto y sin conversaciones privadas con estudiantes | ✅ E1-F3 |
| Menú según rol, usable en teléfono | ✅ E1-F3 |
| Persistencia en PostgreSQL/Supabase compartida entre instancias, bóveda en base separada, reinicio de la demostración | ✅ E1-F4 · probado con dos servidores |
| Autenticación real (Supabase Auth + MFA) | ⏳ Etapa 2 |

## Estructura

```
apps/web                 PWA Next.js (App Router)
packages/domain          Lógica de negocio pura y probada (cliente + servidor)
  src/server.ts          Solo servidor: cifrado de bóveda y proveedores de IA
packages/persistence     Sincronización del estado con PostgreSQL entre instancias
packages/sql-tests       Pruebas de RLS sobre las migraciones reales (PGlite)
supabase/main            Migraciones del proyecto Supabase principal
supabase/vault           Migraciones del proyecto Supabase de la bóveda
docs/adr                 Decisiones de arquitectura
```

## Desarrollo local

Requisitos: Node 20+ y pnpm 10.

```bash
pnpm install
pnpm test            # dominio (86) + persistencia (7) + RLS (12)
pnpm dev             # http://localhost:3000
pnpm seed:print      # resumen del colegio sintético
```

Sin variables de entorno, la app funciona en memoria con el colegio sintético y el Copiloto en modo
demostración. Con `DATABASE_URL` y `VAULT_DATABASE_URL` guarda todo en PostgreSQL (ver ADR 0004).
**Demo → Reiniciar** (como administración o dirección) vuelve el colegio ficticio a su estado inicial.

**Libro de clases:** entre en `/ingresar` y elija un usuario ficticio (por ejemplo, Carolina Fuentes, docente de
Matemática y profesora jefe de 5° Básico A). Lo registrado se guarda en memoria y se reinicia al detener el
servidor; la capa `apps/web/src/lib/repository.ts` define el contrato que implementará Supabase.

**Salud y Salvaguarda:** ingrese como Lorena Pizarro (enfermería), Andrea Soto (psicología), Verónica Díaz
(Encargada de Salvaguarda), Patricio Reyes (suplente formal) o Jorge Valenzuela (director). Para abrir un caso,
la pantalla de verificación muestra el código de demostración.

**Refuerzos y comunicación:** ingrese como Trinidad Valenzuela (estudiante), su apoderado/a, o Carolina Fuentes
(profesora jefe de 5° Básico A). Pruebas en navegador: ver `e2e/README.md`.

## Despliegue Etapa 1

Guía paso a paso en [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md): GitHub, dos proyectos Supabase en São Paulo,
Vercel y variables de entorno.

## Reglas que no se negocian

- Nunca cargar datos reales con `AI_TIER=free`: el gateway lo bloquea (`FREE_TIER_WITH_REAL_DATA`).
- El contenido de la bóveda nunca pasa por el AI Gateway ni por la base principal.
- Las correcciones del registro oficial (asistencia, notas, leccionario firmado) exigen motivo y quedan trazadas.
- `GEMINI_API_KEY`, las cadenas de conexión y `VAULT_*` jamás llevan prefijo `NEXT_PUBLIC_`.
