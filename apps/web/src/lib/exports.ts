import "server-only";
import { can, formatRut, maskRut, weightedAverage, type Alert, type CellValue, type LessonStatus, type Sheet, type SheetColumn, type Student } from "@insedu/domain";
import { reportFor, school, studentById } from "./demo";
import type { Session } from "./session";
import { repo } from "./store";

/**
 * Planillas descargables del libro de clases y de los paneles.
 * Cada tipo declara qué parámetros usa y quién puede descargarlo; la ruta /api/descargas lo
 * verifica en el servidor con la misma matriz de permisos que las pantallas.
 */

export type ExportParams = { subjectId?: string; courseId?: string };

type ExportDef = {
  label: string;
  /** Devuelve la planilla, o null si los parámetros no corresponden a nada. */
  build: (p: ExportParams) => Sheet | null;
  allowed: (s: Session, p: ExportParams) => boolean;
};

const studentName = (s: Student) => `${s.lastName}, ${s.firstName}`;
const shortDate = (d: string) => d.slice(5).split("-").reverse().join("-");
const CODE: Record<LessonStatus, string> = { present: "P", late: "T", absent: "A", justified: "J" };
const KIND_LABEL = { positive: "Positiva", negative: "Negativa", commendation: "Felicitación" } as const;
const SEVERITY_LABEL = { leve: "Leve", grave: "Grave", gravisima: "Gravísima" } as const;
const DIMENSION_LABEL: Record<Alert["dimension"], string> = { asistencia: "Asistencia", academica: "Académica", conducta: "Conducta", salud: "Salud" };
const ALERT_SEVERITY: Record<Alert["severity"], string> = { media: "Media", alta: "Alta" };
const trend = (x: number) => (x > 0.05 ? "Mejora" : x < -0.05 ? "Baja" : "Estable");

/** Acción sugerida al profesor jefe según las alertas del estudiante (la usa también el panel). */
export function suggest(alerts: Alert[]) {
  if (alerts.some((a) => a.dimension === "conducta" && a.severity === "alta")) return "Coordinar con inspectoría y citar al apoderado.";
  if (alerts.some((a) => a.dimension === "asistencia")) return "Contactar al apoderado y revisar causas de inasistencia.";
  if (alerts.some((a) => a.dimension === "academica")) return "Plan de reforzamiento con docentes de asignatura.";
  return "Derivar a orientación o enfermería según corresponda.";
}

/** Columnas de resumen de asistencia y sus valores para una lista de estados. */
const ATTENDANCE_SUMMARY: SheetColumn[] = [
  { header: "Presentes", format: "integer" },
  { header: "Atrasos", format: "integer" },
  { header: "Ausentes", format: "integer" },
  { header: "Justificados", format: "integer" },
  { header: "Asistencia", format: "percent" },
];
function attendanceSummary(statuses: LessonStatus[]): CellValue[] {
  const n = (s: LessonStatus) => statuses.filter((x) => x === s).length;
  const attended = n("present") + n("late");
  return [n("present"), n("late"), n("absent"), n("justified"), statuses.length ? attended / statuses.length : null];
}

/** El curso existe y, si viene una asignatura, pertenece a ese curso. */
function courseTarget(p: ExportParams) {
  const course = p.courseId ? repo.course(p.courseId) : undefined;
  const subject = p.subjectId ? repo.subject(p.subjectId) : undefined;
  if (!course || (p.subjectId && subject?.courseId !== course.id)) return null;
  return { course, subject };
}

const readsSubject = (s: Session, p: ExportParams) => {
  const subject = p.subjectId ? repo.subject(p.subjectId) : undefined;
  return !!subject && can(s.person.roles, "course.read", s.scope, { subjectId: subject.id, courseId: subject.courseId });
};
const readsCourse = (s: Session, p: ExportParams) =>
  !!courseTarget(p) && can(s.person.roles, "course.read", s.scope, { courseId: p.courseId, subjectId: p.subjectId });
