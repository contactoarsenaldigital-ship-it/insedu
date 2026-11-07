"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { courseExitIssues, exitIssues, nextFolio, normalizeRut, pickupIssues, returnIssues, uuidv7 } from "@insedu/domain";
import { activeStudents, courseById, studentById } from "@/lib/demo";
import { enrollmentOf } from "@/lib/matricula";
import { canRegisterExits, exitsToday, pickupsOf, wardsOf } from "@/lib/salidas";
import { getSession, type Session } from "@/lib/session";
import { withState } from "@/lib/state";
import { exitsState, logEvent } from "@/lib/store";
import { verifySignature } from "@/lib/verifier";

/** Acciones de salidas. Los mensajes viajan en la URL: nunca llevan nombres ni RUN. */
const SEARCH_COOKIE = "insedu_salidas_q";
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function back(path: string, msg: { ok?: string; error?: string }): never {
  revalidatePath("/salidas");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(msg as Record<string, string>)}`);
}

async function staff(next: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  if (!canRegisterExits(s)) back("/salidas", { error: "Solo portería, inspectoría, dirección y administración registran salidas." });
  return s;
}

const signatureHash = (signature?: string) => (signature ? createHash("sha256").update(signature).digest("hex") : undefined);

// ───────────── Retiro de un estudiante ─────────────

async function addExitImpl(f: FormData) {
  const studentId = str(f, "studentId");
  const path = `/salidas/${studentId}`;
  const s = await staff(path);
  const st = studentById(studentId);
  if (!st || st.withdrawnOn) back("/salidas", { error: "Ese estudiante no tiene matrícula vigente." });
  const { exits } = exitsState();
  const auth = pickupsOf(studentId).find((p) => p.id === str(f, "pickupAuthId"));
  const date = str(f, "date");
  const draft = {
    date,
    exitTime: str(f, "exitTime"),
    pickupAuthId: str(f, "pickupAuthId") || undefined,
    pickupName: auth?.name ?? str(f, "pickupName").replace(/\s+/g, " "),
    pickupRut: auth?.rut ?? (str(f, "pickupRut") || undefined),
    guardianNote: str(f, "guardianNote") || undefined,
    signature: str(f, "signature") || undefined,
    paperEvidence: str(f, "paperEvidence") || undefined,
    reason: str(f, "reason"),
  };
  const issues = exitIssues(draft, {
    today: exitsToday(),
    authorizedIds: pickupsOf(studentId).map((p) => p.id),
    hasOpenExit: exits.some((e) => e.studentId === studentId && e.date === date && !e.returnTime),
  });
  if (issues.length) back(path, { error: issues.join(". ") });
  const signed = await verifySignature(s, str(f, "code"));
  if (!signed.ok) back(path, { error: `Retiro no registrado. ${signed.error}` });

  const record = {
    ...draft,
    pickupRut: draft.pickupRut ? normalizeRut(draft.pickupRut) : undefined,
    id: uuidv7(),
    folio: nextFolio([...exits, ...exitsState().courseExits], date),
    studentId,
    courseId: st.courseId,
    observations: str(f, "observations").slice(0, 500) || undefined,
    campus: enrollmentOf(studentId)?.campus,
    by: s.person.id,
    at: new Date().toISOString(),
    staffSignature: signed.signature,
  };
  exits.push(record);
  // La bitácora guarda la huella de la firma, no la imagen.
  const { signature, ...logged } = record;
  logEvent({ actor: s.person.id, action: "crear", entity: "salida", recordId: record.id, courseId: st.courseId, after: { ...logged, signatureHash: signatureHash(signature) } });
  back(path, { ok: `Salida registrada con el folio ${record.folio}.` });
}

async function returnImpl(f: FormData) {
  const s = await staff("/salidas");
  const backTo = str(f, "backTo") === "student" ? `/salidas/${str(f, "studentId")}` : "/salidas";
  const e = exitsState().exits.find((x) => x.id === str(f, "exitId"));
  if (!e || e.returnTime) back(backTo, { error: "Esa salida ya tiene regreso registrado." });
  const returnTime = str(f, "returnTime");
  const issues = returnIssues(e.exitTime, returnTime);
  if (issues.length) back(backTo, { error: issues.join(". ") });
  e.returnTime = returnTime;
  logEvent({ actor: s.person.id, action: "modificar", entity: "salida", recordId: e.id, courseId: e.courseId, before: { returnTime: null }, after: { returnTime } });
  back(backTo, { ok: "Regreso registrado." });
}

/** Un retiro registrado no se borra: horas y observaciones se corrigen con motivo. */
async function correctImpl(f: FormData) {
  const studentId = str(f, "studentId");
  const path = `/salidas/${studentId}`;
  const s = await staff(path);
  const e = exitsState().exits.find((x) => x.id === str(f, "exitId") && x.studentId === studentId);
  if (!e) back(path, { error: "Salida no encontrada." });
  const reason = str(f, "reason");
  if (reason.length < 10) back(path, { error: "Explique el motivo de la corrección (mínimo 10 caracteres)." });
  const exitTime = str(f, "exitTime");
  const returnTime = str(f, "returnTime") || undefined;
  const issues = returnTime ? returnIssues(exitTime, returnTime) : /^([01]\d|2[0-3]):[0-5]\d$/.test(exitTime) ? [] : ["Indique la hora de salida"];
  if (issues.length) back(path, { error: issues.join(". ") });
  const before = { exitTime: e.exitTime, returnTime: e.returnTime ?? null, observations: e.observations ?? null };
  e.exitTime = exitTime;
  e.returnTime = returnTime;
  e.observations = str(f, "observations").slice(0, 500) || undefined;
  logEvent({ actor: s.person.id, action: "corregir", entity: "salida", recordId: e.id, courseId: e.courseId, before, after: { exitTime, returnTime: returnTime ?? null, observations: e.observations ?? null }, reason });
  back(path, { ok: "Corrección registrada con trazabilidad." });
}

// ───────────── Personas autorizadas ─────────────

async function addPickupImpl(f: FormData) {
  const studentId = str(f, "studentId");
  const path = `/salidas/${studentId}`;
  const s = await getSession();
  if (!s) redirect(`/ingresar?next=${encodeURIComponent(path)}`);
  const isGuardian = wardsOf(s).includes(studentId);
  if (!isGuardian && !canRegisterExits(s)) redirect("/salidas");
  if (!studentById(studentId)) redirect("/salidas");
  const data = { name: str(f, "name").replace(/\s+/g, " "), rut: str(f, "rut"), relation: str(f, "relation"), phone: str(f, "phone") || undefined };
  const issues = pickupIssues(data, { existingRuts: pickupsOf(studentId).map((p) => p.rut) });
  const evidence = str(f, "evidence");
  if (!isGuardian && evidence.length < 5) issues.push("Indique dónde consta la autorización del apoderado");
  if (issues.length) back(path, { error: issues.join(". ") });
  const record = {
    ...data, id: uuidv7(), studentId, rut: normalizeRut(data.rut), source: (isGuardian ? "apoderado" : "establecimiento") as "apoderado" | "establecimiento",
    evidence: isGuardian ? undefined : evidence, by: s.person.id, at: new Date().toISOString(),
  };
  exitsState().pickups.push(record);
  logEvent({ actor: s.person.id, action: "crear", entity: "autorizado_retiro", recordId: record.id, courseId: studentById(studentId)?.courseId, after: record });
  back(path, { ok: "Persona autorizada registrada." });
}

async function revokePickupImpl(f: FormData) {
  const studentId = str(f, "studentId");
  const path = `/salidas/${studentId}`;
  const s = await getSession();
  if (!s) redirect(`/ingresar?next=${encodeURIComponent(path)}`);
  if (!wardsOf(s).includes(studentId) && !canRegisterExits(s)) redirect("/salidas");
  const p = pickupsOf(studentId).find((x) => x.id === str(f, "pickupId"));
  if (!p) back(path, { error: "Esa autorización ya no está vigente." });
  p.revokedAt = new Date().toISOString();
  p.revokedBy = s.person.id;
  logEvent({ actor: s.person.id, action: "modificar", entity: "autorizado_retiro", recordId: p.id, courseId: studentById(studentId)?.courseId, before: { revokedAt: null }, after: { revokedAt: p.revokedAt } });
  back(path, { ok: "Autorización revocada desde ahora. Queda en el historial." });
}

// ───────────── Salida de un curso completo ─────────────

async function addCourseExitImpl(f: FormData) {
  const s = await staff("/salidas");
  const courseId = str(f, "courseId");
  if (!courseById(courseId)) back("/salidas", { error: "Elija el curso." });
  const draft = { date: str(f, "date"), exitTime: str(f, "exitTime"), returnTime: str(f, "returnTime") || undefined, studentsOut: Number(str(f, "studentsOut")), responsible: str(f, "responsible"), destination: str(f, "destination") };
  const issues = courseExitIssues(draft, { today: exitsToday(), enrolled: activeStudents().filter((x) => x.courseId === courseId).length });
  if (issues.length) back("/salidas", { error: issues.join(". ") });
  const { exits, courseExits } = exitsState();
  const record = { ...draft, id: uuidv7(), folio: nextFolio([...exits, ...courseExits], draft.date), courseId, by: s.person.id, at: new Date().toISOString() };
  courseExits.push(record);
  logEvent({ actor: s.person.id, action: "crear", entity: "salida_curso", recordId: record.id, courseId, after: record });
  back("/salidas", { ok: `Salida de curso registrada con el folio ${record.folio}.` });
}

async function courseReturnImpl(f: FormData) {
  const s = await staff("/salidas");
  const e = exitsState().courseExits.find((x) => x.id === str(f, "exitId"));
  if (!e || e.returnTime) back("/salidas", { error: "Esa salida ya tiene regreso registrado." });
  const returnTime = str(f, "returnTime");
  const issues = returnIssues(e.exitTime, returnTime);
  if (issues.length) back("/salidas", { error: issues.join(". ") });
  e.returnTime = returnTime;
  logEvent({ actor: s.person.id, action: "modificar", entity: "salida_curso", recordId: e.id, courseId: e.courseId, before: { returnTime: null }, after: { returnTime } });
  back("/salidas", { ok: "Regreso del curso registrado." });
}

/** La búsqueda por nombre o RUN va en una cookie de corta duración, nunca en la URL. */
export async function searchExitStudent(f: FormData) {
  const s = await getSession();
  if (!s || !canRegisterExits(s)) redirect("/salidas");
  const q = str(f, "q").slice(0, 80);
  const jar = await cookies();
  if (q) jar.set(SEARCH_COOKIE, q, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/salidas", maxAge: 300 });
  else jar.delete({ name: SEARCH_COOKIE, path: "/salidas" });
  redirect(`/salidas?fecha=${encodeURIComponent(str(f, "fecha") || exitsToday())}`);
}

export async function addExit(f: FormData) {
  return withState(() => addExitImpl(f));
}
export async function registerReturn(f: FormData) {
  return withState(() => returnImpl(f));
}
export async function correctExit(f: FormData) {
  return withState(() => correctImpl(f));
}
export async function addPickup(f: FormData) {
  return withState(() => addPickupImpl(f));
}
export async function revokePickup(f: FormData) {
  return withState(() => revokePickupImpl(f));
}
export async function addCourseExit(f: FormData) {
  return withState(() => addCourseExitImpl(f));
}
export async function registerCourseReturn(f: FormData) {
  return withState(() => courseReturnImpl(f));
}
