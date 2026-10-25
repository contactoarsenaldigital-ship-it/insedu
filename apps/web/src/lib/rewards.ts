import "server-only";
import {
  balance,
  canRedeem,
  currentStreak,
  earned,
  gradeImprovement,
  levelOf,
  recognize,
  rewardRef,
  uuidv7,
  type CourseGoal,
  type LedgerEntry,
  type Recognition,
  type Redemption,
  type Reward,
} from "@insedu/domain";
import { school } from "./demo";

/**
 * Motor de refuerzos de la Etapa 1 (en memoria). El libro de puntos se construye desde los
 * registros del colegio ficticio y crece con cada escaneo a tiempo, anotación positiva y felicitación.
 */
type State = { ledger: LedgerEntry[]; rewards: Reward[]; redemptions: Redemption[]; goals: CourseGoal[] };
const g = globalThis as unknown as { __insedu_rewards?: State };

function at(date: string, hhmm = "11:00") {
  return new Date(`${date}T${hhmm}:00Z`).toISOString();
}

export function initRewards(): State {
  const s = school();
  const ledger: LedgerEntry[] = [];
  const push = (studentId: string, when: string, rec: Recognition | null, source: string, ref?: string) => {
    if (rec) ledger.push({ id: uuidv7(), studentId, at: when, kind: "earn", points: rec.points, source, message: rec.message, badge: rec.badge, ref });
  };

  // Asistencia: llegada a tiempo (refuerzo continuo) e hitos de constancia (refuerzo por hitos).
  const byStudent = new Map<string, typeof s.attendance>();
  for (const a of s.attendance) byStudent.set(a.studentId, [...(byStudent.get(a.studentId) ?? []), a]);
  for (const [sid, recs] of byStudent) {
    const sorted = [...recs].sort((a, b) => a.date.localeCompare(b.date));
    const statuses: (typeof sorted)[number]["status"][] = [];
    for (const r of sorted) {
      statuses.push(r.status);
      if (r.status === "present") push(sid, r.arrivedAt ?? at(r.date), recognize({ type: "arrived_on_time", date: r.date }), "asistencia", rewardRef.onTime(r.date));
      const streak = currentStreak(statuses);
      push(sid, at(r.date, "11:05"), recognize({ type: "attendance_streak", days: streak, date: r.date }), "asistencia", rewardRef.streak(r.date));
    }
  }
  // Anotaciones positivas y felicitaciones.
  for (const c of s.conduct) push(c.studentId, at(c.date, "15:00"), recognize({ type: "conduct", kind: c.kind, date: c.date }), "anotación");

  // Mejora de notas: cada nota frente al promedio anterior del estudiante en la asignatura.
  const bySubject = new Map<string, typeof s.grades>();
  for (const gr of s.grades) bySubject.set(`${gr.studentId}|${gr.subject}`, [...(bySubject.get(`${gr.studentId}|${gr.subject}`) ?? []), gr]);
  for (const grades of bySubject.values()) {
    const sorted = [...grades].sort((a, b) => a.date.localeCompare(b.date));
    sorted.forEach((gr, i) => {
      const delta = gradeImprovement(sorted.slice(0, i).map((x) => x.value), gr.value);
      if (delta) push(gr.studentId, at(gr.date, "16:00"), recognize({ type: "grade_improved", subject: gr.subject, delta, date: gr.date }), "notas", rewardRef.grade(gr.id.split("::")[0]!));
    });
  }

  const rewards: Reward[] = [
    { id: "rw-musica", name: "Elegir la música del recreo", description: "Un día a elección, coordinado con inspectoría.", cost: 30, stock: null, active: true },
    { id: "rw-biblioteca", name: "Pase preferente de biblioteca", description: "Reserva prioritaria de libros y computadores por una semana.", cost: 25, stock: null, active: true },
    { id: "rw-ayudante", name: "Ayudante del docente por un día", description: "Apoyar al docente en la preparación de una clase.", cost: 40, stock: null, active: true },
    { id: "rw-taller", name: "Cupo en taller extraprogramático", description: "Inscripción en robótica, teatro o deportes.", cost: 80, stock: 10, active: true },
    { id: "rw-c1-asiento", name: "Elegir puesto en la sala por una semana", description: "Recompensa del curso 5° Básico A.", cost: 35, stock: null, active: true, courseId: "course-1" },
  ];

  const last = s.schoolDays.slice(-5);
  const goals: CourseGoal[] = [
    {
      id: "goal-c1",
      courseId: "course-1",
      title: "Semana con asistencia sobre 95 %",
      metric: "asistencia",
      target: 0.95,
      from: last[0]!,
      to: last.at(-1)!,
      reward: "Recreo extendido de 15 minutos el viernes",
      createdBy: "teacher-1",
    },
  ];

  // Una solicitud pendiente en 5° Básico A para que el profesor jefe tenga qué revisar.
  const redemptions: Redemption[] = [];
  const st = s.students.find((x) => x.courseId === "course-1" && x.id !== "student-001" && balance(ledger, x.id) >= 30);
  if (st) {
    const r: Redemption = { id: uuidv7(), studentId: st.id, rewardId: "rw-musica", cost: 30, at: new Date().toISOString(), status: "pendiente" };
    redemptions.push(r);
    ledger.push({ id: uuidv7(), studentId: st.id, at: r.at, kind: "reserve", points: -30, source: "canje", message: "Puntos reservados para canje", ref: r.id });
  }
  return { ledger, rewards, redemptions, goals };
}

