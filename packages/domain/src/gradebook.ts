/**
 * Libro de clases digital: calificaciones, leccionario y correcciones.
 *
 * Reglas del registro oficial que este módulo implementa:
 * - Escala 1,0 a 7,0 con una décima; nota mínima de aprobación configurable (por defecto 4,0).
 * - Promedios aproximados a la décima: 0,05 o más sube (3,95 → 4,0), según la práctica
 *   habitual de los reglamentos de evaluación (Decreto 67/2018 delega la regla en cada colegio,
 *   por eso el modo de aproximación es configurable).
 * - Un registro firmado no se sobrescribe: toda modificación es una corrección con motivo,
 *   autor y fecha, y el valor anterior queda en el historial.
 */

export type RoundingMode = "half_up" | "truncate";

export type EvaluationPolicy = {
  min: number;
  max: number;
  passing: number;
  rounding: RoundingMode;
};

export const DEFAULT_POLICY: EvaluationPolicy = { min: 1.0, max: 7.0, passing: 4.0, rounding: "half_up" };

/** Aproxima a una décima evitando errores de coma flotante. */
export function roundTenth(x: number, mode: RoundingMode = "half_up"): number {
  const scaled = x * 10; // la tolerancia 1e-9 absorbe errores como 4.35 * 10 = 43.49999999999999
  return mode === "truncate" ? Math.floor(scaled + 1e-9) / 10 : Math.floor(scaled + 0.5 + 1e-9) / 10;
}

/** Interpreta notas escritas a la chilena: "5,5", "5.5", "55" (sin coma) → 5,5. */
export function parseGrade(input: string, p: EvaluationPolicy = DEFAULT_POLICY): number | null {
  const s = input.trim().replace(",", ".");
  if (!s) return null;
  let v: number;
  if (/^\d{2}$/.test(s)) v = Number(s) / 10; // "55" → 5,5 (ingreso rápido en teclado numérico)
  else if (/^\d(\.\d)?$/.test(s)) v = Number(s);
  else return null;
  return v >= p.min && v <= p.max ? v : null;
}

export const formatGrade = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1).replace(".", ","));

export type Evaluation = {
  id: string;
  subjectId: string;
  title: string;
  date: string;
  /** Ponderación relativa; si todas son iguales, el promedio es simple. */
  weight: number;
};

export type GradeEntry = { evaluationId: string; studentId: string; value: number };

/** Promedio ponderado de un estudiante en una asignatura. Ignora evaluaciones sin nota. */
export function weightedAverage(
  evaluations: Evaluation[],
  grades: GradeEntry[],
  studentId: string,
  p: EvaluationPolicy = DEFAULT_POLICY,
): number | null {
  let sum = 0;
  let weights = 0;
  for (const e of evaluations) {
    const g = grades.find((x) => x.evaluationId === e.id && x.studentId === studentId);
    if (!g) continue;
    sum += g.value * e.weight;
    weights += e.weight;
  }
  return weights === 0 ? null : roundTenth(sum / weights, p.rounding);
}

/** Promedio simple de promedios de asignatura (promedio general), aproximado a la décima. */
export function generalAverage(subjectAverages: (number | null)[], p: EvaluationPolicy = DEFAULT_POLICY) {
  const xs = subjectAverages.filter((x): x is number => x != null);
  return xs.length ? roundTenth(xs.reduce((a, b) => a + b, 0) / xs.length, p.rounding) : null;
}

export type EvaluationStats = { count: number; average: number | null; failing: number; failingShare: number };

export function evaluationStats(e: Evaluation, grades: GradeEntry[], p: EvaluationPolicy = DEFAULT_POLICY): EvaluationStats {
  const vs = grades.filter((g) => g.evaluationId === e.id).map((g) => g.value);
  const failing = vs.filter((v) => v < p.passing).length;
  return {
    count: vs.length,
    average: vs.length ? roundTenth(vs.reduce((a, b) => a + b, 0) / vs.length, p.rounding) : null,
    failing,
    failingShare: vs.length ? failing / vs.length : 0,
  };
}

// ───────────────────────────── Leccionario ─────────────────────────────

export type LessonStatus = "present" | "late" | "absent" | "justified";

export type Lesson = {
  id: string;
  subjectId: string;
  courseId: string;
  date: string;
  block: string; // "1-2"
  objective: string; // OA trabajado
  content: string; // actividad realizada
  teacherId: string;
  attendance: Record<string, LessonStatus>; // studentId → estado
  signedAt?: string;
};

export type LessonDraft = Pick<Lesson, "subjectId" | "courseId" | "date" | "block" | "objective" | "content">;

export function validateLesson(d: LessonDraft): string[] {
  const issues: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) issues.push("Fecha inválida");
  if (!d.block.trim()) issues.push("Indique el bloque horario");
  if (d.content.trim().length < 10) issues.push("Describa la actividad realizada (mínimo 10 caracteres)");
  if (d.content.length > 2000) issues.push("El registro de la actividad es demasiado extenso");
  return issues;
}

/** Al firmar se exige asistencia completa: cada estudiante del curso con un estado. */
export function canSign(lesson: Lesson, enrolledIds: string[]): string[] {
  const issues: string[] = [];
  if (lesson.signedAt) issues.push("La clase ya está firmada");
  const missing = enrolledIds.filter((id) => !lesson.attendance[id]);
  if (missing.length) issues.push(`Falta registrar asistencia de ${missing.length} estudiante(s)`);
  if (lesson.content.trim().length < 10) issues.push("Falta el registro de la actividad");
  return issues;
}

// ───────────────────────────── Correcciones ─────────────────────────────

export type CorrectionTarget = "grade" | "lesson_attendance" | "lesson_content" | "daily_attendance";

export type Correction = {
  id: string;
  target: CorrectionTarget;
  recordId: string; // id del registro corregido (p. ej. "evalId:studentId")
  studentId?: string;
  before: unknown;
  after: unknown;
  reason: string;
  by: string;
  at: string;
};

export const MIN_REASON = 10;

export function validateReason(reason: string): string | null {
  return reason.trim().length >= MIN_REASON ? null : `El motivo de la corrección debe tener al menos ${MIN_REASON} caracteres`;
}

/**
 * ¿Requiere corrección formal? Las notas se consideran registro oficial desde que se ingresan
 * y la clase desde que se firma. Antes de eso, el docente edita libremente su borrador.
 */
export function requiresCorrection(kind: "grade" | "lesson", opts: { exists?: boolean; signed?: boolean }): boolean {
  return kind === "grade" ? Boolean(opts.exists) : Boolean(opts.signed);
}
