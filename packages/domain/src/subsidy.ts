/**
 * Control mensual de asistencia o control de subvenciones (Circular de registros, 6.2.c).
 *
 * - Vale la asistencia de la segunda hora, que debe coincidir con el control de asignatura (c.2).
 * - Quien llega después de la segunda hora solo cuenta como presente con un justificativo (c.2).
 * - Un día sin asistencia registrada vale cero, salvo suspensión informada (c.2).
 * - Bajas y altas se reflejan con su fecha (c.3). Los excedentes no suman a los totales (c.4).
 * - Toda corrección identifica responsable, fecha, hora y motivo (c.5).
 *
 * Este módulo no calcula montos: la subvención depende de valores y reglas que no administra INSEDU.
 */
import { localTime } from "./attendance";
import type { LessonStatus } from "./gradebook";
import type { AttendanceStatus } from "./types";

export type SubsidyMark = "present" | "absent";

export type SubsidyCorrectionKind = "traspaso" | "ingreso_posterior";

export const CORRECTION_KIND_LABEL: Record<SubsidyCorrectionKind, string> = {
  traspaso: "Error de registro o traspaso",
  ingreso_posterior: "Ingreso posterior a la segunda hora, con justificativo",
};

export type SubsidyCorrection = {
  id: string;
  courseId: string;
  studentId: string;
  date: string;
  mark: SubsidyMark;
  kind: SubsidyCorrectionKind;
  reason: string;
  /** Dónde consta el justificativo. Se anota como referencia hasta tener carga de archivos. */
  document?: string;
  afterDeclaration: boolean;
  by: string;
  at: string;
};

export type DayEventKind = "suspension" | "cambio_actividad";

export const DAY_EVENT_LABEL: Record<DayEventKind, string> = {
  suspension: "Suspensión de clases",
  cambio_actividad: "Cambio de actividades",
};

/** Sin `courseId` afecta a todo el establecimiento. */
export type SchoolDayEvent = {
  id: string;
  date: string;
  courseId?: string;
  kind: DayEventKind;
  reason: string;
  authorization: string;
  /** Fecha o calendario de recuperación aprobado. */
  recovery?: string;
  /** Resolución que autoriza la suspensión y su respaldo escaneado (validación fn6E3 del EDE). */
  rexNumber?: string;
  rexDate?: string;
  rexScanned?: boolean;
  by: string;
  at: string;
};

export type DayTotals = { attended: number; absent: number; enrolled: number };

export type SubsidyDeclaration = {
  id: string;
  month: string;
  declaredOn: string;
  /** Folio del certificado de asistencia del SIGE, o dónde consta. */
  certificate: string;
  /** Motivo de la rectificación, cuando ya había una declaración del mes. */
  reason?: string;
  /** Curso → fecha → totales, tal como estaban al declarar. */
  snapshot: Record<string, Record<string, DayTotals>>;
  by: string;
  at: string;
};

export type SubsidyStudent = {
  id: string;
  name: string;
  enrolledOn?: string;
  withdrawnOn?: string;
  surplus: boolean;
  /** Desde esta fecha el excedente reemplaza a otro estudiante y genera subvención. */
  surplusUntil?: string;
};

export type SubsidyLesson = { date: string; block: string; attendance: Record<string, LessonStatus> };
export type SubsidyDaily = { studentId: string; date: string; status: AttendanceStatus; arrivedAt?: string };

export type SubsidyInput = {
  days: string[];
  students: SubsidyStudent[];
  daily: SubsidyDaily[];
  lessons: SubsidyLesson[];
  corrections: SubsidyCorrection[];
  events: SchoolDayEvent[];
  courseStart: string;
  /** Término de la segunda hora según la jornada configurada (HH:MM). Sin él: inicio más 90 minutos. */
  secondHourEnd?: string;
  timeZone: string;
};

export type SubsidyCell = {
  date: string;
  /** `out`: sin matrícula ese día. `suspended`: día suspendido. `missing`: falta el dato. */
  state: "marked" | "out" | "suspended" | "missing";
  mark?: SubsidyMark;
  corrected: boolean;
  /** La segunda hora y la asistencia diaria dicen cosas distintas y nadie lo ha resuelto. */
  discrepancy: boolean;
  /** Llegó después de la segunda hora y no hay justificativo: queda ausente. */
  lateEntry: boolean;
  counted: boolean;
};

