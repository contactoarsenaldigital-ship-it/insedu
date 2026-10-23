import { describe, expect, it } from "vitest";
import {
  canSign,
  evaluationStats,
  formatGrade,
  generalAverage,
  parseGrade,
  requiresCorrection,
  roundTenth,
  validateLesson,
  validateReason,
  weightedAverage,
  type Evaluation,
  type GradeEntry,
  type Lesson,
} from "../src/gradebook";
import { can } from "../src/permissions";

describe("aproximación chilena", () => {
  it("0,05 sube a la décima siguiente", () => {
    expect(roundTenth(3.95)).toBe(4.0);
    expect(roundTenth(3.9499)).toBe(3.9);
    expect(roundTenth(4.35)).toBe(4.4); // 4.35 * 10 = 43.4999… en binario
    expect(roundTenth(5.25)).toBe(5.3);
  });
  it("modo truncar disponible para reglamentos que lo exigen", () => {
    expect(roundTenth(3.99, "truncate")).toBe(3.9);
  });
});

describe("ingreso de notas", () => {
  it("acepta coma, punto y dos dígitos sin coma", () => {
    expect(parseGrade("5,5")).toBe(5.5);
    expect(parseGrade("5.5")).toBe(5.5);
    expect(parseGrade("55")).toBe(5.5);
    expect(parseGrade("7")).toBe(7);
  });
  it("rechaza fuera de escala o formato", () => {
    expect(parseGrade("0,9")).toBeNull();
    expect(parseGrade("75")).toBeNull();
    expect(parseGrade("5,55")).toBeNull();
    expect(parseGrade("")).toBeNull();
  });
  it("formatea con coma decimal", () => {
    expect(formatGrade(4)).toBe("4,0");
    expect(formatGrade(null)).toBe("—");
  });
});

const evals: Evaluation[] = [
  { id: "e1", subjectId: "m", title: "Prueba 1", date: "2026-09-01", weight: 1 },
  { id: "e2", subjectId: "m", title: "Prueba 2", date: "2026-09-15", weight: 2 },
  { id: "e3", subjectId: "m", title: "Trabajo", date: "2026-10-01", weight: 1 },
];
const grades: GradeEntry[] = [
  { evaluationId: "e1", studentId: "s1", value: 3.0 },
  { evaluationId: "e2", studentId: "s1", value: 4.5 },
  { evaluationId: "e1", studentId: "s2", value: 6.0 },
];

describe("promedios", () => {
  it("pondera y omite evaluaciones sin nota", () => {
    expect(weightedAverage(evals, grades, "s1")).toBe(4.0); // (3 + 9) / 3
    expect(weightedAverage(evals, grades, "s2")).toBe(6.0);
    expect(weightedAverage(evals, grades, "s3")).toBeNull();
  });
  it("promedio general aproxima a la décima", () => {
    expect(generalAverage([4.0, 5.5, null, 6.4])).toBe(5.3);
  });
  it("estadísticas por evaluación", () => {
    expect(evaluationStats(evals[0]!, grades)).toEqual({ count: 2, average: 4.5, failing: 1, failingShare: 0.5 });
  });
});

describe("leccionario", () => {
  const lesson: Lesson = {
    id: "l1", subjectId: "m", courseId: "c", date: "2026-10-16", block: "1-2",
    objective: "OA 3", content: "Resolución guiada de problemas", teacherId: "t",
    attendance: { s1: "present" },
  };
  it("valida campos mínimos", () => {
    expect(validateLesson({ ...lesson, content: "corto" })).toHaveLength(1);
    expect(validateLesson(lesson)).toEqual([]);
  });
  it("no se firma con asistencia incompleta ni dos veces", () => {
    expect(canSign(lesson, ["s1", "s2"])[0]).toContain("1 estudiante");
    expect(canSign(lesson, ["s1"])).toEqual([]);
    expect(canSign({ ...lesson, signedAt: "x" }, ["s1"])).toContain("La clase ya está firmada");
  });
  it("correcciones con motivo", () => {
    expect(validateReason("error")).not.toBeNull();
    expect(validateReason("Error de digitación en la nota")).toBeNull();
    expect(requiresCorrection("grade", { exists: true })).toBe(true);
    expect(requiresCorrection("lesson", { signed: false })).toBe(false);
  });
});

describe("permisos del libro de clases", () => {
  const scope = { subjectIds: ["mat-7a"], headOfCourseIds: ["7a"] };
  it("el docente escribe solo en sus asignaturas", () => {
    expect(can(["teacher"], "grade.write", scope, { subjectId: "mat-7a" })).toBe(true);
    expect(can(["teacher"], "grade.write", scope, { subjectId: "len-7a" })).toBe(false);
  });
  it("el profesor jefe corrige en su curso, aunque no dicte la asignatura", () => {
    expect(can(["teacher", "head_teacher"], "record.correct", scope, { subjectId: "len-7a", courseId: "7a" })).toBe(true);
    expect(can(["teacher"], "record.correct", scope, { subjectId: "len-7a", courseId: "7a" })).toBe(false);
  });
  it("inspectoría registra anotaciones; dirección lee pero no escribe notas", () => {
    expect(can(["inspector"], "conduct.write", { subjectIds: [], headOfCourseIds: [] }, { courseId: "7a" })).toBe(true);
    expect(can(["director"], "course.read", { subjectIds: [], headOfCourseIds: [] }, { courseId: "7a" })).toBe(true);
    expect(can(["director"], "grade.write", { subjectIds: [], headOfCourseIds: [] }, { subjectId: "mat-7a" })).toBe(false);
  });
  it("apoderados y estudiantes no acceden al libro del curso", () => {
    const none = { subjectIds: [], headOfCourseIds: [] };
    expect(can(["guardian_academic"], "course.read", none, { courseId: "7a" })).toBe(false);
    expect(can(["student"], "course.read", none, { courseId: "7a" })).toBe(false);
  });
});
