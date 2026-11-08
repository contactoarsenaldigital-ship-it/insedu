import "server-only";
import { formatRut, mulberry32, parseRut, PIE_NEED_LABEL, PIE_PLACE_LABEL, PIE_SECTIONS, pieCourseStatus, uuidv7, type PieEntry, type Role, type Sheet } from "@insedu/domain";
import { activeStudents, courseById, fullName, school, studentById } from "./demo";
import type { Session } from "./session";
import { allStaff, findPerson, pieState, STAFF } from "./store";

/**
 * Libro PIE: quién accede y datos del registro. No guarda diagnósticos (ver domain/pie).
 * El equipo de aula lo escribe; dirección, administración y el equipo de apoyo lo consultan.
 */
const READERS: Role[] = ["director", "school_admin", "psychologist", "counselor"];
const MANAGERS: Role[] = ["pie_professional", "director", "school_admin"];
/** Quienes pueden integrar un equipo de aula. */
const TEAM_ROLES: Role[] = ["teacher", "head_teacher", "pie_professional", "psychologist", "counselor", "social_worker"];

const hasRole = (s: Session, roles: Role[]) => s.person.roles.some((r) => roles.includes(r));

export const teamOf = (courseId: string) => pieState().team.filter((m) => m.courseId === courseId && m.active);
export const teamIds = (courseId: string) => teamOf(courseId).map((m) => m.personId);

/** Docente del curso: dicta una de sus asignaturas o tiene la jefatura. */
const teachesCourse = (s: Session, courseId: string) =>
  s.scope.headOfCourseIds.includes(courseId) || s.scope.subjectIds.some((id) => id.startsWith(`${courseId}--`));

export const canWritePie = (s: Session, courseId: string) => hasRole(s, ["pie_professional"]) || teamIds(courseId).includes(s.person.id) || teachesCourse(s, courseId);
export const canReadPie = (s: Session, courseId: string) => canWritePie(s, courseId) || hasRole(s, READERS);
export const canManagePie = (s: Session) => hasRole(s, MANAGERS);
export const canOpenPie = (s: Session) => canManagePie(s) || hasRole(s, READERS) || s.scope.headOfCourseIds.length > 0 || s.scope.subjectIds.length > 0;

export const teamCandidates = () => allStaff().filter((p) => p.roles.some((r) => TEAM_ROLES.includes(r)));

/** Nómina vigente del curso: excluye egresos del programa y bajas de matrícula. */
export function nominaOf(courseId: string) {
  const active = new Set(activeStudents().filter((s) => s.courseId === courseId).map((s) => s.id));
  return pieState().students.filter((p) => !p.until && active.has(p.id));
}

