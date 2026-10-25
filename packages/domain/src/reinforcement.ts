/**
 * Motor de refuerzo positivo y ranking de progreso.
 *
 * Fundamento:
 * - Condicionamiento operante (Skinner): una consecuencia agradable inmediata aumenta
 *   la probabilidad de que la conducta se repita. Cada evento reforzable genera un
 *   reconocimiento el mismo día, nombrando la conducta.
 * - Programas de refuerzo: continuo al instaurar un hábito y por hitos al mantenerlo.
 * - Moldeamiento: el ranking premia la mejora sobre la propia línea base, por lo que
 *   un estudiante con indicadores bajos puede liderar si mejora.
 * - Condicionamiento clásico (Pavlov): la llegada al colegio se asocia a un estímulo
 *   positivo inmediato (reconocimiento al escanear la credencial a tiempo).
 *
 * Reglas éticas del Plan Maestro: los puntos ganados nunca se quitan; no hay rachas
 * punitivas ni azar monetizado. Las anotaciones negativas se registran como indicador
 * y se trabajan con medidas formativas, pero no descuentan puntos de refuerzo.
 */
import type { AttendanceStatus, ConductKind } from "./types";

export type ReinforcementEvent =
  | { type: "arrived_on_time"; date: string }
  | { type: "attendance_streak"; days: number; date: string }
  | { type: "grade_improved"; subject: string; delta: number; date: string }
  | { type: "conduct"; kind: ConductKind; date: string }
  | { type: "task_delivered"; date: string }
  | { type: "health_habit"; habit: string; date: string };

export type Recognition = { points: number; message: string; badge?: string };

export type ReinforcementRules = {
  onTimePoints: number;
  /** Hitos de asistencia consecutiva que otorgan insignia (refuerzo por hitos). */
  streakMilestones: number[];
  streakPoints: number;
  gradeImprovementPerTenth: number;
  /** Tope de décimas reconocidas por una mejora (1,0 punto), para que un salto grande no domine el saldo. */
  gradeImprovementMaxTenths: number;
  positiveConductPoints: number;
  commendationPoints: number;
  taskPoints: number;
  healthHabitPoints: number;
};

export const DEFAULT_RULES: ReinforcementRules = {
  onTimePoints: 1,
  streakMilestones: [5, 10, 20, 40, 60],
  streakPoints: 10,
  gradeImprovementPerTenth: 1,
  gradeImprovementMaxTenths: 10,
  positiveConductPoints: 5,
  commendationPoints: 15,
  taskPoints: 2,
  healthHabitPoints: 2,
};

/** Traduce un evento en reconocimiento inmediato. Devuelve null si no corresponde refuerzo. */
export function recognize(ev: ReinforcementEvent, rules = DEFAULT_RULES): Recognition | null {
  switch (ev.type) {
    case "arrived_on_time":
      return { points: rules.onTimePoints, message: "Llegaste a tiempo hoy. ¡Bien hecho!" };
    case "attendance_streak":
      if (!rules.streakMilestones.includes(ev.days)) return null;
      return {
        points: rules.streakPoints,
        message: `${ev.days} días seguidos asistiendo. Tu constancia se nota.`,
        badge: `constancia-${ev.days}`,
      };
    case "grade_improved": {
      const tenths = Math.min(Math.round(ev.delta * 10), rules.gradeImprovementMaxTenths);
      if (tenths <= 0) return null;
      return {
        points: tenths * rules.gradeImprovementPerTenth,
        message: `Subiste ${ev.delta.toFixed(1).replace(".", ",")} puntos en ${ev.subject}.`,
      };
    }
    case "conduct":
      if (ev.kind === "positive")
        return { points: rules.positiveConductPoints, message: "Recibiste una anotación positiva." };
      if (ev.kind === "commendation")
        return {
          points: rules.commendationPoints,
          message: "Recibiste una felicitación.",
          badge: "felicitacion",
        };
      return null; // la anotación negativa no descuenta puntos
    case "task_delivered":
      return { points: rules.taskPoints, message: "Entregaste tu tarea a tiempo." };
    case "health_habit":
      return { points: rules.healthHabitPoints, message: `Cumpliste tu meta de ${ev.habit}.` };
  }
}

/** Días consecutivos asistiendo al final de la serie (para hitos de constancia). */
export function currentStreak(statuses: AttendanceStatus[]): number {
  let n = 0;
  for (let i = statuses.length - 1; i >= 0; i--) {
    const s = statuses[i];
    if (s === "present" || s === "late") n++;
    else break;
  }
  return n;
}

/**
 * Claves de idempotencia: el mismo hecho no da puntos dos veces, aunque llegue por dos vías
 * (escáner y libro de clases) o se vuelva a guardar.
 */
