import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SHOTS_DIR ?? "e2e/capturas";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const log = (...a) => console.log(...a);
const fail = (m) => { console.log("FALLA:", m); process.exitCode = 1; };

async function loginAs(page, firstName) {
  await page.goto(`${BASE}/ingresar`);
  await page.getByRole("button", { name: `Ingresar como ${firstName}` }).click();
  await page.waitForURL(/\/libro/);
}
async function submit(page, locator) {
  const before = page.url();
  await locator.click();
  await page.waitForURL((u) => u.toString() !== before, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
}
const notice = async (page) => (await page.locator(".notice.ok, .notice.warn").first().textContent())?.trim();

// ── Docente de Matemática, profesora jefe de 5° Básico A ──
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/libro`);
if (!page.url().includes("/ingresar")) fail("sin sesión debería redirigir a /ingresar");
await loginAs(page, "Carolina");
await page.screenshot({ path: `${OUT}/01-libro.png`, fullPage: true });

await page.getByRole("link", { name: /Matemática/ }).first().click();
await page.waitForURL(/course-1--matematica/);
const subjectUrl = page.url().split("?")[0];

// Clase: marcar un ausente y firmar al guardar
await page.fill("#content", "Resolución guiada de problemas con fracciones en parejas.");
await page.fill("#objective", "OA 3");
const firstRow = page.locator("table.att tbody tr").first();
const studentName = (await firstRow.locator("td").first().textContent()).trim();
await firstRow.locator('input[value="absent"]').check();
await page.locator('input[name="sign"]').check();
await submit(page, page.getByRole("button", { name: "Guardar clase" }));
log("Clase:", await notice(page));
if (!(await page.getByText("✓ Firmada").count())) fail("la clase debería quedar firmada");
await page.screenshot({ path: `${OUT}/02-clase.png`, fullPage: true });

// Corrección de asistencia sin motivo suficiente → HTML required minLength bloquea; probamos con motivo válido
await page.locator("details summary").first().click();
const corrForm = page.locator("details form.inline-form").first();
await corrForm.locator("select").selectOption("justified");
await corrForm.locator('input[name="reason"]').fill("Apoderado presentó certificado médico");
await submit(page, corrForm.getByRole("button", { name: "Guardar" }));
log("Corrección asistencia:", await notice(page));

// Notas: crear evaluación, ingresar notas
await page.goto(`${subjectUrl}?tab=notas`);
await page.fill("#title", "Prueba de fracciones");
await submit(page, page.getByRole("button", { name: "Crear evaluación" }));
log("Evaluación:", await notice(page));
const inputs = page.locator(".grade-input input");
const n = await inputs.count();
const vals = ["55", "3,9", "6.2", "7", "4"];
for (let i = 0; i < n; i++) await inputs.nth(i).fill(vals[i % vals.length]);
await submit(page, page.getByRole("button", { name: "Guardar notas" }));
log("Notas:", await notice(page));
await page.screenshot({ path: `${OUT}/03-notas.png`, fullPage: true });

// Corregir una nota sin motivo → debe rechazar
const editLink = page.getByRole("link", { name: "Ingresar / corregir" }).last();
await editLink.click();
await page.waitForLoadState("networkidle");
await page.locator(".grade-input input").first().fill("6,0");
await submit(page, page.getByRole("button", { name: "Guardar notas" }));
const noReason = await notice(page);
log("Corrección sin motivo:", noReason);
if (!noReason?.includes("motivo")) fail("debe exigir motivo al corregir");
await page.locator(".grade-input input").first().fill("6,0");
await page.fill("#reason", "Error de digitación al traspasar la nota");
await submit(page, page.getByRole("button", { name: "Guardar notas" }));
log("Corrección con motivo:", await notice(page));

// Nota inválida
await page.getByRole("link", { name: "Ingresar / corregir" }).last().click();
await page.waitForLoadState("networkidle");
await page.locator(".grade-input input").nth(1).fill("8,5");
await submit(page, page.getByRole("button", { name: "Guardar notas" }));
const bad = await notice(page);
log("Nota inválida:", bad);
if (!bad?.includes("no es una nota válida")) fail("debe rechazar 8,5");

// Anotación
await page.goto(`${subjectUrl}?tab=anotaciones`);
await page.selectOption("#studentId", { index: 2 });
await page.selectOption("#kind", "commendation");
await page.fill("#description", "Ayudó a sus compañeros a resolver la guía de fracciones.");
await submit(page, page.getByRole("button", { name: "Registrar" }));
log("Anotación:", await notice(page));

// Correcciones
await page.goto(`${subjectUrl}?tab=correcciones`);
const rows = await page.locator("table.data tbody tr").count();
log("Correcciones registradas:", rows);
if (rows !== 2) fail(`se esperaban 2 correcciones y hay ${rows}`);
await page.screenshot({ path: `${OUT}/04-correcciones.png`, fullPage: true });

// ── Profesor de Lenguaje: Matemática de 5° A es solo lectura ──
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p2 = await ctx2.newPage();
await loginAs(p2, "Rodrigo");
await p2.goto(`${subjectUrl}?tab=notas`);
const ro = (await p2.locator("main").innerText()) ?? "";
log("Rodrigo en Matemática 5°A:", ro.includes("Sin acceso") ? "sin acceso" : ro.includes("Solo lectura") ? "solo lectura" : "¡puede escribir!");
if (!ro.includes("Solo lectura") && !(await p2.getByText("Sin acceso").count())) fail("Rodrigo no debería escribir en Matemática 5°A");
if (await p2.getByRole("button", { name: "Crear evaluación" }).count()) fail("Rodrigo no debería ver el formulario de evaluación");
await p2.goto(`${BASE}/libro`);
await p2.screenshot({ path: `${OUT}/05-movil-libro.png`, fullPage: true });
await p2.goto(`${BASE}/libro/course-2--lenguaje?tab=clases`);
await p2.screenshot({ path: `${OUT}/06-movil-clase.png`, fullPage: false });

// ── Director: lectura del libro, sin escribir ──
const ctx3 = await browser.newContext();
const p3 = await ctx3.newPage();
await loginAs(p3, "Jorge");
await p3.goto(`${subjectUrl}?tab=clases`);
if (await p3.locator("#content").count()) fail("el director no debería registrar clases");
log("Director ve clases:", await p3.getByText("✓ Firmada").count() > 0 ? "sí" : "no");

// Panel profesor jefe refleja la nueva evaluación (promedio del curso cambia, solo informativo)
await page.goto(`${BASE}/panel/profesor-jefe`);
log("Panel profesor jefe OK:", (await page.title()));

await browser.close();
log(process.exitCode ? "RESULTADO: CON FALLAS" : "RESULTADO: TODO OK");
