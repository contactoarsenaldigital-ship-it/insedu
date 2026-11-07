"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PIE_PLACE_LABEL, PIE_SECTIONS, pieEntryIssues, pieSignIssues, uuidv7, type PieDraft, type PieEntry, type PieGroup, type PieNeed, type PiePlace, type PieSection } from "@insedu/domain";
import { showDemoSecrets } from "@/lib/accounts";
import { courseById, studentById } from "@/lib/demo";
import { canManagePie, canWritePie, entriesOf, nominaOf, pieToday, seedPieCourse, teamCandidates, teamIds } from "@/lib/pie";
import { getSession, type Session } from "@/lib/session";
import { withState } from "@/lib/state";
import { logEvent, pieState } from "@/lib/store";
import { verifySignature } from "@/lib/verifier";

/** Acciones del Libro PIE. Los mensajes viajan en la URL: nunca llevan nombres ni datos del estudiante. */
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const GROUPS: PieGroup[] = ["equipo", "planificacion", "implementacion", "familia"];

function back(courseId: string, tab: string, msg: { ok?: string; error?: string }): never {
  const q = new URLSearchParams({ tab, ...msg } as Record<string, string>);
  revalidatePath(`/pie/${courseId}`);
  redirect(`/pie/${courseId}?${q}`);
}

async function session(next: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  return s;
}

/** Curso válido y persona con permiso de escritura. */
async function writer(f: FormData, tab: string) {
  const courseId = str(f, "courseId");
  if (!courseById(courseId)) redirect("/pie");
  const s = await session(`/pie/${courseId}`);
  if (!canWritePie(s, courseId)) back(courseId, tab, { error: "Solo el equipo de aula del curso puede escribir en este registro." });
  return { s, courseId };
}

async function manager(f: FormData, tab: string) {
  const courseId = str(f, "courseId");
  if (!courseById(courseId)) redirect("/pie");
  const s = await session(`/pie/${courseId}`);
  if (!canManagePie(s)) back(courseId, tab, { error: "Solo el equipo PIE, dirección o administración modifican la nómina y el equipo." });
  return { s, courseId };
}

// ───────────── Nómina ─────────────

