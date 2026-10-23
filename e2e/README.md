# Pruebas de extremo a extremo (navegador real)

Recorren la PWA como lo haría una persona: ingreso por rol, libro de clases y correcciones; salud, bóveda de
Salvaguarda, verificación en dos pasos, emergencia, suplencia y auditoría; refuerzos, canjes, metas,
comunicados con confirmación de lectura y mensajería con reglas de protección de menores.

```bash
pnpm install
pnpm exec playwright install chromium     # una sola vez
pnpm build && pnpm --filter @insedu/web start   # en otra terminal (http://localhost:3000)
mkdir e2e/capturas
node e2e/libro.mjs
```

Además, `e2e/multi-instancia.mjs` verifica dos servidores sobre la misma base de datos (`BASE_A`, `BASE_B`).

Cada prueba termina con `RESULTADO: TODO OK` o lista las fallas. Los datos viven en memoria y las pruebas
los modifican: **reinicie el servidor antes de cada prueba** (`libro.mjs`, `salud-salvaguarda.mjs`,
`refuerzos-comunicacion.mjs`).

Variables opcionales: `BASE_URL`, `SHOTS_DIR` (por defecto `e2e/capturas`), `CHROMIUM_PATH`.
