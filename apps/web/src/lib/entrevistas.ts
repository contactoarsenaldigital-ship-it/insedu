import "server-only";
import { formatRut, MEETING_LABEL, RELATION_LABEL, type GuardianMeeting, type Role, type Sheet } from "@insedu/domain";
import { courseById, fullName, studentById } from "./demo";
import type { Session } from "./session";
import { documentsState, findPerson, meetingsState, repo } from "./store";

/**
 * Entrevistas y reuniones con apoderados (Circular de registros, 6.2.e).
 * Registran: dirección, administración, inspectoría, profesionales de apoyo y quienes hacen clases en el curso.
 * El apoderado ve las entrevistas de su pupilo y las reuniones de su curso.
 */
const SCHOOL_WIDE: Role[] = ["school_admin", "director", "inspector", "psychologist", "counselor", "social_worker", "pie_professional"];
const TEACHING: Role[] = ["teacher", "head_teacher"];

export function canRegisterMeeting(s: Session, courseId: string) {
  if (s.person.roles.some((r) => SCHOOL_WIDE.includes(r))) return true;
  return s.scope.headOfCourseIds.includes(courseId) || repo.subjects().some((x) => x.courseId === courseId && s.scope.subjectIds.includes(x.id));
}

/** Cursos donde la persona puede registrar entrevistas o reuniones. */
export const meetingCourses = (s: Session) => repo.courses().filter((c) => canRegisterMeeting(s, c.id));

const wards = (s: Session) => (s.person.roles.includes("guardian_academic") ? s.person.wards ?? [] : []);

export function canSeeMeeting(s: Session, m: GuardianMeeting) {
  if (canRegisterMeeting(s, m.courseId)) return true;
  const own = wards(s);
  return m.kind === "entrevista" ? !!m.studentId && own.includes(m.studentId) : own.some((id) => studentById(id)?.courseId === m.courseId);
}

/** Quien conduce es docente si hace clases; si no, profesional de la educación (para el EDE). */
export const isTeacher = (personId: string) => (findPerson(personId)?.roles ?? []).some((r) => TEACHING.includes(r));

export const meetingById = (id: string) => meetingsState().find((m) => m.id === id);

export const actasOf = (meetingId: string) => documentsState().filter((d) => d.ownerKind === "entrevista" && d.ownerId === meetingId);

export const meetingsToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

const nameOf = (id: string) => findPerson(id)?.name ?? id;
const studentName = (id?: string) => {
  const st = id ? studentById(id) : undefined;
  return st ? fullName(st) : "";
};

/** Registro de entrevistas y reuniones, para el respaldo del libro y la descarga. */
export function meetingSheets(courseId?: string): Sheet[] {
  const scope = courseId ? ` · ${courseById(courseId)?.name}` : "";
  return [{
    name: "Entrevistas y reuniones",
    title: `Entrevistas y reuniones con apoderados${scope}`,
    columns: [
      { header: "Fecha", format: "date" }, { header: "Hora" }, { header: "Tipo", width: 24 }, { header: "Curso", width: 14 }, { header: "Estudiante", width: 30 },
      { header: "Asistentes", width: 44 }, { header: "Motivo y temas", width: 60 }, { header: "Acuerdos", width: 50 }, { header: "Condujo", width: 24 }, { header: "Firma", width: 22 }, { header: "Acta" },
    ],
    rows: meetingsState().filter((m) => !courseId || m.courseId === courseId).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map((m) => [
      m.date, m.time, MEETING_LABEL[m.kind], courseById(m.courseId)?.name ?? "", studentName(m.studentId),
      m.attendees.map((a) => `${a.name}${a.rut ? ` (${formatRut(a.rut)})` : ""}, ${RELATION_LABEL[a.relation]}${m.kind === "reunion" ? ` de ${studentName(a.studentId)}` : ""}`).join("; "),
      m.topics, m.agreements, nameOf(m.by), `${m.signature.method === "mineduc" ? "Verificador Mineduc" : "Demostración"}, ${m.signature.at.slice(0, 10)}`, actasOf(m.id).length ? "Sí" : "Falta",
    ]),
  }];
}
