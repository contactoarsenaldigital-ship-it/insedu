import "server-only";
import { appendEvent, type LogbookEvent, type LogbookInput } from "@insedu/domain/server";
import { SUBJECTS, uuidv7, type AuthorizedPickup, type ConductRecord, type CourseExit, type EnrollmentRecord, type StudentExit, type SchoolDayEvent, type SubsidyCorrection, type SubsidyDeclaration, type StoredDocument, type DocumentRequest, type InstitutionalDoc, type BellPeriod, type ScheduleSlot, type GuardianMeeting, type CourseCapacity, type StaffDegree, type DailySignature, type PieEntry, type PieStudent, type PieTeamMember, type Correction, type Evaluation, type GradeEntry, type Lesson } from "@insedu/domain";
import { accountById, accountStaff, personOf } from "./accounts";
import { school, activeStudents } from "./demo";
import type { LibroRepository, Person, Subject } from "./repository";

/**
 * Implementación en memoria del libro de clases sobre el colegio sintético.
 * - Comparte los arreglos del colegio (notas, anotaciones), así los paneles reflejan lo registrado.
 * - Vive en globalThis para sobrevivir recargas en desarrollo. Se reinicia al reiniciar el servidor.
 */

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Docentes del colegio ficticio: asignatura por nombre, profesor jefe por curso. */
export const TEACHERS: Person[] = [
  { id: "teacher-1", name: "Carolina Fuentes", roles: ["teacher", "head_teacher"], description: "Matemática · profesora jefe de 5° Básico A" },
  { id: "teacher-2", name: "Rodrigo Tapia", roles: ["teacher", "head_teacher"], description: "Lenguaje · profesor jefe de 7° Básico A" },
  { id: "teacher-3", name: "Paula Araya", roles: ["teacher", "head_teacher"], description: "Historia y Ciencias · profesora jefe de 1° Medio A" },
  { id: "teacher-4", name: "Felipe Morales", roles: ["teacher", "head_teacher"], description: "Inglés y Ed. Física · profesor jefe de 2° Medio A" },
];
const SUBJECT_TEACHER: Record<string, string> = {
  Matemática: "teacher-1",
  Lenguaje: "teacher-2",
  Historia: "teacher-3",
  Ciencias: "teacher-3",
  Inglés: "teacher-4",
  "Ed. Física": "teacher-4",
};

export const STAFF: Person[] = [
  ...TEACHERS,
  { id: "inspector-1", name: "Marcela Rojas", roles: ["inspector"], description: "Inspectora general" },
  { id: "director-1", name: "Jorge Valenzuela", roles: ["director"], description: "Director" },
  { id: "admin-1", name: "Daniela Castro", roles: ["school_admin"], description: "Administración del establecimiento" },
  { id: "nurse-1", name: "Lorena Pizarro", roles: ["nurse"], description: "Enfermería" },
  { id: "psych-1", name: "Andrea Soto", roles: ["psychologist"], description: "Psicóloga" },
  { id: "pie-1", name: "Natalia Vera", roles: ["pie_professional"], description: "Educadora diferencial · Programa de Integración Escolar" },
  { id: "sg-1", name: "Verónica Díaz", roles: ["safeguarding_lead"], description: "Encargada de Salvaguarda (titular)" },
  { id: "sg-2", name: "Patricio Reyes", roles: ["counselor"], description: "Orientador · suplente formal de Salvaguarda" },
];

/** Apoderado/a de un estudiante (uno por estudiante en el colegio ficticio). */
export function guardianOf(studentId: string): Person | undefined {
  const st = school().students.find((s) => s.id === studentId);
  if (!st) return undefined;
  return {
    id: `guardian-of-${studentId}`,
    name: enrollmentRecords().find((r) => r.id === studentId)?.guardians[0]?.name ?? `Apoderado/a de ${st.firstName} ${st.lastName.split(" ")[0]}`,
    roles: ["guardian_academic"],
    description: `Apoderado/a académico/a de ${st.firstName} ${st.lastName}`,
    wards: [studentId],
  };
}

export function studentPerson(studentId: string): Person | undefined {
  const st = school().students.find((s) => s.id === studentId);
  return st ? { id: st.id, name: `${st.firstName} ${st.lastName}`, roles: ["student"], description: `Estudiante de ${school().courses.find((c) => c.id === st.courseId)?.name}` } : undefined;
}

/** Estudiante y apoderada habilitados para ingresar en la demostración. */
export const DEMO_STUDENT_ID = "student-001";

/** Un estudiante por curso, para probar lo que ve cada curso (encuestas, comunicados). */
export function demoStudentIds(): string[] {
  const s = school();
  return s.courses
    .map((c) => (c.id === s.students.find((x) => x.id === DEMO_STUDENT_ID && !x.withdrawnOn)?.courseId ? DEMO_STUDENT_ID : activeStudents().find((x) => x.courseId === c.id)?.id))
    .filter((id): id is string => !!id);
}