export const rewardsState = (): State => (g.__insedu_rewards ??= initRewards());

/** Refuerzo inmediato: se llama al registrar la conducta (escaneo a tiempo, anotación positiva…). */
export function award(studentId: string, rec: Recognition | null, source: string, ref?: string) {
  if (!rec) return null;
  const e: LedgerEntry = { id: uuidv7(), studentId, at: new Date().toISOString(), kind: "earn", points: rec.points, source, message: rec.message, badge: rec.badge, ref };
  rewardsState().ledger.push(e);
  return e;
}

/** Como award, pero una sola vez por clave (ver rewardRef): no duplica si el hecho llega por dos vías. */
export function awardOnce(studentId: string, rec: Recognition | null, source: string, ref: string) {
  if (rewardsState().ledger.some((e) => e.studentId === studentId && e.kind === "earn" && e.ref === ref)) return null;
  return award(studentId, rec, source, ref);
}

/** Llegada a tiempo registrada en el libro: solo cuenta el primer bloque, donde se toma la asistencia de llegada. */
export function awardLessonArrival(studentId: string, date: string, block: string, status: string) {
  if (block === "1-2" && status === "present") awardOnce(studentId, recognize({ type: "arrived_on_time", date }), "asistencia", rewardRef.onTime(date));
}

/** Llegada a tiempo y, si corresponde, hito de constancia según la asistencia diaria registrada. */
export function awardDailyAttendance(studentId: string, date: string) {
  const recs = school().attendance.filter((a) => a.studentId === studentId && a.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  if (recs.some((a) => a.date === date && a.status === "present")) awardOnce(studentId, recognize({ type: "arrived_on_time", date }), "asistencia", rewardRef.onTime(date));
  const streak = currentStreak(recs.map((a) => a.status));
  awardOnce(studentId, recognize({ type: "attendance_streak", days: streak, date }), "asistencia", rewardRef.streak(date));
}

export function summary(studentId: string) {
  const { ledger, redemptions } = rewardsState();
  const mine = ledger.filter((e) => e.studentId === studentId);
  const total = earned(ledger, studentId);
  return {
    earned: total,
    balance: balance(ledger, studentId),
    level: levelOf(total),
    badges: [...new Set(mine.filter((e) => e.badge).map((e) => e.badge!))],
    recent: mine.filter((e) => e.kind === "earn").sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8),
    redemptions: redemptions.filter((r) => r.studentId === studentId).sort((a, b) => b.at.localeCompare(a.at)),
  };
}

export function rewardsFor(courseId: string) {
  return rewardsState().rewards.filter((r) => !r.courseId || r.courseId === courseId);
}

export function requestRedemption(studentId: string, courseId: string, rewardId: string): string[] | Redemption {
  const st = rewardsState();
  const reward = st.rewards.find((r) => r.id === rewardId);
  if (!reward) return ["Recompensa no encontrada"];
  const issues = canRedeem(studentId, reward, st.ledger, st.redemptions, new Date(), courseId);
  if (issues.length) return issues;
  const r: Redemption = { id: uuidv7(), studentId, rewardId, cost: reward.cost, at: new Date().toISOString(), status: "pendiente" };
  st.redemptions.push(r);
  st.ledger.push({ id: uuidv7(), studentId, at: r.at, kind: "reserve", points: -reward.cost, source: "canje", message: `Puntos reservados: ${reward.name}`, ref: r.id });
  return r;
}

export function decideRedemption(id: string, approve: boolean, by: string, note?: string) {
  const st = rewardsState();
  const r = st.redemptions.find((x) => x.id === id);
  if (!r || r.status !== "pendiente") return "La solicitud ya fue resuelta";
  const reward = st.rewards.find((x) => x.id === r.rewardId);
  if (approve && reward && reward.stock !== null) {
    if (reward.stock <= 0) return "No quedan unidades disponibles";
    reward.stock -= 1;
  }
  Object.assign(r, { status: approve ? "aprobado" : "rechazado", decidedBy: by, decidedAt: new Date().toISOString(), note });
  if (!approve) {
    st.ledger.push({ id: uuidv7(), studentId: r.studentId, at: new Date().toISOString(), kind: "refund", points: r.cost, source: "canje", message: "Puntos devueltos", ref: r.id });
  }
  return null;
}

export function markDelivered(id: string, by: string) {
  const r = rewardsState().redemptions.find((x) => x.id === id);
  if (r && r.status === "aprobado") Object.assign(r, { status: "entregado", decidedBy: by });
}
