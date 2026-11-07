import "server-only";
import {
  buildSubsidySheet, secondHourEnd, CORRECTION_KIND_LABEL, DAY_EVENT_LABEL, declarationDiff, formatRut, parseRut, subsidySnapshot,
  type CellValue, type Sheet, type SheetColumn, type SubsidyCell, type SubsidySheet, type SubsidyStudent,
} from "@insedu/domain";
import { courseById, fullName, school } from "./demo";
import { bells } from "./horario";
import { ensureEnrollments } from "./matricula";
import type { Session } from "./session";
import { findPerson, repo, subsidyState } from "./store";

/**
 * Control de subvenciones. Se calcula con lo ya registrado en el libro y la asistencia diaria: nadie
 * lo digita dos veces. Inspectoría y jefaturas consultan; dirección y administración corrigen y declaran.
 */
export const canManageSubsidy = (s: Session) => s.person.roles.some((r) => r === "director" || r === "school_admin");
export const canReadAllSubsidy = (s: Session) => canManageSubsidy(s) || s.person.roles.includes("inspector");
export const canReadSubsidy = (s: Session, courseId: string) => canReadAllSubsidy(s) || s.scope.headOfCourseIds.includes(courseId);

export const subsidyToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

export const isMonth = (m?: string): m is string => /^\d{4}-(0[1-9]|1[0-2])$/.test(m ?? "");

/** Meses con días hábiles o asistencia registrada, del más reciente al más antiguo. */
export function subsidyMonths(): string[] {
  const today = subsidyToday();
  const s = school();
  const dates = [...s.schoolDays, ...s.attendance.map((a) => a.date)].filter((d) => d <= today);
  return [...new Set(dates.map((d) => d.slice(0, 7)))].sort().reverse();
}

/** Días del mes: los hábiles del calendario más los que tengan registros (por ejemplo, una recuperación). */
export function daysOfMonth(month: string): string[] {
  const today = subsidyToday();
  const s = school();
  const lessons = repo.subjects().flatMap((x) => repo.lessonsOf(x.id).map((l) => l.date));
  const all = [...s.schoolDays, ...s.attendance.map((a) => a.date), ...lessons];
  return [...new Set(all.filter((d) => d.startsWith(month) && d <= today))].sort();
}

function studentsOfCourse(courseId: string): SubsidyStudent[] {
  const records = new Map(ensureEnrollments().map((r) => [r.id, r]));
  return school().students.filter((st) => st.courseId === courseId).map((st) => {
    const r = records.get(st.id);
    return { id: st.id, name: fullName(st), enrolledOn: r?.enrolledOn, withdrawnOn: st.withdrawnOn, surplus: r?.condition === "excedente", surplusUntil: r?.surplusUntil };
  });
}

export function courseSheet(courseId: string, month: string): SubsidySheet {
  const s = school();
  const students = studentsOfCourse(courseId);
  const ids = new Set(students.map((x) => x.id));
  const { corrections, events } = subsidyState();
  return buildSubsidySheet({
    days: daysOfMonth(month),
    students,
    daily: s.attendance.filter((a) => a.date.startsWith(month) && ids.has(a.studentId)),
    lessons: repo.subjects().filter((x) => x.courseId === courseId).flatMap((x) => repo.lessonsOf(x.id)).filter((l) => l.date.startsWith(month)),
    corrections: corrections.filter((c) => c.courseId === courseId && c.date.startsWith(month)),
    events: events.filter((e) => e.date.startsWith(month) && (!e.courseId || e.courseId === courseId)),
    courseStart: courseById(courseId)?.startTime ?? "08:00",
    secondHourEnd: bells().configured ? secondHourEnd(bells().bells) : undefined,
    timeZone: s.timeZone,
  });
}

export const latestDeclaration = (month: string) =>
  subsidyState().declarations.filter((d) => d.month === month).sort((a, b) => b.at.localeCompare(a.at))[0];

/** Días por curso que hoy difieren de lo declarado. Vacío si no hay declaración o si todo coincide. */
export function differencesFromDeclared(month: string): { courseId: string; days: string[] }[] {
  const declared = latestDeclaration(month);
  if (!declared) return [];
  return school().courses
    .map((c) => ({ courseId: c.id, days: declarationDiff(declared.snapshot[c.id], subsidySnapshot(courseSheet(c.id, month))) }))
    .filter((x) => x.days.length > 0);
}

const SYMBOL = (c: SubsidyCell) => {
  if (c.state === "out") return "";
  if (c.state === "suspended") return "S";
  if (c.state === "missing") return "?";
  return c.mark === "present" ? "•" : "x";
};

const CONDITION = (s: SubsidyStudent, month: string) => {
  if (s.withdrawnOn?.startsWith(month)) return `Baja ${s.withdrawnOn}`;
  if (s.enrolledOn?.startsWith(month)) return `Alta ${s.enrolledOn}`;
  if (s.surplus) return "Excedente";
  return "";
};

