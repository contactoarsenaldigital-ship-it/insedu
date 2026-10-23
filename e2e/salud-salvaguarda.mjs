import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SHOTS_DIR ?? "e2e/capturas";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const log = (...a) => console.log(...a);
const fail = (m) => { console.log("FALLA:", m); process.exitCode = 1; };

async function as(firstName, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/ingresar`);
  await page.getByRole("button", { name: `Ingresar como ${firstName}` }).click();
  await page.waitForURL(/\/libro/);
  return page;
}
async function submit(page, locator) {
  const before = page.url();
  await locator.click();
  await page.waitForURL((u) => u.toString() !== before, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
}
const notice = async (page) => (await page.locator(".notice.ok, .notice.warn").first().textContent().catch(() => ""))?.trim();
async function verifyMfa(page) {
  if (!page.url().includes("/verificar")) return false;
  const code = (await page.locator(".notice strong").first().textContent()).trim();
  await page.fill("#code", code);
  await submit(page, page.getByRole("button", { name: "Verificar" }));
  return true;
}

// 1) Enfermería: atención + derivación a Salvaguarda
const nurse = await as("Lorena");
await nurse.goto(`${BASE}/salud?s=student-066`);
await nurse.fill("#reason", "Dolor abdominal");
await nurse.fill("#action", "Reposo y llamado al apoderado");
await nurse.locator('input[name="sentHome"]').check();
await submit(nurse, nurse.getByRole("button", { name: "Registrar atención" }));
log("Enfermería:", await notice(nurse));
await nurse.screenshot({ path: `${OUT}/10-salud.png`, fullPage: true });
await nurse.getByRole("link", { name: "Derivar a Salvaguarda" }).click();
await nurse.waitForURL(/depositar/);
await nurse.fill("#text", "Cuarta atención por dolor abdominal; la estudiante evita volver a la sala después del recreo.");
await submit(nurse, nurse.getByRole("button", { name: "Entregar a Salvaguarda" }));
log("Depósito enfermería:", await notice(nurse));

// 2) Docente sin acceso a salud ni a depósito
const teacher = await as("Carolina");
await teacher.goto(`${BASE}/salud?s=student-066`);
if (await teacher.locator("#allergies").count()) fail("una docente no debe ver la ficha de salud");
await teacher.goto(`${BASE}/salvaguarda/depositar`);
if (await teacher.locator("#text").count()) fail("una docente no debe depositar");

// 3) Titular de Salvaguarda
const sg = await as("Verónica");
await sg.goto(`${BASE}/salvaguarda`);
const pending = await sg.locator('form button:has-text("Revisar e incorporar")').count();
log("Antecedentes pendientes para la titular:", pending);
if (pending < 3) fail("deberían verse al menos 3 antecedentes pendientes");
await sg.screenshot({ path: `${OUT}/11-bandeja.png`, fullPage: true });
// Revisar el antecedente de la enfermera (student-066 = 1° Medio A)
const card = sg.locator("form.card", { hasText: "Lorena Pizarro" }).last();
await submit(sg, card.getByRole("button", { name: /Revisar e incorporar/ }));
if (await verifyMfa(sg)) {
  log("Se pidió verificación en dos pasos: OK");
  const card2 = sg.locator("form.card", { hasText: "Lorena Pizarro" }).last();
  await submit(sg, card2.getByRole("button", { name: /Revisar e incorporar/ }));
} else fail("debía pedir verificación en dos pasos");
const caseUrl = sg.url().split("?")[0];
log("Caso:", caseUrl.replace(BASE, ""), "·", await notice(sg));
if (!(await sg.getByText("evita volver a la sala").count())) fail("el antecedente debía quedar en el expediente");

// Protocolo con plazo de 24 h
await sg.selectOption('select[name="protocolId"]', "posible_delito");
await submit(sg, sg.getByRole("button", { name: "Activar protocolo" }));
log("Protocolo:", await notice(sg));
// Instrucción con término sensible → rechazo
await sg.fill("#action", "Tiene ansiedad, permitir salida de sala");
await sg.selectOption("#targetRole", "head_teacher");
await submit(sg, sg.getByRole("button", { name: "Emitir instrucción" }));
const rej = await notice(sg);
log("Instrucción con diagnóstico:", rej);
if (!rej?.includes("ansiedad")) fail("debía rechazar la instrucción con diagnóstico");
await sg.fill("#action", "Permitir salida de sala sin pedir explicación y avisar a inspectoría");
await sg.selectOption("#targetRole", "head_teacher");
await submit(sg, sg.getByRole("button", { name: "Emitir instrucción" }));
log("Instrucción válida:", await notice(sg));
await sg.screenshot({ path: `${OUT}/12-caso.png`, fullPage: true });
await sg.selectOption('select[name="to"]', "Ministerio Público");
await sg.fill('input[name="reference"]', "RUC 2600123456-7");
await submit(sg, sg.getByRole("button", { name: "Registrar cumplimiento" }));
log("Cumplimiento:", await notice(sg));

// 4) Profesora jefe de 1° Medio A recibe solo la instrucción
const head = await as("Paula");
const instr = head.locator(".card.instruction");
log("Instrucciones para la profesora jefe:", await instr.count());
if (!(await instr.count())) fail("la profesora jefe debía ver la instrucción");
const instrText = await instr.first().innerText();
if (/dolor|abdominal|recreo|delito/i.test(instrText)) fail("la instrucción no debe revelar antecedentes");
await submit(head, instr.first().getByRole("button", { name: "Confirmar recepción" }));
log("Acuse:", (await head.locator(".card.instruction .tag").first().textContent())?.trim());

// 5) Director y psicóloga no pueden abrir el caso
const dir = await as("Jorge");
await dir.goto(`${caseUrl}?motivo=curiosidad`);
await verifyMfa(dir);
await dir.goto(`${caseUrl}?motivo=curiosidad`);
const dirText = await dir.locator("main").innerText();
log("Director abre el caso:", dirText.includes("Acceso denegado") ? "denegado" : "¡VE EL CASO!");
if (!dirText.includes("Acceso denegado")) fail("el director no debe ver el caso");
const psy = await as("Andrea");
await psy.goto(`${caseUrl}?motivo=revisar`);
await verifyMfa(psy);
await psy.goto(`${caseUrl}?motivo=revisar`);
if (!(await psy.locator("main").innerText()).includes("Acceso denegado")) fail("la psicóloga no debe ver el caso");
else log("Psicóloga abre el caso: denegado");

// 6) Director: acceso de emergencia para ese estudiante
await dir.goto(`${BASE}/salvaguarda/auditoria`);
await dir.selectOption("#studentId", "student-066");
await dir.fill("#justification", "La familia informa riesgo vital y la Encargada de Salvaguarda no es ubicable.");
await submit(dir, dir.getByRole("button", { name: "Solicitar acceso de emergencia" }));
log("Emergencia:", await notice(dir));
await dir.getByRole("link", { name: /Abrir caso \(solo lectura\)/ }).first().click();
await dir.waitForLoadState("networkidle");
if (dir.url().includes("motivo") === false) {
  await dir.selectOption("#motivo", { index: 0 }).catch(() => {});
  await submit(dir, dir.getByRole("button", { name: "Abrir expediente" }));
}
const em = await dir.locator("main").innerText();
log("Director con emergencia:", em.includes("Acceso de emergencia") ? "lectura de emergencia" : em.slice(0, 120));
if (await dir.locator("#text").count()) fail("en emergencia no se puede escribir");
await dir.goto(`${BASE}/salvaguarda/auditoria`);
const rows = await dir.locator("table.data tbody tr").count();
const denied = await dir.locator("table.data tbody tr", { hasText: "Intento denegado" }).count();
log(`Auditoría: ${rows} registros, ${denied} intentos denegados`);
if (denied < 2) fail("la auditoría debe mostrar los intentos denegados");
if (/evita volver a la sala/.test(await dir.locator("main").innerText())) fail("la auditoría no debe mostrar contenido");
await dir.screenshot({ path: `${OUT}/13-auditoria.png`, fullPage: true });

// 7) Suplencia: la titular pierde acceso, el suplente lo gana
await sg.goto(`${BASE}/salvaguarda`);
const until = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
await sg.fill("#until", until);
await sg.selectOption("#substituteId", "sg-2");
await submit(sg, sg.getByRole("button", { name: "Activar suplencia" }));
log("Suplencia:", await notice(sg));
const sub = await as("Patricio");
await sub.goto(`${BASE}/salvaguarda`);
log("Suplente ve bandeja:", (await sub.getByRole("heading", { name: "Casos" }).count()) ? "sí" : "no");
await sg.goto(`${caseUrl}?motivo=Seguimiento del caso`);
log("Titular durante suplencia:", (await sg.locator("main").innerText()).includes("Acceso denegado") ? "denegado" : "¡accede!");

await browser.close();
log(process.exitCode ? "RESULTADO: CON FALLAS" : "RESULTADO: TODO OK");
