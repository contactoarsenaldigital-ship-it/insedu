import "server-only";
import { courseReport, generateSchool, type SyntheticSchool } from "@insedu/domain";

/**
 * Fuente de datos de la Etapa 1: colegio sintético en memoria, determinista.
 * En E1-F1 se reemplaza por repositorios sobre Supabase con el mismo contrato.
 */
const g = globalThis as unknown as { __insedu_school?: SyntheticSchool };
export function school(): SyntheticSchool {
  // En globalThis: sobrevive recargas en desarrollo y mantiene lo registrado en el libro de clases.
  g.__insedu_school ??= generateSchool(2026);
  return g.__insedu_school;
}

export function studentById(id: string) {
  return school().students.find((s) => s.id === id);
}

export function courseById(id: string) {
  return school().courses.find((c) => c.id === id);
}

export function reportFor(courseId: string) {
  return courseReport(school(), courseId);
}

export const fullName = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`;
export const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")} %`;
export const dec = (x: number | null | undefined) => (x == null ? "—" : x.toFixed(1).replace(".", ","));
