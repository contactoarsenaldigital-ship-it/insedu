import "server-only";
import { evaluateRisk, histogram, indicatorsByPeriod, periodsOf, type Course, type Student, type StudentRisk } from "@insedu/domain";
import { school } from "./demo";
import { nutritionOf } from "./health";
import type { Session } from "./session";
import { vault } from "./vault";

/**
 * Datos del tablero de indicadores de Salvaguarda, calculados desde los registros del colegio
 * (notas, anotaciones, asistencia, atenciones de enfermería y ficha de salud).
 */

/** Solo quien ejerce hoy como Encargado de Salvaguarda (titular o suplente activo), como el expediente. */
export function canSeeRiskboard(s: Session): boolean {
  return vault().service.holder(school().tenantId) === s.person.id;
}

export const LEVEL_GROUPS = {
  basica: { label: "Enseñanza básica", match: (c: Course) => c.level.includes("Básico") },
  media: { label: "Enseñanza media", match: (c: Course) => c.level.includes("Medio") },
} as const;
export type LevelGroup = keyof typeof LEVEL_GROUPS;

export type StudentRow = { student: Student; course: Course; risk: StudentRisk; indicators: ReturnType<typeof indicatorsByPeriod> };

export function riskboard() {
  const s = school();
  const periods = periodsOf(s.schoolDays);
  const by = <T extends { studentId: string }>(xs: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(x.studentId, [...(m.get(x.studentId) ?? []), x]);
    return m;
  };
  const grades = by(s.grades);
  const conduct = by(s.conduct);
  const attendance = by(s.attendance);
  const health = by(s.health);
  const courses = new Map(s.courses.map((c) => [c.id, c]));

  const rows: StudentRow[] = s.students.map((student) => {
    const indicators = indicatorsByPeriod(periods, {
      grades: grades.get(student.id) ?? [],
      conduct: conduct.get(student.id) ?? [],
      attendance: attendance.get(student.id) ?? [],
      health: health.get(student.id) ?? [],
    });
    return { student, course: courses.get(student.courseId)!, indicators, risk: evaluateRisk(indicators, nutritionOf(student.id)) };
  });

  const PRIORITY = { alta: 0, media: 1, seguimiento: 2 } as const;
  const attention = rows
    .filter((r) => r.risk.priority)
    .sort(
      (a, b) =>
        PRIORITY[a.risk.priority!] - PRIORITY[b.risk.priority!] ||
        Number(!!b.risk.pattern) - Number(!!a.risk.pattern) ||
        b.risk.current.length - a.risk.current.length ||
        Number(b.risk.trend === "empeora") - Number(a.risk.trend === "empeora") ||
        a.student.lastName.localeCompare(b.student.lastName, "es"),
    );

  return {
    periods,
    rows,
    attention,
    histogramOf: (subset: StudentRow[]) => histogram(subset.map((r) => r.risk.perPeriod), periods),
    coursesOf: (group: LevelGroup) => s.courses.filter((c) => LEVEL_GROUPS[group].match(c)),
  };
}
