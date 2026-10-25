import "server-only";
import { canMessage, deliveryWindow, uuidv7, type Participant } from "@insedu/domain";
import { school } from "./demo";
import type { Person } from "./repository";
import { findPerson, guardianOf, repo, STAFF } from "./store";

/** Comunicados y mensajes de la Etapa 1 (en memoria). */
export type Announcement = {
  id: string;
  courseId: string | null; // null = todo el establecimiento
  title: string;
  body: string;
  requiresAck: boolean;
  authorId: string;
  at: string;
  reads: Record<string, string>; // personId → ISO
};

export type Message = { id: string; from: string; body: string; at: string; notifyAt?: string; readAt?: string };
export type Thread = { id: string; a: string; b: string; subject: string; messages: Message[] };

type State = { announcements: Announcement[]; threads: Thread[] };
const g = globalThis as unknown as { __insedu_msgs?: State };

export function initMessages(): State {
  const s = school();
  const course1 = s.students.filter((x) => x.courseId === "course-1");
  const reads: Record<string, string> = {};
  course1.forEach((st, i) => {
    if (i % 10 < 7 && st.id !== "student-001") reads[`guardian-of-${st.id}`] = new Date(Date.now() - (i + 1) * 3_600_000).toISOString();
  });
  return {
    announcements: [
      {
        id: "an-reunion",
        courseId: "course-1",
        title: "Reunión de apoderados: jueves 22 de octubre, 19:00",
        body: "Revisaremos el avance del semestre y la salida pedagógica de noviembre. Se ruega confirmar asistencia.",
        requiresAck: true,
        authorId: "teacher-1",
        at: new Date(Date.now() - 2 * 864e5).toISOString(),
        reads,
      },
      {
        id: "an-celulares",
        courseId: null,
        title: "Uso de dispositivos en clases (Ley 21.801)",
        body: "Recordamos que el uso de celulares en clases está regulado por el Reglamento Interno. Los dispositivos del colegio se usan con fines pedagógicos y bajo supervisión docente.",
        requiresAck: false,
        authorId: "director-1",
        at: new Date(Date.now() - 6 * 864e5).toISOString(),
        reads: {},
      },
    ],
    threads: [
      {
        id: "th-1",
        a: "teacher-1",
        b: "guardian-of-student-001",
        subject: "Avance en Matemática",
        messages: [
          { id: uuidv7(), from: "teacher-1", body: "Buenas tardes. Le escribo para contarle que Trinidad ha mejorado mucho en Matemática estas semanas. ¡Felicitaciones!", at: new Date(Date.now() - 864e5).toISOString() },
        ],
      },
    ],
  };
}

export const msgState = (): State => (g.__insedu_msgs ??= initMessages());

// ───────────── Participantes y vínculos ─────────────

export function participant(p: Person): Participant {
  return { id: p.id, roles: p.roles, wards: p.wards };
}

export function teacherCourses(personId: string): string[] {
  const viaSubjects = repo.subjects().filter((s) => s.teacherId === personId).map((s) => s.courseId);
  const viaHead = repo.courses().filter((c) => c.headTeacherId === personId).map((c) => c.id);
  return [...new Set([...viaSubjects, ...viaHead])];
}

const rel = {
  courseOfStudent: (sid: string) => school().students.find((s) => s.id === sid)?.courseId,
  teacherCourses,
};

export const allowed = (from: Person, to: Person) => canMessage(participant(from), participant(to), rel);

