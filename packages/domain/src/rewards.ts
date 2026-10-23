/**
 * Recompensas, niveles y metas cooperativas.
 *
 * Reglas (Plan Maestro 4.6 y fundamentos de la sección 5 del documento de propuesta):
 * - Los puntos se GANAN por conductas concretas y nunca se descuentan por mala conducta.
 * - El NIVEL depende del total ganado, no del saldo: canjear una recompensa no hace bajar de nivel.
 * - El canje lo valida un adulto (profesor jefe); al solicitarlo los puntos quedan reservados y,
 *   si se rechaza, se devuelven.
 * - Antifraude y control de duplicidad: no hay dos solicitudes pendientes de la misma recompensa
 *   y existe un límite de canjes por periodo.
 */

export type LedgerKind = "earn" | "reserve" | "refund";

export type LedgerEntry = {
  id: string;
  studentId: string;
  at: string; // ISO
  kind: LedgerKind;
  points: number; // positivo al ganar o devolver; negativo al reservar
  source: string; // "asistencia", "anotacion", "notas", "canje"...
  message: string;
  badge?: string;
  ref?: string; // id del canje o del registro que lo originó
};

export type Reward = {
  id: string;
  courseId?: string; // sin curso = todo el establecimiento
  name: string;
  description: string;
  cost: number;
  stock: number | null; // null = sin límite
  active: boolean;
};

export type RedemptionStatus = "pendiente" | "aprobado" | "rechazado" | "entregado";

export type Redemption = {
  id: string;
  studentId: string;
  rewardId: string;
  cost: number;
  at: string;
  status: RedemptionStatus;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
};

export const earned = (ledger: LedgerEntry[], studentId: string) =>
  ledger.filter((e) => e.studentId === studentId && e.kind === "earn").reduce((a, e) => a + e.points, 0);

export const balance = (ledger: LedgerEntry[], studentId: string) =>
  ledger.filter((e) => e.studentId === studentId).reduce((a, e) => a + e.points, 0);

export const LEVELS = [
  { min: 0, name: "Explorador" },
  { min: 40, name: "Constante" },
  { min: 100, name: "Perseverante" },
  { min: 200, name: "Líder" },
  { min: 350, name: "Referente" },
] as const;

export function levelOf(earnedPoints: number) {
  let idx = 0;
  LEVELS.forEach((l, i) => {
    if (earnedPoints >= l.min) idx = i;
  });
  const next = LEVELS[idx + 1];
  return {
    index: idx,
    name: LEVELS[idx]!.name,
    nextName: next?.name,
    toNext: next ? next.min - earnedPoints : 0,
    progress: next ? (earnedPoints - LEVELS[idx]!.min) / (next.min - LEVELS[idx]!.min) : 1,
  };
}

export const REDEMPTION_WINDOW_DAYS = 7;

/** Valida una solicitud de canje. Devuelve la lista de problemas (vacía = se puede). */
export function canRedeem(
  studentId: string,
  reward: Reward,
  ledger: LedgerEntry[],
  redemptions: Redemption[],
  now: Date,
  studentCourseId?: string,
): string[] {
  const issues: string[] = [];
  if (!reward.active) issues.push("La recompensa no está disponible");
  if (reward.courseId && reward.courseId !== studentCourseId) issues.push("La recompensa es de otro curso");
  if (reward.stock !== null && reward.stock <= 0) issues.push("No quedan unidades disponibles");
  const bal = balance(ledger, studentId);
  if (bal < reward.cost) issues.push(`Te faltan ${reward.cost - bal} puntos`);
  const mine = redemptions.filter((r) => r.studentId === studentId && r.rewardId === reward.id);
  if (mine.some((r) => r.status === "pendiente")) issues.push("Ya tienes una solicitud pendiente de esta recompensa");
  const since = now.getTime() - REDEMPTION_WINDOW_DAYS * 864e5;
  if (mine.some((r) => (r.status === "aprobado" || r.status === "entregado") && new Date(r.at).getTime() >= since)) {
    issues.push(`Puedes canjear esta recompensa una vez cada ${REDEMPTION_WINDOW_DAYS} días`);
  }
  return issues;
}

// ───────────────────────── Metas cooperativas de curso ─────────────────────────

export type GoalMetric = "asistencia" | "puntualidad" | "anotaciones_positivas";

export type CourseGoal = {
  id: string;
  courseId: string;
  title: string;
  metric: GoalMetric;
  /** asistencia/puntualidad: proporción 0..1; anotaciones_positivas: cantidad */
  target: number;
  from: string; // YYYY-MM-DD
  to: string;
  reward: string; // recompensa colectiva, p. ej. "Recreo extendido el viernes"
  createdBy: string;
};

export const METRIC_LABEL: Record<GoalMetric, string> = {
  asistencia: "Asistencia del curso",
  puntualidad: "Llegadas a tiempo",
  anotaciones_positivas: "Anotaciones positivas del curso",
};

export type GoalInputs = {
  attendance: { date: string; status: string }[]; // del curso
  positives: { date: string }[]; // anotaciones positivas y felicitaciones del curso
};

export function goalProgress(goal: CourseGoal, data: GoalInputs) {
  const inRange = (d: string) => d >= goal.from && d <= goal.to;
  let value = 0;
  if (goal.metric === "anotaciones_positivas") {
    value = data.positives.filter((p) => inRange(p.date)).length;
  } else {
    const att = data.attendance.filter((a) => inRange(a.date));
    if (goal.metric === "asistencia") {
      value = att.length ? att.filter((a) => a.status === "present" || a.status === "late").length / att.length : 0;
    } else {
      const came = att.filter((a) => a.status === "present" || a.status === "late");
      value = came.length ? came.filter((a) => a.status === "present").length / came.length : 0;
    }
  }
  return { value, achieved: value >= goal.target, ratio: Math.min(1, goal.target ? value / goal.target : 0) };
}

export function validateGoal(g: Omit<CourseGoal, "id" | "createdBy">): string[] {
  const issues: string[] = [];
  if (g.title.trim().length < 5) issues.push("Indique un nombre para la meta");
  if (g.reward.trim().length < 5) issues.push("Indique la recompensa colectiva");
  if (!(g.to >= g.from)) issues.push("El periodo es inválido");
  if (g.metric === "anotaciones_positivas" ? !(g.target >= 1 && g.target <= 500) : !(g.target > 0 && g.target <= 1)) {
    issues.push("La meta numérica no es válida");
  }
  return issues;
}