export const entriesOf = (courseId: string) =>
  pieState().entries.filter((e) => e.courseId === courseId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

export const pieToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

export const statusOf = (courseId: string) => pieCourseStatus(entriesOf(courseId), nominaOf(courseId).length, teamOf(courseId).length, pieToday());

const run = (rut: string) => (parseRut(rut) ? formatRut(rut) : rut);
const nameOf = (id: string) => findPerson(id)?.name ?? id;
const studentName = (id: string) => {
  const st = studentById(id);
  return st ? fullName(st) : id;
};

/** Planillas del registro para el respaldo del libro. */
export function pieSheets(courseId?: string): Sheet[] {
  const courses = school().courses.filter((c) => !courseId || c.id === courseId);
  const courseIds = new Set(courses.map((c) => c.id));
  const scope = courseId ? ` · ${courseById(courseId)?.name}` : "";
  const { students, team, entries } = pieState();
  return [
    {
      name: "PIE nómina",
      title: `Programa de Integración Escolar: nómina${scope}`,
      columns: [{ header: "RUN" }, { header: "Estudiante", width: 30 }, { header: "Curso", width: 14 }, { header: "Necesidad", width: 18 }, { header: "Desde", format: "date" }, { header: "Hasta", format: "date" }, { header: "Motivo de egreso", width: 30 }],
      rows: students.flatMap((p) => {
        const st = studentById(p.id);
        return st && courseIds.has(st.courseId) ? [[run(st.rut), fullName(st), courseById(st.courseId)?.name ?? "", PIE_NEED_LABEL[p.need], p.since, p.until ?? "", p.endReason ?? ""]] : [];
      }),
    },
    {
      name: "PIE equipo",
      title: `Programa de Integración Escolar: equipo de aula${scope}`,
      columns: [{ header: "Curso", width: 14 }, { header: "Integrante", width: 28 }, { header: "Función", width: 28 }, { header: "Horas semanales", format: "decimal" }, { header: "Vigente" }],
      rows: team.filter((m) => courseIds.has(m.courseId)).map((m) => [courseById(m.courseId)?.name ?? "", nameOf(m.personId), m.role, m.weeklyHours ?? null, m.active ? "Sí" : "No"]),
    },
    {
      name: "PIE registro",
      title: `Programa de Integración Escolar: planificación y evaluación${scope}`,
      columns: [{ header: "Fecha", format: "date" }, { header: "Curso", width: 14 }, { header: "Registro", width: 34 }, { header: "Descripción", width: 60 }, { header: "Estudiantes", width: 34 }, { header: "Participantes", width: 34 }, { header: "Minutos", format: "integer" }, { header: "Lugar", width: 16 }, { header: "Aprobado por", width: 20 }, { header: "Firmas", width: 40 }],
      rows: entries.filter((e) => courseIds.has(e.courseId)).sort((a, b) => a.date.localeCompare(b.date)).map((e) => [
        e.date, courseById(e.courseId)?.name ?? "", PIE_SECTIONS[e.section].label, e.text, e.studentIds.map(studentName).join(", "), e.participantIds.map(nameOf).join(", "), e.minutes ?? null, e.place ? PIE_PLACE_LABEL[e.place] : "",
        [e.approvedByStudent && "Estudiante", e.approvedByGuardian && "Apoderado/a"].filter(Boolean).join(" y "), e.signatures.map((s) => `${nameOf(s.by)} (${s.at.slice(0, 10)}, ${s.method === "mineduc" ? "Mineduc" : "demostración"})`).join("; "),
      ]),
    },
  ];
}

/** Datos ficticios de ejemplo para un curso: nómina, equipo y un registro en cada parte. */
export function seedPieCourse(courseId: string) {
  const st = pieState();
  const r = mulberry32([...courseId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 17));
  const pupils = activeStudents().filter((s) => s.courseId === courseId && !st.students.some((p) => p.id === s.id)).slice(3, 8);
  const days = school().schoolDays;
  const day = (n: number) => days[Math.max(0, days.length - 1 - n)] ?? days[0]!;
  const since = days[0] ?? "2026-03-02";
  for (const p of pupils) st.students.push({ id: p.id, need: r() < 0.3 ? "permanente" : "transitoria", since, by: "pie-1" });
  const head = courseById(courseId)?.headTeacherId;
  const members = [
    { personId: "pie-1", role: "Educadora diferencial", weeklyHours: 10 },
    ...(head && STAFF.some((p) => p.id === head) ? [{ personId: head, role: "Docente de aula", weeklyHours: 3 }] : []),
  ];
  for (const m of members) if (!st.team.some((x) => x.courseId === courseId && x.personId === m.personId)) st.team.push({ id: `${courseId}:${m.personId}`, courseId, active: true, ...m });
  const ids = pupils.map((p) => p.id);
  const add = (e: Partial<PieEntry> & Pick<PieEntry, "section" | "date" | "text">, signed = true) => {
    const at = `${e.date}T15:00:00.000Z`;
    st.entries.push({ id: uuidv7(), courseId, studentIds: [], participantIds: [], createdBy: "pie-1", createdAt: at, signatures: signed ? [{ by: "pie-1", at, method: "interno" }] : [], ...e });
  };
  const everyone = members.map((m) => m.personId);
  add({ section: "coordinacion", date: day(25), text: "Se acuerda la distribución de apoyos del mes y el foco en comprensión lectora.", participantIds: everyone });
  add({ section: "estrategias", date: day(24), text: "Trabajo en estaciones de aprendizaje con material concreto y consignas graduadas." });
  add({ section: "colaborativo", date: day(20), text: "Planificación conjunta de la unidad de fracciones entre docente de aula y educadora diferencial." });
  add({ section: "diversidad", date: day(19), text: "Adecuaciones de acceso: tiempo adicional en evaluaciones y apoyos visuales en las instrucciones." });
  if (ids[0]) add({ section: "plan_individual", date: day(18), text: "Objetivo: fortalecer la comprensión de instrucciones escritas. Apoyo dos veces por semana.", studentIds: [ids[0]], approvedByStudent: true, approvedByGuardian: true });
  add({ section: "familia_plan", date: day(17), text: "Entrevistas mensuales con apoderados y pauta de refuerzo de lectura en el hogar." });
  add({ section: "evaluacion", date: day(6), text: "Las estaciones de aprendizaje favorecieron la participación; se ajusta el tiempo por estación." });
  if (ids.length) {
    add({ section: "apoyo", date: day(3), text: "Apoyo en comprensión lectora con texto adaptado y preguntas guiadas.", studentIds: ids.slice(0, 2), minutes: 45, place: "aula_comun" });
    add({ section: "apoyo", date: day(1), text: "Refuerzo de estrategias de resolución de problemas en grupo pequeño.", studentIds: ids.slice(1, 3), minutes: 45, place: "aula_recursos" }, false);
    add({ section: "logros", date: day(2), text: "Identifica la idea principal de un texto breve con apoyo mínimo.", studentIds: ids.slice(0, 1) });
  }
  add({ section: "familia", date: day(9), text: "Entrevista con apoderados para revisar avances y acordar rutina de estudio." });
  add({ section: "comunidad", date: day(14), text: "Coordinación con el centro de salud familiar para el seguimiento de apoyos." });
  add({ section: "actas", date: day(10), text: "Acta: se revisan avances del curso y se acuerda una nueva reunión en cuatro semanas.", participantIds: everyone });
}

export function seedPie() {
  for (const courseId of ["course-1", "course-2", "course-3", "course-4"]) if (courseById(courseId)) seedPieCourse(courseId);
}
