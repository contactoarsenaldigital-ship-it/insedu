/**
 * Prueba de persistencia con DOS servidores sobre la misma base de datos (como Vercel).
 * Lo que se registra en un servidor debe verse en el otro, y los duplicados de escaneo se
 * detectan aunque cada escaneo llegue a un servidor distinto.
 *
 *   BASE_A=http://localhost:3100 BASE_B=http://localhost:3101 node e2e/multi-instancia.mjs
 */
import { chromium } from "playwright";

const A = process.env.BASE_A ?? "http://localhost:3100";
const B = process.env.BASE_B ?? "http://localhost:3101";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const log = (...a) => console.log(...a);
const fail = (m) => { console.log("FALLA:", m); process.exitCode = 1; };

async function as(base, firstName) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${base}/ingresar`);
  await page.getByRole("button", { name: `Ingresar como ${firstName}` }).click();
  await page.waitForURL(/\/(libro|refuerzos)/);
  return page;
}
async function submit(page, locator) {
  const before = page.url();
  await locator.click();
  await page.waitForURL((u) => u.toString() !== before, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
}
const balance = async (page) => Number((await page.locator(".card .kpi").nth(1).textContent()).trim());

// 1) Saldo visto en B antes y después de una felicitación registrada en A
const studentB = await as(B, "Trinidad");
const before = await balance(studentB);
const teacherA = await as(A, "Carolina");
await teacherA.goto(`${A}/libro/course-1--matematica?tab=anotaciones`);
await teacherA.selectOption("#studentId", "student-001");
await teacherA.selectOption("#kind", "commendation");
await teacherA.fill("#description", "Felicitación registrada en el servidor A para la prueba.");
await submit(teacherA, teacherA.getByRole("button", { name: "Registrar" }));
await studentB.reload();
const after = await balance(studentB);
log(`Saldo en B: ${before} → ${after}`);
if (after !== before + 15) fail("la felicitación registrada en A debía verse en B (+15)");

// 2) Evaluación creada en B, visible en A
const teacherB = await as(B, "Carolina");
await teacherB.goto(`${B}/libro/course-1--matematica?tab=notas`);
await teacherB.fill("#title", "Prueba creada en el servidor B");
await submit(teacherB, teacherB.getByRole("button", { name: "Crear evaluación" }));
await teacherA.goto(`${A}/libro/course-1--matematica?tab=notas`);
const seen = await teacherA.getByText("Prueba creada en el servidor B").count();
log("Evaluación de B vista en A:", seen ? "sí" : "no");
if (!seen) fail("la evaluación creada en B debía verse en A");

// 3) Antecedente entregado en A, visible para Salvaguarda en B
const nurseA = await as(A, "Lorena");
await nurseA.goto(`${A}/salvaguarda/depositar?s=student-090`);
await nurseA.fill("#text", "Antecedente de prueba entregado en el servidor A para verificar la persistencia.");
await submit(nurseA, nurseA.getByRole("button", { name: "Entregar a Salvaguarda" }));
const sgB = await as(B, "Verónica");
await sgB.goto(`${B}/salvaguarda`);
const dep = await sgB.locator("form.card", { hasText: "Lorena Pizarro" }).count();
log("Antecedentes de enfermería visibles en B:", dep);
if (dep < 2) fail("el antecedente entregado en A debía verse en B");

// 4) Escaneo duplicado entre servidores (registrar asistencia exige sesión de docente, inspectoría o portería)
const gateA = await as(A, "Carolina");
const gateB = await as(B, "Carolina");
await gateA.goto(`${A}/escanear`);
const rut = (await gateA.locator("details code").first().textContent())?.trim();
const ev = (clientId) => ({ clientId, tenantId: "00000000-0000-7000-8000-000000000001", rawCode: rut, scannedAt: new Date().toISOString(), scannedBy: "gate-1", deviceId: clientId.slice(-4), accessPoint: "Acceso principal" });
const post = (page, base, e) => page.request.post(`${base}/api/attendance/scan`, { data: { events: [e] } }).then((r) => r.json());
const anon = await fetch(`${A}/api/attendance/scan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events: [ev("019a0000-0000-7000-8000-0000000000c3")] }) });
if (anon.status !== 401) fail("sin sesión, el escaneo debía rechazarse con 401");
const r1 = await post(gateA, A, ev("019a0000-0000-7000-8000-0000000000a1"));
const r2 = await post(gateB, B, ev("019a0000-0000-7000-8000-0000000000b2"));
const r3 = await post(gateB, B, ev("019a0000-0000-7000-8000-0000000000a1"));
log("Escaneo en A:", r1.results[0].outcome.kind, "· mismo RUT en B:", r2.results[0].outcome.kind, "· reintento del mismo escaneo en B:", r3.results[0].outcome.kind);
if (r1.results[0].outcome.kind !== "recorded") fail("el primer escaneo debía registrarse");
if (r2.results[0].outcome.kind !== "duplicate") fail("el segundo escaneo del mismo RUT en otro servidor debía detectarse como duplicado");
if (r3.results[0].outcome.kind !== "already_synced") fail("el reintento del mismo escaneo debía reconocerse como ya sincronizado");

await browser.close();
log(process.exitCode ? "RESULTADO: CON FALLAS" : "RESULTADO: TODO OK");