/** Personas que pueden ingresar en la demostración. */
export function loginPeople(): Person[] {
  return [...STAFF, ...demoStudentIds().map((id) => studentPerson(id)!), guardianOf(DEMO_STUDENT_ID)!];
}

/** Resuelve cualquier persona por id: personal, estudiantes, apoderados o cuentas propias. */
export function findPerson(id: string): Person | undefined {
  if (id.startsWith("guardian-of-")) return guardianOf(id.slice("guardian-of-".length));
  if (id.startsWith("student-")) return studentPerson(id);
  if (id.startsWith("acc-")) {
    const a = accountById(id);
    return a ? personOf(a) : undefined;
  }
  return STAFF.find((p) => p.id === id);
}

/** Personal del colegio ficticio más el personal con cuenta activa. */
export function allStaff(): Person[] {
  return [...STAFF, ...accountStaff()];
}

type State = {
  subjects: Subject[];
  evaluations: Evaluation[];
  lessons: Lesson[];
  corrections: (Correction & { courseId: string })[];
  /** Bitácora del libro: todo ingreso, cambio, firma o exportación (ver domain/logbook). */
  logbook: LogbookEvent[];
  /** Registro general de matrícula (ver lib/matricula). */
  enrollments: EnrollmentRecord[];
  /** Libro PIE (ver lib/pie). */
  pieStudents: PieStudent[];
  pieTeam: PieTeamMember[];
  pieEntries: PieEntry[];
  /** Registro de salidas o retiros (ver lib/salidas). */
  pickups: AuthorizedPickup[];
  exits: StudentExit[];
  courseExits: CourseExit[];
  /** Control de subvenciones (ver lib/subvenciones). */
  subsidyCorrections: SubsidyCorrection[];
  subsidyEvents: SchoolDayEvent[];
  subsidyDeclarations: SubsidyDeclaration[];
  /** Fichas de documentos adjuntos; el contenido cifrado va aparte (ver lib/documentos). */
  documents: StoredDocument[];
  /** Entrega de información (ver lib/entregas). */
  docRequests: DocumentRequest[];
  institutionalDocs: InstitutionalDoc[];
  /** Horario (ver lib/horario). */
  bells: BellPeriod[];
  slots: ScheduleSlot[];
  /** Entrevistas y reuniones con apoderados (ver lib/entrevistas). */
  meetings: GuardianMeeting[];
  /** Datos para el EDE (ver lib/datos-ede). */
  courseCapacities: CourseCapacity[];
  staffDegrees: StaffDegree[];
  /** Firma de la asistencia diaria de cada curso. */
  dailySignatures: DailySignature[];
};

export function initStore(): State {
  const s = school();
  const subjects: Subject[] = s.courses.flatMap((c) =>
    SUBJECTS.map((name) => ({ id: `${c.id}--${slug(name)}`, courseId: c.id, name, teacherId: SUBJECT_TEACHER[name] ?? "teacher-1" })),
  );
  // Las notas sintéticas se agrupan en evaluaciones por curso, asignatura y fecha.
  const courseOf = new Map(s.students.map((st) => [st.id, st.courseId]));
  const evaluations = new Map<string, Evaluation>();
  const counter = new Map<string, number>();
  for (const g of [...s.grades].sort((a, b) => a.date.localeCompare(b.date))) {
    const subjectId = `${courseOf.get(g.studentId)}--${slug(g.subject)}`;
    const id = `${subjectId}--${g.date}`;
    if (!evaluations.has(id)) {
      const n = (counter.get(subjectId) ?? 0) + 1;
      counter.set(subjectId, n);
      evaluations.set(id, { id, subjectId, title: `Evaluación ${n}`, date: g.date, weight: 1 });
    }
    g.id = `${id}::${g.studentId}`; // id estable: evaluación + estudiante
  }
  return { subjects, evaluations: [...evaluations.values()], lessons: [], corrections: [], logbook: [], enrollments: [], pieStudents: [], pieTeam: [], pieEntries: [], pickups: [], exits: [], courseExits: [], subsidyCorrections: [], subsidyEvents: [], subsidyDeclarations: [], documents: [], docRequests: [], institutionalDocs: [], bells: [], slots: [], meetings: [], courseCapacities: [], staffDegrees: [], dailySignatures: [] };
}

const g = globalThis as unknown as { __insedu_store?: State };
const state = (): State => (g.__insedu_store ??= initStore());

export function timetableState() {
  const st = state();
  return {
    get bells() { return (st.bells ??= []); },
    get slots() { return (st.slots ??= []); },
  };
}

export function deliveriesState() {
  const st = state();
  return {
    get requests() { return (st.docRequests ??= []); },
    get institutional() { return (st.institutionalDocs ??= []); },
  };
}

export const documentsState = (): StoredDocument[] => (state().documents ??= []);

