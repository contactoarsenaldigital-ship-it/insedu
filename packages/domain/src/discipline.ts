/**
 * Medidas disciplinarias asociadas a una anotación negativa (Circular de registros, letra e: «medidas
 * disciplinarias que sean aplicadas al estudiante»), y firma de evaluaciones con el verificador.
 *
 * - La medida se registra después del hecho, cuando se resuelve según el reglamento interno; una anotación
 *   puede tener varias (por ejemplo, citación al apoderado y luego medida reparatoria).
 * - Cancelación de matrícula y expulsión las decide solo la dirección (Ley 20.845 y Aula Segura).
 * - La suspensión exige fechas. El reglamento interno de cada establecimiento fija su duración.
 */
import type { GradeEntry } from "./gradebook";

export type DisciplinaryMeasureType =
  | "dialogo_formativo" | "amonestacion_verbal" | "amonestacion_escrita" | "citacion_apoderado" | "medida_reparatoria"
  | "servicio_comunitario" | "suspension" | "condicionalidad" | "cancelacion_matricula" | "expulsion";

export const MEASURE_LABEL: Record<DisciplinaryMeasureType, string> = {
  dialogo_formativo: "Diálogo formativo",
  amonestacion_verbal: "Amonestación verbal",
  amonestacion_escrita: "Amonestación escrita",
  citacion_apoderado: "Citación al apoderado",
  medida_reparatoria: "Medida reparatoria",
  servicio_comunitario: "Servicio comunitario",
  suspension: "Suspensión de clases",
  condicionalidad: "Condicionalidad de matrícula",
  cancelacion_matricula: "Cancelación de matrícula",
  expulsion: "Expulsión",
};

/** Medidas que solo dirección puede aplicar. */
export const DIRECTOR_ONLY: DisciplinaryMeasureType[] = ["cancelacion_matricula", "expulsion"];

export type DisciplinaryMeasure = {
  id: string;
  type: DisciplinaryMeasureType;
  detail: string;
  from?: string;
  to?: string;
  by: string;
  at: string;
};

const isDate = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

export function measureIssues(
  m: { type: string; detail: string; from?: string; to?: string; article?: string },
  ctx: { kind: string; isDirector: boolean; incidentDate: string; today: string },
): string[] {
  const issues: string[] = [];
  if (ctx.kind !== "negative") issues.push("Las medidas disciplinarias se registran solo en anotaciones negativas");
  if (!(m.type in MEASURE_LABEL)) issues.push("Indique la medida");
  else if (DIRECTOR_ONLY.includes(m.type as DisciplinaryMeasureType) && !ctx.isDirector) issues.push("La cancelación de matrícula y la expulsión las aplica solo la dirección");
  if (m.detail.trim().length < 10) issues.push("Describa la medida y el procedimiento seguido (mínimo 10 caracteres)");
  if ((m.article?.trim().length ?? 0) < 3) issues.push("Indique el artículo del reglamento interno que se aplica");
  if (m.from && !isDate(m.from)) issues.push("Fecha de inicio inválida");
  if (m.from && m.from < ctx.incidentDate) issues.push("La medida no puede comenzar antes del hecho");
  if (m.type === "suspension") {
    if (!isDate(m.from) || !isDate(m.to)) issues.push("La suspensión requiere fecha de inicio y de término");
    else if (m.to! < m.from!) issues.push("La suspensión termina antes de comenzar");
  }
  else if (m.to && m.from && m.to < m.from) issues.push("La fecha de término es anterior a la de inicio");
  return [...new Set(issues)];
}

/** Días corridos de una medida con fechas, incluidos ambos extremos. */
export const measureDays = (m: { from?: string; to?: string }) =>
  m.from && m.to ? Math.round((Date.parse(m.to) - Date.parse(m.from)) / 86_400_000) + 1 : undefined;

/** Antes de firmar una evaluación: debe tener notas y no estar firmada. Avisa cuántos quedan sin nota. */
export function evaluationSignIssues(ev: { id: string; signature?: unknown }, grades: GradeEntry[], enrolledIds: string[]): { errors: string[]; missing: number } {
  const errors: string[] = [];
  if (ev.signature) errors.push("La evaluación ya está firmada");
  const graded = new Set(grades.filter((g) => g.evaluationId === ev.id).map((g) => g.studentId));
  if (!graded.size) errors.push("Ingrese las notas antes de firmar");
  return { errors, missing: enrolledIds.filter((id) => !graded.has(id)).length };
}
