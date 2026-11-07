"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { correctionIssues, dayEventIssues, declarationIssues, subsidySnapshot, uuidv7, type DayEventKind, type SubsidyCorrectionKind, type SubsidyMark } from "@insedu/domain";
import { courseById, school, studentById } from "@/lib/demo";
import { enrollmentOf } from "@/lib/matricula";
import { getSession, type Session } from "@/lib/session";
import { withState } from "@/lib/state";
import { logEvent, subsidyState } from "@/lib/store";
import { canManageSubsidy, courseSheet, daysOfMonth, differencesFromDeclared, isMonth, latestDeclaration, subsidyToday } from "@/lib/subvenciones";

/** Acciones del control de subvenciones. Los mensajes viajan en la URL: nunca llevan nombres ni RUN. */
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function back(path: string, msg: { ok?: string; error?: string }): never {
  revalidatePath("/subvenciones");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(msg as Record<string, string>)}`);
}

async function manager(next: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  if (!canManageSubsidy(s)) back(next, { error: "Solo dirección y administración corrigen y declaran." });
  return s;
}

async function addCorrectionImpl(f: FormData) {
  const courseId = str(f, "courseId");
  const date = str(f, "date");
  const month = date.slice(0, 7);
  const path = `/subvenciones/${courseId}?mes=${isMonth(str(f, "mes")) ? str(f, "mes") : ""}`;
  const s = await manager(path);
  const st = studentById(str(f, "studentId"));
  if (!st || st.courseId !== courseId) back(path, { error: "El estudiante no pertenece a este curso." });
  const draft = { date, mark: str(f, "mark"), kind: str(f, "kind"), reason: str(f, "reason"), document: str(f, "document") || undefined };
  const enrolledOn = enrollmentOf(st.id)?.enrolledOn;
  const issues = correctionIssues(draft, {
    today: subsidyToday(),
    days: isMonth(month) ? daysOfMonth(month) : [],
    enrolled: (!enrolledOn || date >= enrolledOn) && (!st.withdrawnOn || date < st.withdrawnOn),
  });
  if (issues.length) back(path, { error: issues.join(". ") });

  const row = courseSheet(courseId, month).rows.find((r) => r.student.id === st.id);
  const before = row?.cells.find((c) => c.date === date)?.mark ?? null;
  const afterDeclaration = !!latestDeclaration(month);
  const record = { ...draft, mark: draft.mark as SubsidyMark, kind: draft.kind as SubsidyCorrectionKind, id: uuidv7(), courseId, studentId: st.id, afterDeclaration, by: s.person.id, at: new Date().toISOString() };
  subsidyState().corrections.push(record);
  logEvent({ actor: s.person.id, action: "modificar", entity: "subvencion", recordId: `${st.id}:${date}`, courseId, before, after: draft.mark, reason: draft.reason });
  back(path, { ok: afterDeclaration ? "Corrección registrada. El mes ya estaba declarado: revise si debe rectificar en el SIGE." : "Corrección registrada." });
}

async function addDayEventImpl(f: FormData) {
  const month = str(f, "mes");
  const path = `/subvenciones?mes=${isMonth(month) ? month : ""}`;
  const s = await manager(path);
  const courseId = str(f, "courseId") || undefined;
  if (courseId && !courseById(courseId)) back(path, { error: "Ese curso no existe." });
  const draft = { date: str(f, "date"), kind: str(f, "kind"), reason: str(f, "reason"), authorization: str(f, "authorization"), recovery: str(f, "recovery") || undefined };
  const { events } = subsidyState();
  const issues = dayEventIssues(draft, { duplicate: events.some((e) => e.date === draft.date && e.courseId === courseId) });
  if (issues.length) back(path, { error: issues.join(". ") });
  const record = { ...draft, kind: draft.kind as DayEventKind, courseId, id: uuidv7(), by: s.person.id, at: new Date().toISOString() };
  events.push(record);
  logEvent({ actor: s.person.id, action: "crear", entity: "evento_asistencia", recordId: record.id, courseId, after: record });
  back(path, { ok: "Evento registrado." });
}

async function declareImpl(f: FormData) {
  const month = str(f, "mes");
  const path = `/subvenciones?mes=${isMonth(month) ? month : ""}`;
  const s = await manager(path);
  const draft = { month, declaredOn: str(f, "declaredOn"), certificate: str(f, "certificate"), reason: str(f, "reason") || undefined };
  const sheets = isMonth(month) ? school().courses.map((c) => ({ id: c.id, sheet: courseSheet(c.id, month) })) : [];
  const issues = declarationIssues(draft, {
    today: subsidyToday(),
    blocking: sheets.flatMap((x) => x.sheet.issues).filter((i) => i.severity === "error").length,
    alreadyDeclared: !!latestDeclaration(month),
    changed: differencesFromDeclared(month).length > 0,
  });
  if (issues.length) back(path, { error: issues.join(". ") });
  const record = { ...draft, id: uuidv7(), snapshot: Object.fromEntries(sheets.map((x) => [x.id, subsidySnapshot(x.sheet)])), by: s.person.id, at: new Date().toISOString() };
  subsidyState().declarations.push(record);
  logEvent({ actor: s.person.id, action: "crear", entity: "declaracion_asistencia", recordId: record.id, after: { month, declaredOn: draft.declaredOn, certificate: draft.certificate }, reason: draft.reason });
  back(path, { ok: "Declaración registrada. Recuerde que INSEDU no envía datos al SIGE." });
}

/** Autorización de la Seremi: desde esa fecha el excedente reemplaza a otro estudiante y genera subvención. */
async function endSurplusImpl(f: FormData) {
  const courseId = str(f, "courseId");
  const path = `/subvenciones/${courseId}?mes=${isMonth(str(f, "mes")) ? str(f, "mes") : ""}`;
  const s = await manager(path);
  const record = enrollmentOf(str(f, "studentId"));
  const st = studentById(str(f, "studentId"));
  const date = str(f, "date");
  const resolution = str(f, "resolution");
  if (!record || !st || st.courseId !== courseId || record.condition !== "excedente") back(path, { error: "Ese estudiante no figura como excedente en este curso." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) back(path, { error: "Indique desde qué fecha genera subvención." });
  if (resolution.length < 5) back(path, { error: "Indique la autorización de la Secretaría Regional Ministerial y el aviso a la Unidad de Pago." });
  const before = { condition: record.condition, resolution: record.resolution };
  record.condition = "regular";
  record.surplusUntil = date;
  record.resolution = resolution;
  logEvent({ actor: s.person.id, action: "modificar", entity: "matricula", recordId: record.id, courseId, before, after: { condition: record.condition, surplusUntil: date, resolution }, reason: "Excedente reemplaza a estudiante retirado" });
  back(path, { ok: "Condición actualizada." });
}

export async function addCorrection(f: FormData) {
  return withState(() => addCorrectionImpl(f));
}
export async function addDayEvent(f: FormData) {
  return withState(() => addDayEventImpl(f));
}
export async function declareMonth(f: FormData) {
  return withState(() => declareImpl(f));
}
export async function endSurplus(f: FormData) {
  return withState(() => endSurplusImpl(f));
}
