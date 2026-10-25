import { describe, expect, it } from "vitest";
import { evaluateCourse, evaluateStudent, type StudentIndicators } from "../src/alerts";
import { currentStreak, gradeImprovement, pointRules, progressRanking, recognize, rewardRef } from "../src/reinforcement";

describe("refuerzo positivo", () => {
  it("refuerza de inmediato y nombra la conducta", () => {
    expect(recognize({ type: "arrived_on_time", date: "2026-10-15" })?.points).toBe(1);
    expect(recognize({ type: "conduct", kind: "commendation", date: "2026-10-15" })).toMatchObject({ badge: "felicitacion" });
  });

  it("la anotación negativa no descuenta puntos", () => {
    expect(recognize({ type: "conduct", kind: "negative", date: "2026-10-15" })).toBeNull();
  });

  it("otorga hitos de constancia solo en los días definidos", () => {
    expect(recognize({ type: "attendance_streak", days: 10, date: "x" })?.badge).toBe("constancia-10");
    expect(recognize({ type: "attendance_streak", days: 11, date: "x" })).toBeNull();
    expect(currentStreak(["absent", "present", "late", "present"])).toBe(3);
  });

  it("premia la mejora de notas por décima, con tope, y solo si mejora", () => {
    expect(gradeImprovement([4.0, 5.0], 5.0)).toBe(0.5);
    expect(recognize({ type: "grade_improved", subject: "Matemática", delta: 0.5, date: "x" })?.points).toBe(5);
    expect(recognize({ type: "grade_improved", subject: "Matemática", delta: 3.2, date: "x" })?.points).toBe(10);
    expect(gradeImprovement([5.5], 5.0)).toBeNull();
    expect(gradeImprovement([5.0], 5.0)).toBeNull();
    expect(gradeImprovement([], 6.0)).toBeNull();
  });

  it("publica la tabla de puntos con las reglas vigentes", () => {
    const rules = pointRules();
    expect(rules.find((r) => r.conduct === "Llegar a tiempo")?.points).toBe("1 por día");
    expect(rules.find((r) => r.conduct === "Asistir días seguidos")?.how).toContain("5, 10, 20, 40 y 60 días");
    expect(rules.filter((r) => !r.active).map((r) => r.conduct)).toEqual(["Entregar tareas a tiempo", "Cumplir una meta de salud"]);
    expect(rewardRef.onTime("2026-10-20")).toBe("llegada:2026-10-20");
  });

  it("el ranking premia la mejora, no el nivel absoluto", () => {
    const ranking = progressRanking([
      { // excelente pero estable
        studentId: "alto",
        baseline: { attendanceRate: 0.98, gradeAverage: 6.6, positives: 3, negatives: 0 },
        current: { attendanceRate: 0.98, gradeAverage: 6.6, positives: 3, negatives: 0 },
      },
      { // bajo pero mejorando
        studentId: "mejora",
        baseline: { attendanceRate: 0.74, gradeAverage: 3.9, positives: 0, negatives: 4 },
        current: { attendanceRate: 0.88, gradeAverage: 4.6, positives: 2, negatives: 1 },
      },
    ]);
    expect(ranking[0]!.studentId).toBe("mejora");
    expect(ranking[1]!.score).toBe(50);
  });
});

const base: StudentIndicators = {
  studentId: "s1",
  courseId: "c1",
  attendanceRate: 0.95,
  lateCount: 0,
  gradeAverage: 5.8,
  gradeAverageBaseline: 5.8,
  failingSubjects: 0,
  negativeConduct: 0,
  severeConduct: 0,
  positiveConduct: 2,
  nurseVisits: 0,
};

describe("indicadores deficitarios", () => {
  it("no alerta a un estudiante sin problemas", () => {
    expect(evaluateStudent(base)).toEqual([]);
  });

  it("explica cada alerta con su valor y umbral", () => {
    const alerts = evaluateStudent({ ...base, attendanceRate: 0.7, gradeAverage: 3.8, severeConduct: 1 });
    expect(alerts.map((a) => a.code).sort()).toEqual(["AVERAGE_DROP", "LOW_ATTENDANCE", "LOW_AVERAGE", "SEVERE_CONDUCT"]);
    expect(alerts.find((a) => a.code === "LOW_ATTENDANCE")!.reason).toContain("70 %");
  });

  it("agrega por curso y prioriza severidad alta", () => {
    const { summary, alerts } = evaluateCourse("c1", [
      base,
      { ...base, studentId: "s2", attendanceRate: 0.8 },
      { ...base, studentId: "s3", severeConduct: 2, nurseVisits: 6 },
    ]);
    expect(summary.studentsWithAlerts).toBe(2);
    expect(alerts[0]!.severity).toBe("alta");
  });
});
