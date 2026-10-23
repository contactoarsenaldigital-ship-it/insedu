/**
 * Detección de indicadores deficitarios (ABC: Asistencia, Conducta, Rendimiento + Salud).
 *
 * Las reglas son configurables por establecimiento y explicables: cada alerta dice qué
 * indicador la generó, su valor y el umbral. Son apoyo a la decisión profesional; no
 * diagnostican ni sancionan (Plan Maestro 4.10.A).
 */

export type StudentIndicators = {
  studentId: string;
  courseId: string;
  attendanceRate: number; // 0..1, periodo actual
  lateCount: number; // atrasos en el periodo
  gradeAverage: number | null; // 1.0..7.0
  gradeAverageBaseline: number | null;
  failingSubjects: number; // asignaturas con promedio < 4,0
  negativeConduct: number; // anotaciones negativas en el periodo
  severeConduct: number; // graves o gravísimas en el periodo
  positiveConduct: number;
  nurseVisits: number; // atenciones de enfermería en el periodo
};

export type AlertRules = {
  minAttendance: number;
  maxLates: number;
  minAverage: number;
  maxAverageDrop: number;
  maxFailingSubjects: number;
  maxNegativeConduct: number;
  maxNurseVisits: number;
};

/** Valores por defecto; cada colegio los ajusta en Administración. */
export const DEFAULT_ALERT_RULES: AlertRules = {
  minAttendance: 0.85,
  maxLates: 5,
  minAverage: 4.5,
  maxAverageDrop: 0.5,
  maxFailingSubjects: 1,
  maxNegativeConduct: 3,
  maxNurseVisits: 4,
};

export type Dimension = "asistencia" | "academica" | "conducta" | "salud";
export type Severity = "media" | "alta";

export type Alert = {
  studentId: string;
  dimension: Dimension;
  code: string;
  severity: Severity;
  reason: string; // explicación legible
};

const pct = (x: number) => `${Math.round(x * 100)} %`;
const dec = (x: number) => x.toFixed(1).replace(".", ",");

export function evaluateStudent(s: StudentIndicators, r = DEFAULT_ALERT_RULES): Alert[] {
  const out: Alert[] = [];
  const add = (dimension: Dimension, code: string, severity: Severity, reason: string) =>
    out.push({ studentId: s.studentId, dimension, code, severity, reason });

  if (s.attendanceRate < r.minAttendance) {
    add(
      "asistencia",
      "LOW_ATTENDANCE",
      s.attendanceRate < r.minAttendance - 0.1 ? "alta" : "media",
      `Asistencia ${pct(s.attendanceRate)} (umbral ${pct(r.minAttendance)})`,
    );
  }
  if (s.lateCount > r.maxLates) {
    add("asistencia", "FREQUENT_LATES", "media", `${s.lateCount} atrasos (umbral ${r.maxLates})`);
  }
  if (s.gradeAverage != null && s.gradeAverage < r.minAverage) {
    add(
      "academica",
      "LOW_AVERAGE",
      s.gradeAverage < 4.0 ? "alta" : "media",
      `Promedio ${dec(s.gradeAverage)} (umbral ${dec(r.minAverage)})`,
    );
  }
  if (
    s.gradeAverage != null &&
    s.gradeAverageBaseline != null &&
    s.gradeAverageBaseline - s.gradeAverage >= r.maxAverageDrop
  ) {
    add(
      "academica",
      "AVERAGE_DROP",
      "media",
      `Promedio bajó de ${dec(s.gradeAverageBaseline)} a ${dec(s.gradeAverage)}`,
    );
  }
  if (s.failingSubjects > r.maxFailingSubjects) {
    add(
      "academica",
      "FAILING_SUBJECTS",
      s.failingSubjects >= 3 ? "alta" : "media",
      `${s.failingSubjects} asignaturas bajo 4,0`,
    );
  }
  if (s.severeConduct > 0) {
    add("conducta", "SEVERE_CONDUCT", "alta", `${s.severeConduct} anotación(es) grave(s) o gravísima(s)`);
  }
  if (s.negativeConduct > r.maxNegativeConduct) {
    add(
      "conducta",
      "NEGATIVE_CONDUCT",
      "media",
      `${s.negativeConduct} anotaciones negativas (umbral ${r.maxNegativeConduct})`,
    );
  }
  if (s.nurseVisits > r.maxNurseVisits) {
    add("salud", "FREQUENT_NURSE_VISITS", "media", `${s.nurseVisits} atenciones de enfermería`);
  }
  return out;
}

export type CourseIndicators = {
  courseId: string;
  students: number;
  avgAttendance: number;
  avgGrade: number | null;
  studentsWithAlerts: number;
  shareWithAlerts: number;
  byDimension: Record<Dimension, number>;
};

/** Agrega indicadores por curso para comparar grupos. */
export function evaluateCourse(courseId: string, students: StudentIndicators[], r = DEFAULT_ALERT_RULES) {
  const inCourse = students.filter((s) => s.courseId === courseId);
  const alerts = inCourse.flatMap((s) => evaluateStudent(s, r));
  const flagged = new Set(alerts.map((a) => a.studentId));
  const grades = inCourse.map((s) => s.gradeAverage).filter((g): g is number => g != null);
  const byDimension: Record<Dimension, number> = { asistencia: 0, academica: 0, conducta: 0, salud: 0 };
  for (const d of Object.keys(byDimension) as Dimension[]) {
    byDimension[d] = new Set(alerts.filter((a) => a.dimension === d).map((a) => a.studentId)).size;
  }
  const n = inCourse.length || 1;
  const summary: CourseIndicators = {
    courseId,
    students: inCourse.length,
    avgAttendance: inCourse.reduce((acc, s) => acc + s.attendanceRate, 0) / n,
    avgGrade: grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : null,
    studentsWithAlerts: flagged.size,
    shareWithAlerts: flagged.size / n,
    byDimension,
  };
  return { summary, alerts: prioritize(alerts) };
}

/** Prioriza: primero severidad alta, luego estudiantes con más dimensiones afectadas. */
export function prioritize(alerts: Alert[]): Alert[] {
  const dims = new Map<string, Set<Dimension>>();
  for (const a of alerts) {
    if (!dims.has(a.studentId)) dims.set(a.studentId, new Set());
    dims.get(a.studentId)!.add(a.dimension);
  }
  const rank = (a: Alert) => (a.severity === "alta" ? 10 : 0) + (dims.get(a.studentId)?.size ?? 0);
  return [...alerts].sort((a, b) => rank(b) - rank(a) || a.studentId.localeCompare(b.studentId));
}
