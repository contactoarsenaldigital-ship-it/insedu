/**
 * Horario del establecimiento: horas de la jornada (timbres) y asignatura de cada curso por día y hora.
 *
 * Lo usan el libro (bloque de la clase y hora de la firma), el control de subvenciones (fin de la segunda
 * hora) y la exportación EDE (CourseSectionSchedule), cuyo validador comprueba que la firma de la asistencia
 * ocurra dentro del horario de la asignatura.
 */

export type Weekday = 1 | 2 | 3 | 4 | 5;
export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

/** Nombres como los compara el validador EDE (strftime('%w') → 'Lunes'…'Viernes', con tilde en Miércoles). */
export const WEEKDAY_LABEL: Record<Weekday, string> = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes" };

export type BellPeriod = { number: number; start: string; end: string };

export type ScheduleSlot = { id: string; courseId: string; subjectId: string; weekday: Weekday; period: number };

/** Jornada de ejemplo: horas de 45 minutos con recreos y almuerzo. */
export const DEFAULT_BELLS: BellPeriod[] = [
  { number: 1, start: "08:00", end: "08:45" },
  { number: 2, start: "08:45", end: "09:30" },
  { number: 3, start: "09:45", end: "10:30" },
  { number: 4, start: "10:30", end: "11:15" },
  { number: 5, start: "11:30", end: "12:15" },
  { number: 6, start: "12:15", end: "13:00" },
  { number: 7, start: "14:00", end: "14:45" },
  { number: 8, start: "14:45", end: "15:30" },
];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function bellIssues(bells: BellPeriod[]): string[] {
  const issues: string[] = [];
  if (!bells.length) issues.push("Indique al menos una hora de clases");
  const sorted = [...bells].sort((a, b) => a.number - b.number);
  sorted.forEach((b, i) => {
    if (!HHMM.test(b.start) || !HHMM.test(b.end)) issues.push(`Hora ${b.number}: use el formato 08:00`);
    else if (toMinutes(b.end) <= toMinutes(b.start)) issues.push(`Hora ${b.number}: el término debe ser posterior al inicio`);
    const prev = sorted[i - 1];
    if (prev && HHMM.test(prev.end) && HHMM.test(b.start) && toMinutes(b.start) < toMinutes(prev.end)) issues.push(`Hora ${b.number} comienza antes de que termine la hora ${prev.number}`);
  });
  return issues;
}

/** Conflictos de un horario de curso: un docente no puede estar en dos cursos a la misma hora. */
export function scheduleIssues(slots: Omit<ScheduleSlot, "id">[], ctx: { bells: BellPeriod[]; teacherOf: (subjectId: string) => string | undefined; others: ScheduleSlot[]; label: (subjectId: string) => string }): string[] {
  const issues: string[] = [];
  const periods = new Set(ctx.bells.map((b) => b.number));
  const seen = new Set<string>();
  for (const s of slots) {
    if (!WEEKDAYS.includes(s.weekday)) issues.push("Día inválido");
    if (!periods.has(s.period)) issues.push(`La hora ${s.period} no existe en la jornada`);
    const k = `${s.weekday}|${s.period}`;
    if (seen.has(k)) issues.push(`${WEEKDAY_LABEL[s.weekday]}, hora ${s.period}: dos asignaturas a la vez`);
    seen.add(k);
    const teacher = ctx.teacherOf(s.subjectId);
    const clash = teacher && ctx.others.find((o) => o.courseId !== s.courseId && o.weekday === s.weekday && o.period === s.period && ctx.teacherOf(o.subjectId) === teacher);
    if (clash) issues.push(`${WEEKDAY_LABEL[s.weekday]}, hora ${s.period}: el docente de ${ctx.label(s.subjectId)} ya tiene clase en otro curso`);
  }
  return [...new Set(issues)];
}

/** Día de la semana (1 lunes … 7 domingo) de una fecha YYYY-MM-DD. */
export const weekdayOf = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};

/** Horas de la jornada de un bloque escrito como «1-2», «3» o «5-6». */
export function periodsOfBlock(block: string): number[] {
  const m = block.match(/^\s*(\d+)(?:\s*[-–]\s*(\d+))?/);
  if (!m) return [];
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  return to >= from && to - from < 12 ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : [];
}

/** Bloques de una asignatura en una fecha, uniendo horas consecutivas: «1-2», «5». */
export function blocksOn(slots: ScheduleSlot[], subjectId: string, date: string): string[] {
  const periods = slots.filter((s) => s.subjectId === subjectId && s.weekday === weekdayOf(date)).map((s) => s.period).sort((a, b) => a - b);
  const blocks: number[][] = [];
  for (const p of periods) {
    const last = blocks.at(-1);
    if (last && last.at(-1) === p - 1) last.push(p);
    else blocks.push([p]);
  }
  return blocks.map((b) => (b.length > 1 ? `${b[0]}-${b.at(-1)}` : String(b[0])));
}

/** Ventana de la firma: desde el inicio de la primera hora del bloque hasta el término de la última. */
export function blockWindow(bells: BellPeriod[], block: string): { start: string; end: string } | null {
  const ps = periodsOfBlock(block);
  const first = bells.find((b) => b.number === ps[0]);
  const last = bells.find((b) => b.number === ps.at(-1));
  return first && last ? { start: first.start, end: last.end } : null;
}

/** ¿La hora local HH:MM cae dentro del bloque programado? */
export function withinBlock(bells: BellPeriod[], block: string, time: string): boolean {
  const w = blockWindow(bells, block);
  return !!w && toMinutes(time) >= toMinutes(w.start) && toMinutes(time) <= toMinutes(w.end);
}

/** Término de la segunda hora, si la jornada está configurada. */
export const secondHourEnd = (bells: BellPeriod[]) => bells.find((b) => b.number === 2)?.end;

/** Horario de ejemplo: reparte las asignaturas en la semana, sin que un docente quede en dos cursos a la vez. */
export function exampleSchedule(courses: { id: string; subjects: { id: string; teacherId?: string }[] }[], bells: BellPeriod[], newId: () => string): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];
  const busy = new Set<string>();
  courses.forEach((c, ci) => {
    if (!c.subjects.length) return;
    for (const weekday of WEEKDAYS) {
      for (let i = 0; i < bells.length; i += 2) {
        const pair = bells.slice(i, i + 2).map((b) => b.number);
        // Rota la asignatura por curso, día y bloque, y salta si el docente ya está ocupado.
        for (let k = 0; k < c.subjects.length; k++) {
          const subject = c.subjects[(ci + weekday + i / 2 + k) % c.subjects.length]!;
          const keys = pair.map((p) => `${subject.teacherId ?? subject.id}|${weekday}|${p}`);
          if (subject.teacherId && keys.some((x) => busy.has(x))) continue;
          keys.forEach((x) => busy.add(x));
          for (const period of pair) slots.push({ id: newId(), courseId: c.id, subjectId: subject.id, weekday, period });
          break;
        }
      }
    }
  });
  return slots;
}