export type SubsidyRow = { student: SubsidyStudent; number: number; cells: SubsidyCell[]; attended: number; absent: number };

export type SubsidyDay = DayTotals & {
  date: string;
  status: "complete" | "incomplete" | "empty" | "suspended";
  event?: SchoolDayEvent;
  /** Hay una clase que cubre la segunda hora en el control de asignatura. */
  hasSecondHour: boolean;
};

export type SubsidyIssue = { severity: "error" | "aviso"; message: string };

export type SubsidySheet = {
  rows: SubsidyRow[];
  days: SubsidyDay[];
  totals: DayTotals;
  /** Asistencia media del mes; null si no hay días con matrícula. */
  rate: number | null;
  issues: SubsidyIssue[];
};

/** La jornada del libro usa horas de 45 minutos: la segunda termina 90 minutos después del inicio. */
export const SECOND_HOUR_END_MINUTES = 90;

/** ¿El bloque de la clase incluye la segunda hora? "2", "1-2" y "2-3" sí; "3-4" no. */
export function coversSecondHour(block: string): boolean {
  const m = block.match(/^\s*(\d+)(?:\s*[-–]\s*(\d+))?/);
  if (!m) return false;
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  return from <= 2 && to >= 2;
}

export const isSurplusOn = (s: SubsidyStudent, date: string) => s.surplus || (!!s.surplusUntil && date < s.surplusUntil);

/** Fuera de la lista antes del alta y desde la fecha de la baja. */
const enrolledOn = (s: SubsidyStudent, date: string) => (!s.enrolledOn || date >= s.enrolledOn) && (!s.withdrawnOn || date < s.withdrawnOn);

