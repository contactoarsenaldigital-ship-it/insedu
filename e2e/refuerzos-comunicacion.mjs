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
  await page.waitForURL(/\/(libro|refuerzos)/);
  return page;
}
async function submit(page, locator) {
  const before = page.url();
  await locator.click();
  await page.waitForURL((u) => u.toString() !== before, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
}
const notice = async (page) => (await page.locator(".notice.ok, .notice.warn").first().textContent().catch(() => ""))?.trim();
const kpis = async (page) => {
  const t = await page.locator(".card .kpi").allTextContents();
  return { level: t[0], balance: Number(t[1]) };
};

// 1) Estudiante: canje con su saldo
const student = await as("Trinidad", { width: 390, height: 844 });
if (!student.url().includes("/refuerzos")) fail("el estudiante debe llegar a sus refuerzos");
const before = await kpis(student);
log("Estudiante antes:", before);
const card = student.locator("form.card", { hasText: "Elegir la música del recreo" });
await submit(student, card.getByRole("button", { name: "Canjear" }));
log("Canje:", await notice(student));
const after = await kpis(student);
log("Estudiante después:", after);
if (after.balance !== before.balance - 30) fail("el saldo debe bajar 30 puntos");
if (after.level !== before.level) fail("el nivel no debe bajar al canjear");
if (!(await student.locator("form.card", { hasText: "Elegir la música del recreo" }).getByText("Ya tienes una solicitud pendiente").count())) fail("debe impedir una segunda solicitud");
await student.screenshot({ path: `${OUT}/20-estudiante-refuerzos.png`, fullPage: true });
await student.goto(`${BASE}/mensajes`);
if (await student.getByRole("link", { name: /^Mensajes/ }).count()) fail("el estudiante no debe tener mensajería privada");
log("Estudiante en comunicación:", (await student.locator(".notice").first().textContent()).slice(0, 60) + "…");

// 2) Profesora jefe: resolver canjes, meta y recompensa
const head = await as("Carolina");
await head.goto(`${BASE}/refuerzos`);
const pendingCards = head.locator("form.card", { has: head.getByRole("button", { name: "Rechazar" }) });
log("Canjes por revisar:", await pendingCards.count());
const trini = pendingCards.filter({ hasText: "Trinidad" });
const otherReq = pendingCards.filter({ hasNotText: "Trinidad" }).first();
await submit(head, otherReq.getByRole("button", { name: "Rechazar" }));
const noNote = await notice(head);
log("Rechazo sin motivo:", noNote);
if (!noNote?.includes("explique")) fail("al rechazar debe exigir un mensaje");
await head.locator("form.card", { has: head.getByRole("button", { name: "Rechazar" }) }).filter({ hasNotText: "Trinidad" }).first().locator('input[name="note"]').fill("Esta semana la usaremos para el acto");
await submit(head, head.locator("form.card", { has: head.getByRole("button", { name: "Rechazar" }) }).filter({ hasNotText: "Trinidad" }).first().getByRole("button", { name: "Rechazar" }));
log("Rechazo con motivo:", await notice(head));
await submit(head, head.locator("form.card", { has: head.getByRole("button", { name: "Aprobar" }) }).filter({ hasText: "Trinidad" }).getByRole("button", { name: "Aprobar" }));
log("Aprobación:", await notice(head));
await head.fill("#gtitle", "Diez anotaciones positivas esta semana");
await head.selectOption("#metric", "anotaciones_positivas");
await head.fill("#target", "10");
await head.fill("#greward", "Clase de Educación Física al aire libre");
await submit(head, head.getByRole("button", { name: "Crear meta del curso" }));
log("Meta:", await notice(head));
await head.fill("#rname", "Elegir el juego de la última hora");
await submit(head, head.getByRole("button", { name: "Agregar recompensa" }));
log("Recompensa:", await notice(head));
await head.screenshot({ path: `${OUT}/21-profesor-jefe-refuerzos.png`, fullPage: true });

// Felicitación en el libro → refuerzo inmediato en el saldo del estudiante
await head.goto(`${BASE}/libro/course-1--matematica?tab=anotaciones`);
await head.selectOption("#studentId", "student-001");
await head.selectOption("#kind", "commendation");
await head.fill("#description", "Explicó a su grupo cómo resolver el problema de fracciones.");
await submit(head, head.getByRole("button", { name: "Registrar" }));
log("Felicitación:", await notice(head));

// Comunicado con confirmación y mensaje a la apoderada
await head.goto(`${BASE}/mensajes`);
await head.selectOption("#courseId", "course-1");
await head.fill("#title", "Salida pedagógica al Museo de Historia Natural");
await head.fill("#body", "El martes 27 de octubre visitaremos el museo. Necesitamos la autorización firmada.");
await head.locator('input[name="requiresAck"]').check();
await submit(head, head.getByRole("button", { name: "Publicar" }));
log("Comunicado:", await notice(head));
await head.goto(`${BASE}/mensajes?tab=mensajes`);
await head.getByRole("link", { name: /Apoderado\/a de Trinidad/ }).click();
await head.waitForLoadState("networkidle");
await head.fill("#body", "Le recuerdo enviar la autorización de la salida pedagógica.");
await submit(head, head.getByRole("button", { name: "Enviar" }));
log("Mensaje a apoderada:", await notice(head));

// 3) Apoderada: ve logros (sin canjear), confirma lectura y responde
const guardian = await as("Apoderado/a");
const gk = await kpis(guardian);
log("Apoderada ve saldo de su hija:", gk);
if (gk.balance !== after.balance + 15) fail(`la felicitación debía sumar 15 puntos (esperado ${after.balance + 15}, visto ${gk.balance})`);
if (await guardian.getByRole("button", { name: "Canjear" }).count()) fail("el apoderado no canjea por el estudiante");
await guardian.goto(`${BASE}/mensajes`);
const ann = guardian.locator("article", { hasText: "Museo de Historia Natural" });
await submit(guardian, ann.getByRole("button", { name: "Confirmar lectura" }));
log("Confirmación:", await notice(guardian));
await guardian.goto(`${BASE}/mensajes?tab=mensajes`);
const tabText = await guardian.getByRole("link", { name: /^Mensajes/ }).textContent();
log("Pestaña de mensajes de la apoderada:", tabText);
await guardian.getByRole("link", { name: /Carolina Fuentes/ }).click();
await guardian.waitForLoadState("networkidle");
await guardian.fill("#body", "Gracias, profesora. Mañana la envío firmada.");
await submit(guardian, guardian.getByRole("button", { name: "Enviar" }));
log("Respuesta:", await notice(guardian));
await guardian.goto(`${BASE}/mensajes?tab=mensajes`);
const options = await guardian.locator("#to option").allTextContents();
log("Destinatarios posibles de la apoderada:", options.length - 1);
if (options.some((o) => o.includes("Lorena Pizarro"))) fail("no debe poder escribir a personal sin vínculo con el curso");
if (!options.some((o) => o.includes("Carolina Fuentes"))) fail("debe poder escribir a la profesora jefe");
await guardian.screenshot({ path: `${OUT}/22-apoderada-mensajes.png`, fullPage: true });

// 4) La profesora ve la confirmación
await head.goto(`${BASE}/mensajes`);
const rate = await head.locator("article", { hasText: "Museo de Historia Natural" }).locator(".muted").first().textContent();
log("Confirmaciones:", rate);
if (!rate?.startsWith("1 de")) fail("debía registrarse 1 confirmación");

// 5) Estudiante ve su canje aprobado
await student.goto(`${BASE}/refuerzos`);
const st = await student.locator("table.data tbody tr").first().innerText();
log("Estado del canje para la estudiante:", st.replace(/\s+/g, " "));
if (!st.includes("aprobado")) fail("el canje debe aparecer aprobado");

await browser.close();
log(process.exitCode ? "RESULTADO: CON FALLAS" : "RESULTADO: TODO OK");