/** Figura 4 de la Circular: una columna por día, totales por estudiante y por día. */
export function monthlySheet(courseId: string, month: string): Sheet | null {
  const course = courseById(courseId);
  if (!course) return null;
  const sheet = courseSheet(courseId, month);
  const rut = new Map(school().students.map((st) => [st.id, st.rut]));
  const blank = (label: string, values: CellValue[], total: CellValue[] = [null, null]): CellValue[] => [null, null, label, null, ...values, ...total];
  const columns: SheetColumn[] = [
    { header: "N°", format: "integer", width: 5 }, { header: "RUN", width: 13 }, { header: "Estudiante", width: 30 }, { header: "Condición", width: 16 },
    ...sheet.days.map((d): SheetColumn => ({ header: d.date.slice(8, 10), width: 5 })),
    { header: "Asist.", format: "integer" }, { header: "Inasist.", format: "integer" },
  ];
  return {
    name: "Control de subvenciones",
    title: `Control mensual de asistencia · ${course.name} · ${month} (• presente, x ausente, S suspensión, ? sin dato)`,
    columns,
    rows: [
      ...sheet.rows.map((r) => [r.number, run(rut.get(r.student.id)), r.student.name, CONDITION(r.student, month), ...r.cells.map(SYMBOL), r.attended, r.absent]),
      blank("ASISTENTES", sheet.days.map((d) => (d.status === "suspended" ? "S" : d.attended)), [sheet.totals.attended, null]),
      blank("INASISTENTES", sheet.days.map((d) => (d.status === "suspended" ? "S" : d.absent)), [null, sheet.totals.absent]),
      blank("MATRÍCULA", sheet.days.map((d) => (d.status === "suspended" ? "S" : d.enrolled))),
    ],
  };
}

const run = (rut?: string) => (rut ? (parseRut(rut) ? formatRut(rut) : rut) : "");
const nameOf = (id: string) => findPerson(id)?.name ?? id;

/** Filas para cargar o cotejar con el SIGE. Sin suspensiones ni excedentes, y con las correcciones aplicadas. */
export function sigeCsv(month: string): string {
  const s = school();
  const rut = new Map(s.students.map((st) => [st.id, st.rut]));
  const lines = ["RBD;CURSO;RUN;DV;FECHA;ASISTENCIA"];
  for (const c of s.courses) {
    const days = courseSheet(c.id, month);
    for (const r of days.rows) {
      const parsed = parseRut(rut.get(r.student.id) ?? "");
      if (!parsed) continue;
      for (const cell of r.cells) {
        if (cell.counted && cell.mark) lines.push([s.rbd, c.name, parsed.body, parsed.dv, cell.date, cell.mark === "present" ? "P" : "A"].join(";"));
      }
    }
  }
  return lines.join("\r\n") + "\r\n";
}

/** Planillas para el respaldo del libro: totales por día, correcciones, eventos y declaraciones. */
export function subsidySheets(courseId?: string): Sheet[] {
  const s = school();
  const courses = s.courses.filter((c) => !courseId || c.id === courseId);
  const scope = courseId ? ` · ${courseById(courseId)?.name}` : "";
  const student = (id: string) => {
    const st = s.students.find((x) => x.id === id);
    return st ? fullName(st) : id;
  };
  const { corrections, events, declarations } = subsidyState();
  const months = [...subsidyMonths()].reverse();
  return [
    {
      name: "Subvenciones por día",
      title: `Control de subvenciones: totales por día${scope}`,
      columns: [{ header: "Curso", width: 14 }, { header: "Fecha", format: "date" }, { header: "Asistentes", format: "integer" }, { header: "Inasistentes", format: "integer" }, { header: "Matrícula", format: "integer" }, { header: "Estado", width: 16 }, { header: "Evento", width: 24 }],
      rows: courses.flatMap((c) => months.flatMap((m) => courseSheet(c.id, m).days.map((d) => [c.name, d.date, d.attended, d.absent, d.enrolled, DAY_STATUS[d.status], d.event ? DAY_EVENT_LABEL[d.event.kind] : ""]))),
    },
    {
      name: "Correcciones de subvenciones",
      title: `Correcciones al control de subvenciones${scope}`,
      columns: [{ header: "Registrada", width: 20 }, { header: "Curso", width: 14 }, { header: "Estudiante", width: 30 }, { header: "Fecha", format: "date" }, { header: "Queda" }, { header: "Tipo", width: 34 }, { header: "Motivo", width: 40 }, { header: "Justificativo", width: 28 }, { header: "Después de declarar" }, { header: "Responsable", width: 24 }],
      rows: corrections.filter((c) => !courseId || c.courseId === courseId).map((c) => [c.at, courseById(c.courseId)?.name ?? "", student(c.studentId), c.date, c.mark === "present" ? "Presente" : "Ausente", CORRECTION_KIND_LABEL[c.kind], c.reason, c.document ?? "", c.afterDeclaration ? "Sí" : "No", nameOf(c.by)]),
    },
    {
      name: "Suspensiones y cambios",
      title: `Suspensiones de clases y cambios de actividades${scope}`,
      columns: [{ header: "Fecha", format: "date" }, { header: "Alcance", width: 18 }, { header: "Tipo", width: 22 }, { header: "Motivo", width: 40 }, { header: "Autorización", width: 26 }, { header: "Recuperación", width: 24 }, { header: "Registró", width: 24 }],
      rows: events.filter((e) => !courseId || !e.courseId || e.courseId === courseId).map((e) => [e.date, e.courseId ? courseById(e.courseId)?.name ?? "" : "Todo el establecimiento", DAY_EVENT_LABEL[e.kind], e.reason, e.authorization, e.recovery ?? "", nameOf(e.by)]),
    },
    {
      name: "Declaraciones SIGE",
      title: "Declaraciones de asistencia registradas",
      columns: [{ header: "Mes" }, { header: "Declarada", format: "date" }, { header: "Certificado", width: 24 }, { header: "Rectificación", width: 40 }, { header: "Registró", width: 24 }, { header: "Registrada", width: 22 }],
      rows: declarations.map((d) => [d.month, d.declaredOn, d.certificate, d.reason ?? "", nameOf(d.by), d.at]),
    },
  ];
}

export const DAY_STATUS = { complete: "Completo", incomplete: "Incompleto", empty: "Sin asistencia", suspended: "Suspendido" } as const;
