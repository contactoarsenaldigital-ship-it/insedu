/**
 * Exportación de asistencia y calificaciones para carga en los sistemas del MINEDUC.
 *
 * El docente registra una sola vez en INSEDU; el encargado de informática descarga estos
 * archivos, revisa el informe de consistencia y los carga en la plataforma oficial.
 *
 * IMPORTANTE: los formatos oficiales de carga deben confirmarse con el encargado de
 * informática del colegio piloto. Por eso el exportador funciona con PLANTILLAS
 * configurables (columnas, separador, codificación de valores) y no con un formato fijo.
 */
import { formatRut, parseRut } from "./rut";
import type { AttendanceRecord, AttendanceStatus, GradeRecord, Student } from "./types";

export type ColumnSpec<Row> = { header: string; value: (row: Row) => string | number };

export type ExportTemplate<Row> = {
  id: string;
  description: string;
  separator: "," | ";" | "\t";
  columns: ColumnSpec<Row>[];
};

export type AttendanceRow = { student: Student; record: AttendanceRecord; rbd: string };
export type GradeRow = { student: Student; grade: GradeRecord; rbd: string };

const STATUS_CODE: Record<AttendanceStatus, string> = { present: "P", late: "P", absent: "A", justified: "A" };

/** Plantilla genérica de asistencia diaria (a ajustar al formato oficial vigente). */
export const ATTENDANCE_TEMPLATE: ExportTemplate<AttendanceRow> = {
  id: "asistencia-diaria-generica-v1",
  description: "Asistencia diaria por estudiante (P = asiste, A = no asiste)",
  separator: ";",
  columns: [
    { header: "RBD", value: (r) => r.rbd },
    { header: "RUN", value: (r) => parseRut(r.student.rut)!.body },
    { header: "DV", value: (r) => parseRut(r.student.rut)!.dv },
    { header: "FECHA", value: (r) => r.record.date },
    { header: "ASISTENCIA", value: (r) => STATUS_CODE[r.record.status] },
  ],
};

/** Plantilla genérica de calificaciones (a ajustar al formato oficial vigente). */
export const GRADES_TEMPLATE: ExportTemplate<GradeRow> = {
  id: "calificaciones-generica-v1",
  description: "Calificaciones por estudiante y asignatura, escala 1,0 a 7,0",
  separator: ";",
  columns: [
    { header: "RBD", value: (r) => r.rbd },
    { header: "RUN", value: (r) => parseRut(r.student.rut)!.body },
    { header: "DV", value: (r) => parseRut(r.student.rut)!.dv },
    { header: "ASIGNATURA", value: (r) => r.grade.subject },
    { header: "FECHA", value: (r) => r.grade.date },
    { header: "NOTA", value: (r) => r.grade.value.toFixed(1).replace(".", ",") },
  ],
};

function escapeCell(v: string | number, sep: string): string {
  const s = String(v);
  return s.includes(sep) || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toDelimited<Row>(tpl: ExportTemplate<Row>, rows: Row[]): string {
  const head = tpl.columns.map((c) => c.header).join(tpl.separator);
  const body = rows.map((r) => tpl.columns.map((c) => escapeCell(c.value(r), tpl.separator)).join(tpl.separator));
  return [head, ...body].join("\r\n") + "\r\n";
}

export type ConsistencyIssue = { severity: "error" | "aviso"; message: string };

/** Informe de consistencia antes de cargar: el encargado lo revisa y corrige en INSEDU. */
export function checkAttendance(rows: AttendanceRow[], schoolDays: string[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const seen = new Set<string>();
  const byStudent = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!parseRut(r.student.rut)) {
      issues.push({ severity: "error", message: `RUT inválido para ${r.student.lastName}, ${r.student.firstName}` });
    }
    const key = `${r.student.id}|${r.record.date}`;
    if (seen.has(key)) {
      issues.push({ severity: "error", message: `Registro duplicado: ${formatSafe(r.student.rut)} el ${r.record.date}` });
    }
    seen.add(key);
    if (!byStudent.has(r.student.id)) byStudent.set(r.student.id, new Set());
    byStudent.get(r.student.id)!.add(r.record.date);
  }
  for (const [studentId, days] of byStudent) {
    const missing = schoolDays.filter((d) => !days.has(d));
    if (missing.length > 0) {
      issues.push({
        severity: "aviso",
        message: `Estudiante ${studentId}: ${missing.length} día(s) sin registro (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""})`,
      });
    }
  }
  return issues;
}

function formatSafe(rut: string) {
  try {
    return formatRut(rut);
  } catch {
    return rut;
  }
}

export function checkGrades(rows: GradeRow[]): ConsistencyIssue[] {
  return rows
    .filter((r) => !(r.grade.value >= 1 && r.grade.value <= 7))
    .map((r) => ({
      severity: "error" as const,
      message: `Nota fuera de escala (${r.grade.value}) en ${r.grade.subject} para ${formatSafe(r.student.rut)}`,
    }));
}
