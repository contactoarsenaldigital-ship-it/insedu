import { describe, expect, it } from "vitest";
import { evaluateCourse, evaluateStudent, type StudentIndicators } from "../src/alerts";
import { currentStreak, progressRanking, recognize } from "../src/reinforcement";

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