async function addStudentImpl(f: FormData) {
  const { s, courseId } = await manager(f, "nomina");
  const st = studentById(str(f, "studentId"));
  const need = (["permanente", "transitoria"] as PieNeed[]).find((n) => n === str(f, "need"));
  const since = str(f, "since");
  if (!st || st.courseId !== courseId || st.withdrawnOn) back(courseId, "nomina", { error: "Elija un estudiante vigente del curso." });
  if (!need) back(courseId, "nomina", { error: "Indique si la necesidad es permanente o transitoria." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || since > pieToday()) back(courseId, "nomina", { error: "Indique una fecha de ingreso válida, no futura." });
  const list = pieState().students;
  const existing = list.find((p) => p.id === st.id);
  if (existing && !existing.until) back(courseId, "nomina", { error: "Ese estudiante ya está en la nómina." });
  const before = existing ? { ...existing } : null;
  const record = { id: st.id, need, since, by: s.person.id };
  if (existing) Object.assign(existing, record, { until: undefined, endReason: undefined });
  else list.push(record);
  logEvent({ actor: s.person.id, action: existing ? "modificar" : "crear", entity: "pie_nomina", recordId: st.id, courseId, before, after: record });
  back(courseId, "nomina", { ok: "Estudiante agregado a la nómina." });
}

async function endStudentImpl(f: FormData) {
  const { s, courseId } = await manager(f, "nomina");
  const p = pieState().students.find((x) => x.id === str(f, "studentId") && !x.until);
  const reason = str(f, "reason");
  if (!p) back(courseId, "nomina", { error: "Ese estudiante ya no está en la nómina." });
  if (reason.length < 10) back(courseId, "nomina", { error: "Explique el motivo del egreso (mínimo 10 caracteres)." });
  const before = { ...p };
  p.until = pieToday();
  p.endReason = reason.slice(0, 300);
  logEvent({ actor: s.person.id, action: "modificar", entity: "pie_nomina", recordId: p.id, courseId, before, after: { ...p }, reason });
  back(courseId, "nomina", { ok: "Egreso del programa registrado. Su historia se conserva." });
}

// ───────────── Equipo ─────────────

async function addMemberImpl(f: FormData) {
  const { s, courseId } = await manager(f, "nomina");
  const personId = str(f, "personId");
  const role = str(f, "role").slice(0, 80);
  const hours = str(f, "weeklyHours") ? Number(str(f, "weeklyHours").replace(",", ".")) : undefined;
  if (!teamCandidates().some((p) => p.id === personId)) back(courseId, "nomina", { error: "Elija a un integrante." });
  if (role.length < 3) back(courseId, "nomina", { error: "Indique la función en el equipo." });
  if (hours !== undefined && !(hours >= 0 && hours <= 44)) back(courseId, "nomina", { error: "Las horas semanales deben estar entre 0 y 44." });
  const id = `${courseId}:${personId}`;
  const team = pieState().team;
  const existing = team.find((m) => m.id === id);
  if (existing?.active) back(courseId, "nomina", { error: "Esa persona ya integra el equipo." });
  const record = { id, courseId, personId, role, weeklyHours: hours, active: true };
  if (existing) Object.assign(existing, record);
  else team.push(record);
  logEvent({ actor: s.person.id, action: "crear", entity: "pie_equipo", recordId: id, courseId, after: record });
  back(courseId, "nomina", { ok: "Integrante agregado al equipo de aula." });
}

async function removeMemberImpl(f: FormData) {
  const { s, courseId } = await manager(f, "nomina");
  const m = pieState().team.find((x) => x.id === str(f, "memberId") && x.courseId === courseId && x.active);
  if (!m) back(courseId, "nomina", { error: "Esa persona ya no integra el equipo." });
  m.active = false;
  logEvent({ actor: s.person.id, action: "modificar", entity: "pie_equipo", recordId: m.id, courseId, before: { active: true }, after: { active: false } });
  back(courseId, "nomina", { ok: "Integrante retirado del equipo. Sus registros y firmas se conservan." });
}

// ───────────── Registro ─────────────

function draftFrom(f: FormData): PieDraft {
  return {
    section: str(f, "section") as PieSection,
    date: str(f, "date"),
    text: str(f, "text"),
    studentIds: f.getAll("studentIds").map(String),
    participantIds: f.getAll("participantIds").map(String),
    minutes: str(f, "minutes") ? Number(str(f, "minutes")) : undefined,
    place: str(f, "place") in PIE_PLACE_LABEL ? (str(f, "place") as PiePlace) : undefined,
  };
}

const groupOf = (section: string) => (PIE_SECTIONS[section as PieSection]?.group ?? "equipo") as PieGroup;
const tabFrom = (f: FormData) => GROUPS.find((g) => g === str(f, "tab")) ?? "equipo";

async function addEntryImpl(f: FormData) {
  const { s, courseId } = await writer(f, tabFrom(f));
  const d = draftFrom(f);
  const tab = groupOf(d.section);
  const issues = pieEntryIssues(d, { today: pieToday(), nominated: nominaOf(courseId).map((p) => p.id), team: teamIds(courseId) });
  if (issues.length) back(courseId, tabFrom(f), { error: issues.join(". ") });
  const rule = PIE_SECTIONS[d.section];
  const entry: PieEntry = {
    ...d,
    id: uuidv7(),
    courseId,
    minutes: rule.needsMinutes ? d.minutes : undefined,
    place: rule.needsMinutes ? d.place : undefined,
    approvedByStudent: d.section === "plan_individual" ? f.get("approvedByStudent") === "1" : undefined,
    approvedByGuardian: d.section === "plan_individual" ? f.get("approvedByGuardian") === "1" : undefined,
    createdBy: s.person.id,
    createdAt: new Date().toISOString(),
    signatures: [],
  };
  pieState().entries.push(entry);
  logEvent({ actor: s.person.id, action: "crear", entity: "pie_registro", recordId: entry.id, courseId, after: { ...d } });

  const code = str(f, "code");
  if (!code) back(courseId, tab, { ok: "Registro guardado como borrador. Fírmelo para cerrarlo." });
  const problems = pieSignIssues(entry, s.person.id, teamIds(courseId));
  if (problems.length) back(courseId, tab, { error: `Registro guardado sin firma. ${problems.join(". ")}` });
  const signed = await verifySignature(s, code);
  if (!signed.ok) back(courseId, tab, { error: `Registro guardado sin firma. ${signed.error}` });
  entry.signatures.push(signed.signature);
  logEvent({ actor: s.person.id, action: "firmar", entity: "pie_registro", recordId: entry.id, courseId, after: { method: signed.signature.method } });
  back(courseId, tab, { ok: "Registro guardado y firmado." });
}

async function signEntryImpl(f: FormData) {
  const { s, courseId } = await writer(f, tabFrom(f));
  const tab = tabFrom(f);
  const entry = entriesOf(courseId).find((e) => e.id === str(f, "entryId"));
  if (!entry) back(courseId, tab, { error: "Registro no encontrado." });
  const problems = pieSignIssues(entry, s.person.id, teamIds(courseId));
  if (problems.length) back(courseId, tab, { error: problems.join(". ") });
  const signed = await verifySignature(s, str(f, "code"));
  if (!signed.ok) back(courseId, tab, { error: signed.error });
  entry.signatures.push(signed.signature);
  logEvent({ actor: s.person.id, action: "firmar", entity: "pie_registro", recordId: entry.id, courseId, after: { method: signed.signature.method } });
  back(courseId, tab, { ok: entry.signatures.length > 1 ? "Firma de codocencia agregada." : "Registro firmado." });
}

/** Un registro firmado no se sobrescribe sin motivo; el texto anterior queda en la bitácora. */
async function correctEntryImpl(f: FormData) {
  const { s, courseId } = await writer(f, tabFrom(f));
  const tab = tabFrom(f);
  const entry = entriesOf(courseId).find((e) => e.id === str(f, "entryId"));
  if (!entry) back(courseId, tab, { error: "Registro no encontrado." });
  const text = str(f, "text");
  const reason = str(f, "reason");
  if (text.length < 10 || text.length > 3000) back(courseId, tab, { error: "El texto debe tener entre 10 y 3.000 caracteres." });
  if (text === entry.text) back(courseId, tab, { error: "El texto no cambió." });
  const signed = entry.signatures.length > 0;
  if (signed && reason.length < 10) back(courseId, tab, { error: "Un registro firmado requiere el motivo de la corrección (mínimo 10 caracteres)." });
  const before = entry.text;
  entry.text = text;
  logEvent({ actor: s.person.id, action: signed ? "corregir" : "modificar", entity: "pie_registro", recordId: entry.id, courseId, before, after: text, reason: reason || undefined });
  back(courseId, tab, { ok: signed ? "Corrección registrada con trazabilidad. Las firmas previas se conservan." : "Borrador actualizado." });
}

async function loadDemoImpl(f: FormData) {
  const { courseId } = await manager(f, "nomina");
  if (!showDemoSecrets()) redirect(`/pie/${courseId}`);
  if (entriesOf(courseId).length === 0) seedPieCourse(courseId);
  back(courseId, "equipo", { ok: "Se cargaron datos ficticios de ejemplo en este curso." });
}

export async function addPieStudent(f: FormData) {
  return withState(() => addStudentImpl(f));
}
export async function endPieStudent(f: FormData) {
  return withState(() => endStudentImpl(f));
}
export async function addPieMember(f: FormData) {
  return withState(() => addMemberImpl(f));
}
export async function removePieMember(f: FormData) {
  return withState(() => removeMemberImpl(f));
}
export async function addPieEntry(f: FormData) {
  return withState(() => addEntryImpl(f));
}
export async function signPieEntry(f: FormData) {
  return withState(() => signEntryImpl(f));
}
export async function correctPieEntry(f: FormData) {
  return withState(() => correctEntryImpl(f));
}
export async function loadPieDemo(f: FormData) {
  return withState(() => loadDemoImpl(f));
}