const leads = (s: Session) => s.person.roles.some((r) => r === "director" || r === "school_admin");

export const EXPORTS: Record<string, ExportDef> = {
  notas: {
    label: "Calificaciones",
    allowed: readsSubject,
    build: ({ subjectId }) => {
      const subject = subjectId ? repo.subject(subjectId) : undefined;
      if (!subject) return null;
      const evals = repo.evaluationsOf(subject.id);
      const grades = repo.gradesOf(subject.id);
      return {
        name: "Calificaciones",
        title: `Calificaciones · ${subject.name} · ${repo.course(subject.courseId)?.name}`,
        columns: [
          { header: "RUN" },
          { header: "Estudiante", width: 30 },
          ...evals.map((e): SheetColumn => ({ header: `${e.title} (${shortDate(e.date)}, ×${String(e.weight).replace(".", ",")})`, format: "grade", width: 14 })),
          { header: "Promedio", format: "grade" },
        ],
        rows: repo.studentsOf(subject.courseId).map((st) => [
          formatRut(st.rut),
          studentName(st),
          ...evals.map((e) => grades.find((g) => g.evaluationId === e.id && g.studentId === st.id)?.value ?? null),
          weightedAverage(evals, grades, st.id),
        ]),
      };
    },
  },

  "asistencia-clases": {
    label: "Asistencia por clase",
    allowed: readsSubject,
    build: ({ subjectId }) => {
      const subject = subjectId ? repo.subject(subjectId) : undefined;
      if (!subject) return null;
      const lessons = [...repo.lessonsOf(subject.id)].sort((a, b) => a.date.localeCompare(b.date) || a.block.localeCompare(b.block));
      return {
        name: "Asistencia por clase",
        title: `Asistencia por clase · ${subject.name} · ${repo.course(subject.courseId)?.name} (P presente, T atraso, A ausente, J justificado)`,
        columns: [
          { header: "RUN" },
          { header: "Estudiante", width: 30 },
          ...lessons.map((l): SheetColumn => ({ header: `${shortDate(l.date)} · bloque ${l.block}`, width: 11 })),
          ...ATTENDANCE_SUMMARY,
        ],
        rows: repo.studentsOf(subject.courseId).map((st) => {
          const statuses = lessons.map((l) => l.attendance[st.id]);
          return [formatRut(st.rut), studentName(st), ...statuses.map((s) => (s ? CODE[s] : null)), ...attendanceSummary(statuses.filter((s): s is LessonStatus => !!s))];
        }),
      };
    },
  },

  "asistencia-diaria": {
    label: "Asistencia diaria del curso",
    allowed: readsCourse,
    build: (p) => {
      const t = courseTarget(p);
      if (!t) return null;
      const students = repo.studentsOf(t.course.id);
      const ids = new Set(students.map((s) => s.id));
      const records = school().attendance.filter((a) => ids.has(a.studentId));
      const days = [...new Set(records.map((a) => a.date))].sort();
      const status = new Map(records.map((a) => [`${a.studentId}|${a.date}`, a.status]));
      return {
        name: "Asistencia diaria",
        title: `Asistencia diaria · ${t.course.name} (P presente, T atraso, A ausente, J justificado)`,
        columns: [{ header: "RUN" }, { header: "Estudiante", width: 30 }, ...days.map((d): SheetColumn => ({ header: shortDate(d), width: 7 })), ...ATTENDANCE_SUMMARY],
        rows: students.map((st) => {
          const statuses = days.map((d) => status.get(`${st.id}|${d}`));
          return [formatRut(st.rut), studentName(st), ...statuses.map((s) => (s ? CODE[s] : null)), ...attendanceSummary(statuses.filter((s): s is LessonStatus => !!s))];
        }),
      };
    },
  },

  anotaciones: {
    label: "Anotaciones",
    allowed: readsCourse,
    build: (p) => {
      const t = courseTarget(p);
      if (!t) return null;
      return {
        name: "Anotaciones",
        title: `Anotaciones · ${t.course.name}`,
        columns: [{ header: "Fecha", format: "date", width: 12 }, { header: "RUN" }, { header: "Estudiante", width: 30 }, { header: "Tipo" }, { header: "Gravedad" }, { header: "Hecho", width: 60 }, { header: "Registrado por", width: 22 }],
        rows: repo.conductOf(t.course.id).map((r) => {
          const st = studentById(r.studentId);
          return [r.date, st ? formatRut(st.rut) : null, st ? studentName(st) : null, KIND_LABEL[r.kind], r.severity ? SEVERITY_LABEL[r.severity] : null, r.description, repo.person(r.recordedBy)?.name ?? "Docente"];
        }),
      };
    },
  },

  alertas: {
    label: "Alertas del curso",
    allowed: readsCourse,
    build: (p) => {
      const t = courseTarget(p);
      if (!t) return null;
      const alerts = reportFor(t.course.id).alerts;
      const byStudent = new Map<string, Alert[]>();
      for (const a of alerts) byStudent.set(a.studentId, [...(byStudent.get(a.studentId) ?? []), a]);
      return {
        name: "Alertas",
        title: `Indicadores deficitarios · ${t.course.name}`,
        columns: [{ header: "RUN (parcial)" }, { header: "Estudiante", width: 30 }, { header: "Dimensión" }, { header: "Severidad" }, { header: "Motivo", width: 50 }, { header: "Acción sugerida", width: 45 }],
        rows: alerts.map((a) => {
          const st = studentById(a.studentId)!;
          return [maskRut(st.rut), studentName(st), DIMENSION_LABEL[a.dimension], ALERT_SEVERITY[a.severity], a.reason, suggest(byStudent.get(a.studentId)!)];
        }),
      };
    },
  },

  ranking: {
    label: "Ranking de progreso",
    allowed: readsCourse,
    build: (p) => {
      const t = courseTarget(p);
      if (!t) return null;
      return {
        name: "Ranking de progreso",
        title: `Ranking de progreso · ${t.course.name} (50 = sin cambio respecto de la línea base)`,
        columns: [{ header: "Posición", format: "integer" }, { header: "Estudiante", width: 30 }, { header: "Progreso", format: "decimal" }, { header: "Asistencia" }, { header: "Notas" }, { header: "Conducta" }],
        rows: reportFor(t.course.id).ranking.map((r) => {
          const st = studentById(r.studentId)!;
          return [r.position, studentName(st), r.score, trend(r.components.attendance), trend(r.components.grades), trend(r.components.conduct)];
        }),
      };
    },
  },

  cursos: {
    label: "Resumen por curso",
    allowed: leads,
    build: () => ({
      name: "Cursos",
      title: `Resumen por curso · ${school().name}`,
      columns: [
        { header: "Curso", width: 16 },
        { header: "Estudiantes", format: "integer" },
        { header: "Asistencia", format: "percent" },
        { header: "Promedio", format: "grade" },
        { header: "Con alertas", format: "integer" },
        { header: "Proporción con alertas", format: "percent" },
        { header: "Alertas de asistencia", format: "integer" },
        { header: "Alertas académicas", format: "integer" },
        { header: "Alertas de conducta", format: "integer" },
        { header: "Alertas de salud", format: "integer" },
      ],
      rows: school().courses.map((c) => {
        const s = reportFor(c.id).summary;
        return [c.name, s.students, s.avgAttendance, s.avgGrade, s.studentsWithAlerts, s.shareWithAlerts, s.byDimension.asistencia, s.byDimension.academica, s.byDimension.conducta, s.byDimension.salud];
      }),
    }),
  },
};

/** Enlace de descarga de un tipo en el formato pedido. */
export function exportHref(tipo: string, formato: "xlsx" | "csv", p: ExportParams = {}) {
  const q = new URLSearchParams({ formato });
  if (p.subjectId) q.set("asignatura", p.subjectId);
  if (p.courseId) q.set("curso", p.courseId);
  return `/api/descargas/${tipo}?${q}`;
}
