/**
 * Registro general de matrícula digital (Circular de registros, REX 30/2021 y REX 432/2023, numeral 5).
 * Es requisito previo del libro de clases digital. Las reglas que implementa este módulo:
 * - Correlativo por nivel y modalidad, desde 1; un número no se reutiliza aunque haya baja (5.1).
 * - Contenido mínimo (5.2) y bajas con fecha, motivo y constancia (5.4).
 * - Baja excepcional por ausencia de al menos 40 días hábiles: informe ratificado por dirección.
 * - La matrícula efectiva (total menos bajas) debe coincidir con los libros de clases.
 */
import type { Student } from "./types";

export type GuardianContact = { name: string; address: string; phone: string; email?: string };

export type EnrollmentCondition = "regular" | "excedente" | "intercambio" | "practica" | "migrante";

export const CONDITION_LABEL: Record<EnrollmentCondition, string> = {
  regular: "Regular",
  excedente: "Excedente",
  intercambio: "De intercambio",
  practica: "En práctica",
  migrante: "Migrante",
};

/** Estas condiciones se autorizan por resolución, cuyo número y fecha deben constar (5.5 y 5.6). */
export const NEEDS_RESOLUTION: EnrollmentCondition[] = ["excedente", "intercambio"];

export type WithdrawalReason = "retiro_voluntario" | "traslado" | "expulsion" | "cancelacion" | "no_renovacion" | "ausencia_prolongada";

export const WITHDRAWAL_LABEL: Record<WithdrawalReason, string> = {
  retiro_voluntario: "Retiro voluntario de padres o apoderados",
  traslado: "Traslado a otro establecimiento",
  expulsion: "Expulsión",
  cancelacion: "Cancelación de matrícula",
  no_renovacion: "No renovación del contrato educacional",
  ausencia_prolongada: "Ausencia prolongada sin paradero conocido (procedimiento excepcional)",
};

export type Withdrawal = {
  date: string;
  reason: WithdrawalReason;
  detail: string;
  /** Referencia a la firma o declaración del apoderado; en la vía excepcional, al informe ratificado. */
  evidence: string;
  by: string;
  at: string;
};

export type EnrollmentNote = { at: string; by: string; text: string };

export type EnrollmentRecord = {
  id: string; // id del estudiante
  number: number;
  level: string;
  modality: string;
  document: "RUN" | "IPE";
  sex?: "F" | "M";
  birthDate?: string;
  campus?: string;
  enrolledOn?: string;
  address?: string;
  guardians: GuardianContact[];
  condition: EnrollmentCondition;
  resolution?: string;
  withdrawal?: Withdrawal;
  notes: EnrollmentNote[];
};

export const REGULAR_MODALITY = "Regular";

/** Siguiente correlativo del nivel y modalidad; cuenta también a quienes tienen baja. */
export function nextEnrollmentNumber(records: EnrollmentRecord[], level: string, modality = REGULAR_MODALITY): number {
  return records.filter((r) => r.level === level && r.modality === modality).reduce((max, r) => Math.max(max, r.number), 0) + 1;
}

/** Datos mínimos que faltan en la ficha (5.2). */
export function missingEnrollmentData(r: EnrollmentRecord): string[] {
  const missing: string[] = [];
  if (!r.sex) missing.push("Sexo");
  if (!r.birthDate) missing.push("Fecha de nacimiento");
  if (!r.enrolledOn) missing.push("Fecha de matrícula");
  if (!r.address) missing.push("Domicilio");
  const g = r.guardians[0];
  if (!g?.name) missing.push("Apoderado");
  if (!g?.address) missing.push("Domicilio del apoderado");
  if (!g?.phone) missing.push("Teléfono del apoderado");
  if (NEEDS_RESOLUTION.includes(r.condition) && !r.resolution) missing.push("Resolución que autoriza la condición");
  return missing;
}

/** Problemas de una baja; lista vacía = se puede registrar. */
export function withdrawalIssues(w: { date: string; reason: string; detail: string; evidence: string }, ctx: { isDirector: boolean; attestedAbsence?: boolean; today: string }): string[] {
  const issues: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date)) issues.push("Indique la fecha de la baja");
  else if (w.date > ctx.today) issues.push("La fecha de la baja no puede ser futura");
  if (!(w.reason in WITHDRAWAL_LABEL)) issues.push("Indique el motivo de la baja");
  if (w.detail.trim().length < 10) issues.push("Describa el motivo (mínimo 10 caracteres)");
  if (w.reason === "ausencia_prolongada") {
    if (!ctx.isDirector) issues.push("La baja por ausencia prolongada debe registrarla dirección, que ratifica el informe");
    if (!ctx.attestedAbsence) issues.push("Confirme que se cumplió el procedimiento de al menos 40 días hábiles de ausencia");
    if (w.evidence.trim().length < 5) issues.push("Indique dónde consta el informe de las gestiones realizadas");
  } else if (w.evidence.trim().length < 5) {
    issues.push("Indique dónde consta la firma o declaración del apoderado");
  }
  return issues;
}

export type RegistrySummary = {
  total: number;
  withdrawn: number;
  effective: number;
  byLevel: { level: string; total: number; withdrawn: number; effective: number; enrolledInCourses: number }[];
  incomplete: number;
  /** Diferencias que impiden que el registro cuadre con los libros. Lista vacía = cuadra. */
  mismatches: string[];
};

/** Resumen y cuadratura del registro con la matrícula de los cursos. */
export function registrySummary(records: EnrollmentRecord[], students: Student[], levelOfCourse: (courseId: string) => string | undefined): RegistrySummary {
  const levels = [...new Set(records.map((r) => r.level))];
  const inCourses = students.filter((s) => !s.withdrawnOn);
  const byLevel = levels.map((level) => {
    const of = records.filter((r) => r.level === level);
    const withdrawn = of.filter((r) => r.withdrawal).length;
    return { level, total: of.length, withdrawn, effective: of.length - withdrawn, enrolledInCourses: inCourses.filter((s) => levelOfCourse(s.courseId) === level).length };
  });
  const mismatches: string[] = [];
  for (const l of byLevel) {
    if (l.effective !== l.enrolledInCourses) mismatches.push(`${l.level}: ${l.effective} en matrícula efectiva y ${l.enrolledInCourses} en los cursos`);
  }
  const ids = new Set(records.map((r) => r.id));
  const noRecord = students.filter((s) => !ids.has(s.id)).length;
  if (noRecord) mismatches.push(`${noRecord} estudiante(s) sin ficha de matrícula`);
  const seen = new Set<string>();
  for (const r of records) {
    const key = `${r.level}|${r.modality}|${r.number}`;
    if (seen.has(key)) mismatches.push(`Número ${r.number} repetido en ${r.level}`);
    seen.add(key);
  }
  const withdrawn = records.filter((r) => r.withdrawal).length;
  return {
    total: records.length,
    withdrawn,
    effective: records.length - withdrawn,
    byLevel,
    incomplete: records.filter((r) => !r.withdrawal && missingEnrollmentData(r).length > 0).length,
    mismatches,
  };
}