/** Orden alfabético; quien entra después de comenzado el registro va al final de la lista (c.3). */
export function subsidyList(students: SubsidyStudent[], firstDay?: string): SubsidyStudent[] {
  const late = (s: SubsidyStudent) => !!firstDay && !!s.enrolledOn && s.enrolledOn > firstDay;
  return [...students].sort((a, b) => {
    if (late(a) !== late(b)) return late(a) ? 1 : -1;
    if (late(a)) return a.enrolledOn!.localeCompare(b.enrolledOn!) || a.name.localeCompare(b.name, "es");
    return a.name.localeCompare(b.name, "es");
  });
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function buildSubsidySheet(input: SubsidyInput): SubsidySheet {
  const { days } = input;
  const daily = new Map(input.daily.map((d) => [`${d.studentId}|${d.date}`, d]));
  const corrections = new Map<string, SubsidyCorrection>();
  for (const c of [...input.corrections].sort((a, b) => a.at.localeCompare(b.at))) corrections.set(`${c.studentId}|${c.date}`, c);
  const secondHour = new Map<string, SubsidyLesson[]>();
  for (const l of input.lessons) if (coversSecondHour(l.block)) secondHour.set(l.date, [...(secondHour.get(l.date) ?? []), l]);
  const eventOf = (date: string) => input.events.find((e) => e.date === date && e.kind === "suspension") ?? input.events.find((e) => e.date === date);

  const markFromDaily = (d?: SubsidyDaily): { mark?: SubsidyMark; lateEntry: boolean } => {
    if (!d) return { lateEntry: false };
    if (d.status === "absent" || d.status === "justified") return { mark: "absent", lateEntry: false };
    if (d.status === "late" && d.arrivedAt && toMinutes(localTime(d.arrivedAt, input.timeZone)) > (input.secondHourEnd ? toMinutes(input.secondHourEnd) : toMinutes(input.courseStart) + SECOND_HOUR_END_MINUTES)) return { mark: "absent", lateEntry: true };
    return { mark: "present", lateEntry: false };
  };

  const markFromLessons = (studentId: string, date: string): SubsidyMark | undefined => {
    const statuses = (secondHour.get(date) ?? []).map((l) => l.attendance[studentId]).filter((x): x is LessonStatus => !!x);
    if (!statuses.length) return undefined;
    return statuses.some((x) => x === "present" || x === "late") ? "present" : "absent";
  };

  const list = subsidyList(input.students, days[0]);
  const rows: SubsidyRow[] = list.map((student, i) => {
    let attended = 0;
    let absent = 0;
    const cells = days.map((date): SubsidyCell => {
      const base = { date, corrected: false, discrepancy: false, lateEntry: false, counted: false };
      if (!enrolledOn(student, date)) return { ...base, state: "out" };
      if (eventOf(date)?.kind === "suspension") return { ...base, state: "suspended" };
      const counted = !isSurplusOn(student, date);
      const correction = corrections.get(`${student.id}|${date}`);
      const fromLesson = markFromLessons(student.id, date);
      const fromDaily = markFromDaily(daily.get(`${student.id}|${date}`));
      const mark = correction?.mark ?? fromLesson ?? fromDaily.mark;
      if (mark === "present") attended++;
      if (mark === "absent") absent++;
      return {
        ...base,
        state: mark ? "marked" : "missing",
        mark,
        counted,
        corrected: !!correction,
        discrepancy: !correction && !!fromLesson && !!fromDaily.mark && fromLesson !== fromDaily.mark && !(fromLesson === "absent" && fromDaily.lateEntry),
        lateEntry: !correction && mark === "absent" && fromDaily.lateEntry,
      };
    });
    return { student, number: i + 1, cells, attended, absent };
  });

  const dayTotals = days.map((date, d): SubsidyDay => {
    const event = eventOf(date);
    const cells = rows.map((r) => r.cells[d]!).filter((c) => c.counted);
    const hasSecondHour = secondHour.has(date);
    if (event?.kind === "suspension") return { date, attended: 0, absent: 0, enrolled: 0, status: "suspended", event, hasSecondHour };
    const attended = cells.filter((c) => c.mark === "present").length;
    const absent = cells.filter((c) => c.mark === "absent").length;
    const allCells = rows.map((r) => r.cells[d]!).filter((c) => c.state === "marked" || c.state === "missing");
    const marked = allCells.filter((c) => c.state === "marked").length;
    const status = !allCells.length || marked === allCells.length ? "complete" : marked === 0 ? "empty" : "incomplete";
    return { date, attended, absent, enrolled: cells.length, status, event, hasSecondHour };
  });

  const counted = dayTotals.filter((d) => d.status !== "suspended");
  const totals = counted.reduce<DayTotals>((acc, d) => ({ attended: acc.attended + d.attended, absent: acc.absent + d.absent, enrolled: acc.enrolled + d.enrolled }), { attended: 0, absent: 0, enrolled: 0 });

  return { rows, days: dayTotals, totals, rate: totals.enrolled ? totals.attended / totals.enrolled : null, issues: subsidyIssues(rows, dayTotals) };
}

const dayOf = (date: string) => date.slice(8, 10);
const listDays = (dates: string[]) => dates.map(dayOf).join(", ");

function subsidyIssues(rows: SubsidyRow[], days: SubsidyDay[]): SubsidyIssue[] {
  const issues: SubsidyIssue[] = [];
  const empty = days.filter((d) => d.status === "empty").map((d) => d.date);
  if (empty.length) issues.push({ severity: "error", message: `Sin asistencia registrada, la asistencia del día vale cero: ${listDays(empty)}` });
  const incomplete = days.filter((d) => d.status === "incomplete").map((d) => d.date);
  if (incomplete.length) issues.push({ severity: "error", message: `Faltan estudiantes por registrar: ${listDays(incomplete)}` });
  const discrepant = [...new Set(rows.flatMap((r) => r.cells.filter((c) => c.discrepancy).map((c) => c.date)))].sort();
  if (discrepant.length) issues.push({ severity: "error", message: `La segunda hora no coincide con la asistencia diaria: ${listDays(discrepant)}` });
  const late = rows.flatMap((r) => r.cells.filter((c) => c.lateEntry));
  if (late.length) issues.push({ severity: "aviso", message: `${late.length} ingreso(s) después de la segunda hora quedan ausentes hasta registrar su justificativo` });
  const noLesson = days.filter((d) => d.status !== "suspended" && d.status !== "empty" && !d.hasSecondHour).length;
  if (noLesson) issues.push({ severity: "aviso", message: `${noLesson} día(s) sin clase de segunda hora en el control de asignatura: se usa la asistencia diaria` });
  return issues;
}

// ───────────────────────────── Validaciones ─────────────────────────────

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

export const MIN_SUBSIDY_REASON = 10;

export function correctionIssues(c: { date: string; mark: string; kind: string; reason: string; document?: string }, ctx: { today: string; days: string[]; enrolled: boolean }): string[] {
  const issues: string[] = [];
  if (!isDate(c.date) || c.date > ctx.today || !ctx.days.includes(c.date)) issues.push("Indique un día hábil del mes");
  else if (!ctx.enrolled) issues.push("El estudiante no tenía matrícula ese día");
  if (c.mark !== "present" && c.mark !== "absent") issues.push("Indique si estuvo presente o ausente");
  if (!(c.kind in CORRECTION_KIND_LABEL)) issues.push("Indique el tipo de corrección");
  if (c.reason.trim().length < MIN_SUBSIDY_REASON) issues.push(`Explique el motivo (mínimo ${MIN_SUBSIDY_REASON} caracteres)`);
  if (c.kind === "ingreso_posterior") {
    if (c.mark !== "present") issues.push("El justificativo sirve para registrar como presente");
    if ((c.document?.trim().length ?? 0) < 5) issues.push("Indique dónde consta el justificativo");
  }
  return issues;
}

export function dayEventIssues(e: { date: string; kind: string; reason: string; authorization: string }, ctx: { duplicate: boolean }): string[] {
  const issues: string[] = [];
  if (!isDate(e.date)) issues.push("Indique la fecha");
  if (!(e.kind in DAY_EVENT_LABEL)) issues.push("Indique el tipo");
  if (e.reason.trim().length < MIN_SUBSIDY_REASON) issues.push(`Explique el motivo (mínimo ${MIN_SUBSIDY_REASON} caracteres)`);
  if (e.authorization.trim().length < 5) issues.push("Indique dónde consta la autorización");
  if (ctx.duplicate) issues.push("Ese día ya tiene un evento registrado para el mismo alcance");
  return issues;
}

export function declarationIssues(d: { month: string; declaredOn: string; certificate: string; reason?: string }, ctx: { today: string; blocking: number; alreadyDeclared: boolean; changed: boolean }): string[] {
  const issues: string[] = [];
  if (!/^\d{4}-\d{2}$/.test(d.month)) issues.push("Mes inválido");
  else if (d.month >= ctx.today.slice(0, 7)) issues.push("El mes debe haber terminado para declararlo");
  if (!isDate(d.declaredOn) || d.declaredOn > ctx.today) issues.push("Indique la fecha de la declaración");
  if (d.certificate.trim().length < 3) issues.push("Indique el folio del certificado del SIGE o dónde consta");
  if (ctx.blocking) issues.push(`Hay ${ctx.blocking} problema(s) sin resolver en los cursos del mes`);
  if (ctx.alreadyDeclared) {
    if (!ctx.changed) issues.push("El mes ya está declarado y no ha cambiado");
    if ((d.reason?.trim().length ?? 0) < MIN_SUBSIDY_REASON) issues.push(`Explique el motivo de la rectificación (mínimo ${MIN_SUBSIDY_REASON} caracteres)`);
  }
  return issues;
}

/** Foto de los totales de un curso, para comparar más tarde con lo declarado. */
export function subsidySnapshot(sheet: SubsidySheet): Record<string, DayTotals> {
  return Object.fromEntries(sheet.days.filter((d) => d.status !== "suspended").map((d) => [d.date, { attended: d.attended, absent: d.absent, enrolled: d.enrolled }]));
}

/** Días cuyos totales actuales difieren de los declarados para un curso. */
export function declarationDiff(declared: Record<string, DayTotals> | undefined, current: Record<string, DayTotals>): string[] {
  const before = declared ?? {};
  const same = (a?: DayTotals, b?: DayTotals) => !!a && !!b && a.attended === b.attended && a.absent === b.absent && a.enrolled === b.enrolled;
  return [...new Set([...Object.keys(before), ...Object.keys(current)])].filter((d) => !same(before[d], current[d])).sort();
}

/** Firma de la asistencia diaria de un curso, con verificador (validación fn6F0 del EDE). */
export type DailySignature = { id: string; courseId: string; date: string; by: string; at: string; key: string };