export const rewardRef = {
  onTime: (date: string) => `llegada:${date}`,
  streak: (date: string) => `racha:${date}`,
  grade: (evaluationId: string) => `nota:${evaluationId}`,
};

/**
 * Mejora de una nota nueva respecto del promedio anterior del estudiante en la asignatura,
 * en décimas (0,1). Null si no hay notas anteriores o si no mejoró.
 */
export function gradeImprovement(previous: number[], value: number): number | null {
  if (!previous.length) return null;
  const avg = previous.reduce((a, b) => a + b, 0) / previous.length;
  const delta = Math.round((value - avg) * 10) / 10;
  return delta > 0 ? delta : null;
}

export type PointRule = { conduct: string; points: string; how: string; active: boolean };

const list = (xs: number[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}` : String(xs[0] ?? ""));

/** Tabla «¿Cómo gano puntos?» que ven estudiantes, apoderados y docentes, derivada de las reglas vigentes. */
export function pointRules(rules = DEFAULT_RULES): PointRule[] {
  return [
    { conduct: "Llegar a tiempo", points: `${rules.onTimePoints} por día`, how: "Al escanear tu credencial a tiempo o cuando tu profesor te registra presente en la primera hora (bloque 1-2). Cuenta una vez al día.", active: true },
    { conduct: "Asistir días seguidos", points: `${rules.streakPoints} + insignia`, how: `Al completar ${list(rules.streakMilestones)} días seguidos asistiendo (los atrasos también cuentan).`, active: true },
    { conduct: "Anotación positiva", points: String(rules.positiveConductPoints), how: "Cuando un profesor o inspectoría registra una anotación positiva.", active: true },
    { conduct: "Felicitación", points: `${rules.commendationPoints} + insignia`, how: "Cuando recibes una felicitación en el libro de clases.", active: true },
    { conduct: "Subir tus notas", points: `${rules.gradeImprovementPerTenth} por décima (máx. ${rules.gradeImprovementMaxTenths * rules.gradeImprovementPerTenth})`, how: "Cuando una nota nueva supera tu promedio anterior en esa asignatura. Por ejemplo, de promedio 4,5 a un 5,0 son 5 puntos.", active: true },
    { conduct: "Entregar tareas a tiempo", points: String(rules.taskPoints), how: "Se activará cuando el colegio registre las tareas en INSEDU.", active: false },
    { conduct: "Cumplir una meta de salud", points: String(rules.healthHabitPoints), how: "Se activará con las metas de hábitos saludables.", active: false },
  ];
}

// ───────────────────────── Ranking de progreso ─────────────────────────

export type PeriodSnapshot = {
  attendanceRate: number; // 0..1
  gradeAverage: number | null; // 1.0..7.0
  positives: number; // anotaciones positivas + felicitaciones
  negatives: number;
};

export type ProgressInput = {
  studentId: string;
  baseline: PeriodSnapshot;
  current: PeriodSnapshot;
};

export type ProgressWeights = { attendance: number; grades: number; conduct: number };

export const DEFAULT_WEIGHTS: ProgressWeights = { attendance: 0.4, grades: 0.4, conduct: 0.2 };

export type ProgressScore = {
  studentId: string;
  score: number;
  components: { attendance: number; grades: number; conduct: number };
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Puntaje de progreso: compara al estudiante consigo mismo.
 * - Asistencia: puntos porcentuales ganados (máx. ±20 pp → ±1).
 * - Notas: décimas ganadas (máx. ±1,0 punto → ±1).
 * - Conducta: cambio del balance positivas − negativas (máx. ±5 → ±1).
 * Resultado en escala 0..100, donde 50 = sin cambio.
 */
export function progressScore(input: ProgressInput, w = DEFAULT_WEIGHTS): ProgressScore {
  const { baseline: b, current: c } = input;
  const attendance = clamp((c.attendanceRate - b.attendanceRate) / 0.2, -1, 1);
  const grades =
    b.gradeAverage == null || c.gradeAverage == null
      ? 0
      : clamp((c.gradeAverage - b.gradeAverage) / 1.0, -1, 1);
  const conduct = clamp((c.positives - c.negatives - (b.positives - b.negatives)) / 5, -1, 1);
  const raw = w.attendance * attendance + w.grades * grades + w.conduct * conduct;
  const total = w.attendance + w.grades + w.conduct;
  return {
    studentId: input.studentId,
    score: Math.round((50 + 50 * (raw / total)) * 10) / 10,
    components: { attendance, grades, conduct },
  };
}

/** Ranking del curso ordenado por mejora (no por nivel absoluto). */
export function progressRanking(inputs: ProgressInput[], w = DEFAULT_WEIGHTS) {
  return inputs
    .map((i) => progressScore(i, w))
    .sort((a, b) => b.score - a.score || a.studentId.localeCompare(b.studentId))
    .map((s, idx) => ({ ...s, position: idx + 1 }));
}
