# ADR 0003 · Gemini en nivel gratuito solo con datos sintéticos

- **Estado:** aceptada (15-oct-2026)

## Contexto
Los términos del nivel gratuito de la API de Gemini permiten a Google usar entradas y salidas para mejorar sus
productos (con revisión humana) y exigen usuarios mayores de 18 años. INSEDU mantendrá el nivel gratuito
hasta formalizar y financiar el piloto.

## Decisión
- `AI_TIER=free` + `INSEDU_DATA_MODE=real` → el gateway rechaza toda solicitud (`FREE_TIER_WITH_REAL_DATA`).
- Ninguna llamada originada por estudiantes.
- Detector de RUT, correos, teléfonos y nombres de estudiantes antes de enviar.
- Registro de consumo sin persistir contenido.
- El paso a servicio pagado es un cambio de configuración y de adaptador, no de código consumidor.
