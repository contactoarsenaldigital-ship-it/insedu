"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bellIssues, DEFAULT_BELLS, exampleSchedule, scheduleIssues, uuidv7, WEEKDAYS, type BellPeriod, type ScheduleSlot, type Weekday } from "@insedu/domain";
import { bells, canEditTimetable } from "@/lib/horario";
import { getSession, type Session } from "@/lib/session";
import { withState } from "@/lib/state";
import { logEvent, repo, timetableState } from "@/lib/store";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function back(path: string, msg: { ok?: string; error?: string }): never {
  revalidatePath("/horario");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(msg as Record<string, string>)}`);
}

async function editor(path: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/ingresar?next=${encodeURIComponent(path)}`);
  if (!canEditTimetable(s)) back(path, { error: "Solo dirección y administración editan el horario." });
  return s;
}

async function saveBellsImpl(f: FormData) {
  const s = await editor("/horario");
  const count = Math.min(14, Math.max(1, Number(str(f, "count")) || 0));
  const next: BellPeriod[] = Array.from({ length: count }, (_, i) => ({ number: i + 1, start: str(f, `start_${i + 1}`), end: str(f, `end_${i + 1}`) }));
  const issues = bellIssues(next);
  const orphan = timetableState().slots.filter((x) => x.period > count).length;
  if (orphan) issues.push(`Hay ${orphan} clase(s) programadas en horas que se eliminarían: quítelas primero del horario de los cursos`);
  if (issues.length) back("/horario", { error: issues.join(". ") });
  const before = bells().bells;
  timetableState().bells.splice(0, Infinity, ...next);
  logEvent({ actor: s.person.id, action: "modificar", entity: "jornada", recordId: "jornada", before, after: next });
  back("/horario", { ok: "Jornada guardada." });
}

async function saveCourseImpl(f: FormData) {
  const courseId = str(f, "courseId");
  const path = `/horario?curso=${encodeURIComponent(courseId)}`;
  const s = await editor(path);
  if (!repo.course(courseId)) back("/horario", { error: "Ese curso no existe." });
  const subjects = new Set(repo.subjects().filter((x) => x.courseId === courseId).map((x) => x.id));
  const draft: Omit<ScheduleSlot, "id">[] = [];
  for (const weekday of WEEKDAYS) {
    for (const b of bells().bells) {
      const subjectId = str(f, `slot_${weekday}_${b.number}`);
      if (!subjectId) continue;
      if (!subjects.has(subjectId)) back(path, { error: "Asignatura que no pertenece al curso." });
      draft.push({ courseId, subjectId, weekday: weekday as Weekday, period: b.number });
    }
  }
  const state = timetableState();
  const issues = scheduleIssues(draft, {
    bells: bells().bells,
    teacherOf: (id) => repo.subject(id)?.teacherId || undefined,
    others: state.slots.filter((x) => x.courseId !== courseId),
    label: (id) => repo.subject(id)?.name ?? id,
  });
  if (issues.length) back(path, { error: issues.join(". ") });
  const before = state.slots.filter((x) => x.courseId === courseId);
  const kept = state.slots.filter((x) => x.courseId !== courseId);
  state.slots.splice(0, Infinity, ...kept, ...draft.map((d) => ({ ...d, id: uuidv7() })));
  logEvent({ actor: s.person.id, action: "modificar", entity: "horario", recordId: courseId, courseId, before: before.length, after: draft.length });
  back(path, { ok: "Horario del curso guardado." });
}

/** Colegio ficticio: jornada y horario de ejemplo para todos los cursos. Solo si aún no hay horario. */
async function exampleImpl() {
  const s = await editor("/horario");
  if (process.env.INSEDU_DATA_MODE === "real") back("/horario", { error: "Con datos reales el horario se ingresa a mano." });
  const state = timetableState();
  if (state.slots.length) back("/horario", { error: "Ya hay un horario cargado." });
  if (!state.bells.length) state.bells.push(...DEFAULT_BELLS);
  const courses = repo.courses().map((c) => ({ id: c.id, subjects: repo.subjects().filter((x) => x.courseId === c.id).map((x) => ({ id: x.id, teacherId: x.teacherId || undefined })) }));
  state.slots.push(...exampleSchedule(courses, state.bells, uuidv7));
  logEvent({ actor: s.person.id, action: "crear", entity: "horario", recordId: "ejemplo", after: { clases: state.slots.length } });
  back("/horario", { ok: "Horario de ejemplo cargado." });
}

export async function saveBells(f: FormData) {
  return withState(() => saveBellsImpl(f));
}
export async function saveCourseSchedule(f: FormData) {
  return withState(() => saveCourseImpl(f));
}
export async function loadExampleSchedule() {
  return withState(() => exampleImpl());
}
