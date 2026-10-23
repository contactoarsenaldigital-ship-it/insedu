"use server";
import { withState } from "@/lib/state";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  can,
  canSign,
  formatGrade,
  parseGrade,
  recognize,
  validateLesson,
  validateReason,
  type Action,
  type ConductKind,
  type LessonStatus,
} from "@insedu/domain";
import { getSession, type Session } from "@/lib/session";
import { award } from "@/lib/rewards";
import { repo } from "@/lib/store";

/**
 * Acciones del libro de clases. Cada una:
 * 1. exige sesión, 2. verifica el permiso en el servidor, 3. valida con las reglas del dominio,
 * 4. registra, y 5. vuelve a la pestaña con un mensaje.
 */

const STATUSES: LessonStatus[] = ["present", "late", "absent", "justified"];
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function back(subjectId: string, tab: string, msg: { ok?: string; error?: string }, extra = ""): never {
  const q = new URLSearchParams({ tab, ...(msg.ok ? { ok: msg.ok } : {}), ...(msg.error ? { error: msg.error } : {}) });
  redirect(`/libro/${encodeURIComponent(subjectId)}?${q}${extra}`);
}

async function guard(subjectId: string, action: Action, tab: string): Promise<{ session: Session; courseId: string }> {
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=${encodeURIComponent(`/libro/${subjectId}`)}`);
  const subject = repo.subject(subjectId);
  if (!subject) redirect("/libro");
  if (!can(session.person.roles, action, session.scope, { subjectId, courseId: subject.courseId })) {
    back(subjectId, tab, { error: "No tiene permiso para esta acción." });
  }
  return { session, courseId: subject.courseId };
}

function done(subjectId: string, tab: string, ok: string): never {
  revalidatePath(`/libro/${subjectId}`);
  revalidatePath("/panel/[rol]", "page");
  back(subjectId, tab, { ok });
}

// ───────────────────────────── Clases ─────────────────────────────

async function createLessonImpl(form: FormData) {
  const subjectId = str(form, "subjectId");
  const { session, courseId } = await guard(subjectId, "lesson.write", "clases");
  const draft = {
    subjectId,
    courseId,
    date: str(form, "date"),
    block: str(form, "block"),
    objective: str(form, "objective"),
    content: str(form, "content"),
  };
  const issues = validateLesson(draft);
  if (issues.length) back(subjectId, "clases", { error: issues.join(". ") });

  const attendance: Record<string, LessonStatus> = {};
  for (const st of repo.studentsOf(courseId)) {
    const v = str(form, `att_${st.id}`) as LessonStatus;
    if (STATUSES.includes(v)) attendance[st.id] = v;
  }
  const lesson = repo.addLesson({ ...draft, teacherId: session.person.id, attendance });

  if (form.get("sign") === "1") {
    const problems = canSign(lesson, repo.studentsOf(courseId).map((s) => s.id));
    if (problems.length) back(subjectId, "clases", { error: `Clase guardada sin firmar: ${problems.join(". ")}` });
    repo.updateLesson(lesson.id, { signedAt: new Date().toISOString() });
    done(subjectId, "clases", "Clase registrada y firmada.");
  }
  done(subjectId, "clases", "Clase registrada como borrador. Fírmela para cerrar el registro.");
}

async function signLessonImpl(form: FormData) {
  const subjectId = str(form, "subjectId");
  const { courseId } = await guard(subjectId, "lesson.sign", "clases");
  const lesson = repo.lesson(str(form, "lessonId"));
  if (!lesson || lesson.subjectId !== subjectId) back(subjectId, "clases", { error: "Clase no encontrada." });
  const problems = canSign(lesson, repo.studentsOf(courseId).map((s) => s.id));
  if (problems.length) back(subjectId, "clases", { error: problems.join(". ") });
  repo.updateLesson(lesson.id, { signedAt: new Date().toISOString() });
  done(subjectId, "clases", "Clase firmada.");
}

async function updateLessonAttendanceImpl(form: FormData) {
  const subjectId = str(form, "subjectId");
  const lesson = repo.lesson(str(form, "lessonId"));
  const studentId = str(form, "studentId");
  const status = str(form, "status") as LessonStatus;
  if (!lesson || lesson.subjectId !== subjectId || !STATUSES.includes(status)) {
    back(subjectId, "clases", { error: "Datos inválidos." });
  }
  if (lesson.attendance[studentId] === status) back(subjectId, "clases", { error: "El estado no cambió." });

  if (!lesson.signedAt) {
    const { courseId } = await guard(subjectId, "lesson.write", "clases");
    if (!repo.studentsOf(courseId).some((s) => s.id === studentId)) back(subjectId, "clases", { error: "Estudiante no pertenece al curso." });
    repo.updateLesson(lesson.id, { attendance: { ...lesson.attendance, [studentId]: status } });
    done(subjectId, "clases", "Asistencia actualizada.");
  }

  // Clase firmada: corrección formal con motivo.
  const { session, courseId } = await guard(subjectId, "record.correct", "clases");
  const reason = str(form, "reason");
  const err = validateReason(reason);
  if (err) back(subjectId, "clases", { error: err });
  repo.addCorrection({
    target: "lesson_attendance",
    recordId: `${lesson.id}::${studentId}`,
    studentId,
    before: lesson.attendance[studentId] ?? null,
    after: status,
    reason,
    by: session.person.id,
    courseId,
  });
  repo.updateLesson(lesson.id, { attendance: { ...lesson.attendance, [studentId]: status } });
  done(subjectId, "clases", "Corrección registrada con trazabilidad.");
}

// ───────────────────────────── Calificaciones ─────────────────────────────

async function addEvaluationImpl(form: FormData) {
  const subjectId = str(form, "subjectId");
  await guard(subjectId, "grade.write", "notas");
  const title = str(form, "title");
  const date = str(form, "date");
  const weight = Number(str(form, "weight").replace(",", "."));
  if (title.length < 3 || title.length > 80) back(subjectId, "notas", { error: "Indique un nombre de evaluación (3 a 80 caracteres)." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) back(subjectId, "notas", { error: "Fecha inválida." });
  if (!(weight > 0 && weight <= 10)) back(subjectId, "notas", { error: "La ponderación debe estar entre 0,1 y 10." });
  const ev = repo.addEvaluation({ subjectId, title, date, weight });
  revalidatePath(`/libro/${subjectId}`);
  back(subjectId, "notas", { ok: `Evaluación "${title}" creada. Ingrese las notas.` }, `&eval=${ev.id}`);
}

async function saveGradesImpl(form: FormData) {
  const subjectId = str(form, "subjectId");
  const evaluationId = str(form, "evaluationId");
  const { session, courseId } = await guard(subjectId, "grade.write", "notas");
  const ev = repo.evaluationsOf(subjectId).find((e) => e.id === evaluationId);
  if (!ev) back(subjectId, "notas", { error: "Evaluación no encontrada." });

  const current = new Map(repo.gradesOf(subjectId).filter((g) => g.evaluationId === evaluationId).map((g) => [g.studentId, g.value]));
  const invalid: string[] = [];
  const toCreate: { studentId: string; value: number }[] = [];
  const toCorrect: { studentId: string; before: number; value: number }[] = [];

  for (const st of repo.studentsOf(courseId)) {
    const raw = str(form, `g_${st.id}`);
    const before = current.get(st.id);
    if (!raw) {
      if (before != null) invalid.push(`${st.firstName} ${st.lastName}: una nota registrada no puede borrarse, solo corregirse`);
      continue;
    }
    const value = parseGrade(raw);
    if (value == null) {
      invalid.push(`${st.firstName} ${st.lastName}: "${raw}" no es una nota válida (1,0 a 7,0)`);
      continue;
    }
    if (before == null) toCreate.push({ studentId: st.id, value });
    else if (before !== value) toCorrect.push({ studentId: st.id, before, value });
  }

  const extra = `&eval=${evaluationId}`;
  if (invalid.length) back(subjectId, "notas", { error: invalid.slice(0, 5).join(". ") }, extra);

  if (toCorrect.length) {
    if (!can(session.person.roles, "record.correct", session.scope, { subjectId, courseId })) {
      back(subjectId, "notas", { error: "No tiene permiso para corregir notas registradas." }, extra);
    }
    const reason = str(form, "reason");
    const err = validateReason(reason);
    if (err) back(subjectId, "notas", { error: `Va a modificar ${toCorrect.length} nota(s) ya registrada(s). ${err}.` }, extra);
    for (const c of toCorrect) {
      repo.addCorrection({
        target: "grade",
        recordId: `${evaluationId}::${c.studentId}`,
        studentId: c.studentId,
        before: formatGrade(c.before),
        after: formatGrade(c.value),
        reason,
        by: session.person.id,
        courseId,
      });
      repo.setGrade({ evaluationId, studentId: c.studentId, value: c.value }, session.person.id);
    }
  }
  for (const c of toCreate) repo.setGrade({ evaluationId, studentId: c.studentId, value: c.value }, session.person.id);

  if (!toCreate.length && !toCorrect.length) back(subjectId, "notas", { error: "No hubo cambios." }, extra);
  done(subjectId, "notas", `${toCreate.length} nota(s) nueva(s) y ${toCorrect.length} corrección(es) registradas.`);
}

// ───────────────────────────── Anotaciones ─────────────────────────────

async function addConductImpl(form: FormData) {
  const subjectId = str(form, "subjectId");
  const { session, courseId } = await guard(subjectId, "conduct.write", "anotaciones");
  const studentId = str(form, "studentId");
  const kind = str(form, "kind") as ConductKind;
  const severity = str(form, "severity") as "leve" | "grave" | "gravisima";
  const description = str(form, "description");
  if (!repo.studentsOf(courseId).some((s) => s.id === studentId)) back(subjectId, "anotaciones", { error: "Seleccione un estudiante del curso." });
  if (!["positive", "negative", "commendation"].includes(kind)) back(subjectId, "anotaciones", { error: "Tipo de anotación inválido." });
  if (kind === "negative" && !["leve", "grave", "gravisima"].includes(severity)) {
    back(subjectId, "anotaciones", { error: "Indique la gravedad de la anotación negativa." });
  }
  if (description.length < 10 || description.length > 500) {
    back(subjectId, "anotaciones", { error: "Describa el hecho observado (10 a 500 caracteres)." });
  }
  const rec0 = repo.addConduct({
    studentId,
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date()),
    kind,
    severity: kind === "negative" ? severity : undefined,
    description,
    recordedBy: session.person.id,
  });
  const rec = recognize({ type: "conduct", kind, date: "" });
  award(studentId, rec, "anotación", rec0.id); // refuerzo inmediato en el saldo del estudiante
  done(
    subjectId,
    "anotaciones",
    rec ? `Anotación registrada. El estudiante recibe de inmediato: "${rec.message}" (+${rec.points} puntos).` : "Anotación registrada. Se trabajará con medida formativa; no descuenta puntos.",
  );
}

// Cada acción sincroniza el estado antes de ejecutarse y guarda los cambios al terminar.
export async function createLesson(form: FormData) {
  return withState(() => createLessonImpl(form));
}

export async function signLesson(form: FormData) {
  return withState(() => signLessonImpl(form));
}

export async function updateLessonAttendance(form: FormData) {
  return withState(() => updateLessonAttendanceImpl(form));
}

export async function addEvaluation(form: FormData) {
  return withState(() => addEvaluationImpl(form));
}

export async function saveGrades(form: FormData) {
  return withState(() => saveGradesImpl(form));
}

export async function addConduct(form: FormData) {
  return withState(() => addConductImpl(form));
}
