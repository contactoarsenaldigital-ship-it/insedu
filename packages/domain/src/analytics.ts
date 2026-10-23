/**
 * Cálculo de indicadores por estudiante y curso a partir de los registros.
 * Se usa en paneles (profesor jefe, inspectoría, dirección) y en el ranking de progreso.
 */
import { evaluateCourse, type StudentIndicators } from "./alerts";
import { attendanceRate } from "./attendance";
import { progressRanking, type PeriodSnapshot, type ProgressInput } from "./reinforcement";
import type { AttendanceRecord, ConductRecord, GradeRecord, HealthVisit, Student } from "./types";

export type Dataset = {
  students: Student[];
  attendance: AttendanceRecord[];
  grades: GradeRecord[];
  conduct: ConductRecord[];
  health: HealthVisit[];
  cutoff: string;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function groupBy<T>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return m;
}

function snapshot(
  att: AttendanceRecord[],
  grades: GradeRecord[],
  conduct: ConductRecord[],
): PeriodSnapshot {
  return {
    attendanceRate: attendanceRate(att.map((a) => a.status)),
    gradeAverage: avg(grades.map((g) => g.value)),
    positives: conduct.filter((c) => c.kind !== "negative").length,
    negatives: conduct.filter((c) => c.kind === "negative").length,
  };
}

export function computeIndicators(ds: Dataset) {
  const att = groupBy(ds.attendance, (a) => a.studentId);
  const gr = groupBy(ds.grades, (g) => g.studentId);
  const co = groupBy(ds.conduct, (c) => c.studentId);
  const he = groupBy(ds.health, (h) => h.studentId);
  const isCurrent = (d: string) => d >= ds.cutoff;

  const indicators: StudentIndicators[] = [];
  const progress: ProgressInput[] = [];

  for (const s of ds.students) {
    const a = att.get(s.id) ?? [];
    const g = gr.get(s.id) ?? [];
    const c = co.get(s.id) ?? [];
    const h = he.get(s.id) ?? [];
    const aCur = a.filter((x) => isCurrent(x.date));
    const gCur = g.filter((x) => isCurrent(x.date));
    const cCur = c.filter((x) => isCurrent(x.date));
    const gBase = g.filter((x) => !isCurrent(x.date));

    const bySubject = groupBy(gCur, (x) => x.subject);
    const failing = [...bySubject.values()].filter((xs) => (avg(xs.map((x) => x.value)) ?? 7) < 4).length;

    indicators.push({
      studentId: s.id,
      courseId: s.courseId,
      attendanceRate: attendanceRate(aCur.map((x) => x.status)),
      lateCount: aCur.filter((x) => x.status === "late").length,
      gradeAverage: avg(gCur.map((x) => x.value)),
      gradeAverageBaseline: avg(gBase.map((x) => x.value)),
      failingSubjects: failing,
      negativeConduct: cCur.filter((x) => x.kind === "negative").length,
      severeConduct: cCur.filter((x) => x.kind === "negative" && x.severity !== "leve").length,
      positiveConduct: cCur.filter((x) => x.kind !== "negative").length,
      nurseVisits: h.filter((x) => isCurrent(x.date)).length,
    });

    progress.push({
      studentId: s.id,
      baseline: snapshot(
        a.filter((x) => !isCurrent(x.date)),
        gBase,
        c.filter((x) => !isCurrent(x.date)),
      ),
      current: snapshot(aCur, gCur, cCur),
    });
  }
  return { indicators, progress };
}

export function courseReport(ds: Dataset, courseId: string) {
  const { indicators, progress } = computeIndicators(ds);
  const ids = new Set(ds.students.filter((s) => s.courseId === courseId).map((s) => s.id));
  const { summary, alerts } = evaluateCourse(courseId, indicators);
  const ranking = progressRanking(progress.filter((p) => ids.has(p.studentId)));
  return { summary, alerts, ranking, indicators: indicators.filter((i) => ids.has(i.studentId)) };
}