/** Destinatarios posibles para iniciar una conversación. */
export function recipientsFor(me: Person): Person[] {
  if (me.roles.includes("student")) return [];
  if (me.roles.includes("guardian_academic")) {
    const course = rel.courseOfStudent(me.wards?.[0] ?? "");
    const teachers = STAFF.filter((p) => teacherCourses(p.id).includes(course ?? ""));
    const others = STAFF.filter((p) => p.roles.includes("inspector") || p.roles.includes("director"));
    return [...new Set([...teachers, ...others])].filter((p) => allowed(me, p).allow);
  }
  // Personal: otros funcionarios + apoderados de sus cursos.
  const courses = me.roles.some((r) => r === "inspector" || r === "director") ? school().courses.map((c) => c.id) : teacherCourses(me.id);
  const guardians = school().students.filter((s) => courses.includes(s.courseId)).map((s) => guardianOf(s.id)!);
  return [...STAFF.filter((p) => p.id !== me.id), ...guardians].filter((p) => allowed(me, p).allow);
}

export function threadsOf(personId: string) {
  return msgState()
    .threads.filter((t) => t.a === personId || t.b === personId)
    .sort((x, y) => (y.messages.at(-1)?.at ?? "").localeCompare(x.messages.at(-1)?.at ?? ""));
}

export function send(from: Person, to: Person, subject: string, body: string, threadId?: string) {
  const st = msgState();
  const now = new Date();
  const w = deliveryWindow(now, school().timeZone);
  const msg: Message = {
    id: uuidv7(),
    from: from.id,
    body: body.trim(),
    at: now.toISOString(),
    notifyAt: w.notifyNow ? undefined : new Date(now.getTime() + w.minutesUntil * 60_000).toISOString(),
  };
  let t = threadId ? st.threads.find((x) => x.id === threadId) : undefined;
  if (!t) {
    t = { id: uuidv7(), a: from.id, b: to.id, subject: subject.trim() || "Sin asunto", messages: [] };
    st.threads.push(t);
  }
  t.messages.push(msg);
  return { thread: t, msg };
}

export function other(t: Thread, me: string) {
  return findPerson(t.a === me ? t.b : t.a);
}

// ───────────── Comunicados ─────────────

/** Comunicados visibles: personal ve los de sus cursos (o todos si es directivo/inspector); familias, los de su curso. */
export function announcementsFor(me: Person) {
  const courses = me.roles.includes("student")
    ? [school().students.find((s) => s.id === me.id)?.courseId]
    : me.wards
      ? me.wards.map((w) => rel.courseOfStudent(w))
      : me.roles.some((r) => ["director", "inspector", "school_admin"].includes(r))
        ? school().courses.map((c) => c.id)
        : teacherCourses(me.id);
  return msgState()
    .announcements.filter((a) => a.courseId === null || courses.includes(a.courseId))
    .sort((x, y) => y.at.localeCompare(x.at));
}

/**
 * Cómo se entrega un comunicado en la Etapa 1: solo dentro de INSEDU (Comunicación → Comunicados),
 * a los apoderados y estudiantes del curso o de todo el establecimiento. Sin correo ni notificación
 * al teléfono: eso llega en el piloto, cuando existan contactos reales.
 */
export function deliveryOf(courseId: string | null) {
  const n = school().students.filter((s) => courseId === null || s.courseId === courseId).length; // un apoderado por estudiante
  const scope = courseId ? school().courses.find((c) => c.id === courseId)?.name ?? "el curso" : "todo el establecimiento";
  return { text: `Lo verán ${n} apoderados y ${n} estudiantes de ${scope} en INSEDU, en Comunicación → Comunicados` };
}

/** Apoderados destinatarios de un comunicado (uno por estudiante). */
export function audienceOf(a: Announcement) {
  return school()
    .students.filter((s) => a.courseId === null || s.courseId === a.courseId)
    .map((s) => guardianOf(s.id)!);
}

export function publish(a: Omit<Announcement, "id" | "at" | "reads">) {
  const ann: Announcement = { ...a, id: uuidv7(), at: new Date().toISOString(), reads: {} };
  msgState().announcements.push(ann);
  return ann;
}

export function markRead(annId: string, personId: string) {
  const a = msgState().announcements.find((x) => x.id === annId);
  if (a && !a.reads[personId]) a.reads[personId] = new Date().toISOString();
}