export const meetingsState = (): GuardianMeeting[] => (state().meetings ??= []);

export function edeDataState() {
  const st = state();
  return {
    get capacities() { return (st.courseCapacities ??= []); },
    get degrees() { return (st.staffDegrees ??= []); },
    get dailySignatures() { return (st.dailySignatures ??= []); },
  };
}

export function subsidyState() {
  const st = state();
  return {
    get corrections() { return (st.subsidyCorrections ??= []); },
    get events() { return (st.subsidyEvents ??= []); },
    get declarations() { return (st.subsidyDeclarations ??= []); },
  };
}

export function exitsState() {
  const st = state();
  return {
    get pickups() { return (st.pickups ??= []); },
    get exits() { return (st.exits ??= []); },
    get courseExits() { return (st.courseExits ??= []); },
  };
}

export function pieState() {
  const st = state();
  return {
    get students() { return (st.pieStudents ??= []); },
    get team() { return (st.pieTeam ??= []); },
    get entries() { return (st.pieEntries ??= []); },
  };
}

export const enrollmentRecords = (): EnrollmentRecord[] => (state().enrollments ??= []);

export const logbook = (): LogbookEvent[] => (state().logbook ??= []);

/** Deja constancia en la bitácora del libro. */
export const logEvent = (input: LogbookInput) => appendEvent(logbook(), input, uuidv7());

const gradeId = (evaluationId: string, studentId: string) => `${evaluationId}::${studentId}`;

export const repo: LibroRepository = {
  courses: () => school().courses,
  course: (id) => school().courses.find((c) => c.id === id),
  subjects: () => state().subjects,
  subject: (id) => state().subjects.find((x) => x.id === id),
  studentsOf: (courseId) =>
    activeStudents().filter((s) => s.courseId === courseId).sort((a, b) => a.lastName.localeCompare(b.lastName, "es")),
  person: (id) => findPerson(id),

  evaluationsOf: (subjectId) =>
    state().evaluations.filter((e) => e.subjectId === subjectId).sort((a, b) => a.date.localeCompare(b.date)),
  gradesOf(subjectId) {
    const evals = new Set(state().evaluations.filter((e) => e.subjectId === subjectId).map((e) => e.id));
    return school()
      .grades.map((gr) => ({ gr, evaluationId: gr.id.split("::")[0]! }))
      .filter((x) => evals.has(x.evaluationId))
      .map(({ gr, evaluationId }) => ({ evaluationId, studentId: gr.studentId, value: gr.value }));
  },
  lessonsOf: (subjectId) =>
    state().lessons.filter((l) => l.subjectId === subjectId).sort((a, b) => b.date.localeCompare(a.date) || b.block.localeCompare(a.block)),
  lesson: (id) => state().lessons.find((l) => l.id === id),
  conductOf(courseId) {
    const ids = new Set(school().students.filter((s) => s.courseId === courseId).map((s) => s.id));
    return school().conduct.filter((c) => ids.has(c.studentId)).sort((a, b) => b.date.localeCompare(a.date));
  },
  correctionsOf: (courseId) =>
    state().corrections.filter((c) => c.courseId === courseId).sort((a, b) => b.at.localeCompare(a.at)),

  addEvaluation(e) {
    const ev: Evaluation = { ...e, id: uuidv7() };
    state().evaluations.push(ev);
    return ev;
  },
  setGrade(entry) {
    const ev = state().evaluations.find((e) => e.id === entry.evaluationId);
    const subject = ev && state().subjects.find((x) => x.id === ev.subjectId);
    if (!ev || !subject) throw new Error("Evaluación inexistente");
    const id = gradeId(entry.evaluationId, entry.studentId);
    const existing = school().grades.find((x) => x.id === id);
    if (existing) existing.value = entry.value;
    else school().grades.push({ id, studentId: entry.studentId, subject: subject.name, date: ev.date, value: entry.value });
  },
  addLesson(l) {
    const lesson: Lesson = { ...l, id: uuidv7() };
    state().lessons.push(lesson);
    return lesson;
  },
  updateLesson(id, patch) {
    const l = state().lessons.find((x) => x.id === id);
    if (!l) throw new Error("Clase inexistente");
    Object.assign(l, patch);
  },
  addConduct(c) {
    const rec: ConductRecord = { ...c, id: uuidv7() };
    school().conduct.push(rec);
    return rec;
  },
  addCorrection(c) {
    const rec = { ...c, id: uuidv7(), at: new Date().toISOString() };
    state().corrections.push(rec);
    return rec;
  },
};

/** Curso nuevo (carga inicial): crea sus asignaturas en el libro, sin docente asignado aún. */
export function addCourseSubjects(courseId: string) {
  const st = state();
  for (const name of SUBJECTS) {
    const id = `${courseId}--${slug(name)}`;
    if (!st.subjects.some((x) => x.id === id)) st.subjects.push({ id, courseId, name, teacherId: "" });
  }
}
