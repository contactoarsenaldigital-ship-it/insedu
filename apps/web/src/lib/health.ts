import "server-only";
import { mulberry32 } from "@insedu/domain";
import { school } from "./demo";

/**
 * Ficha de salud (no confidencial: datos relevantes para la actividad escolar).
 * Lo confidencial (salud mental, revelaciones) va a la bóveda de Salvaguarda.
 */
export type HealthProfile = {
  studentId: string;
  allergies: string;
  restrictions: string;
  emergencyContact: string;
  heightCm?: number;
  weightKg?: number;
  updatedAt: string;
  updatedBy: string;
};

const g = globalThis as unknown as { __insedu_health?: Map<string, HealthProfile> };

function seeded(studentId: string): HealthProfile {
  const n = Number(studentId.replace(/\D/g, "")) || 1;
  const r = mulberry32(n * 7919);
  const allergies = ["Sin alergias conocidas", "Penicilina", "Frutos secos", "Sin alergias conocidas", "Polen (estacional)"];
  const restrictions = ["Sin restricciones", "Asma: inhalador en mochila", "Sin restricciones", "No realizar ejercicio intenso (certificado vigente)", "Sin restricciones"];
  const age = 10 + (n % 7);
  return {
    studentId,
    allergies: allergies[Math.floor(r() * allergies.length)]!,
    restrictions: restrictions[Math.floor(r() * restrictions.length)]!,
    emergencyContact: `Apoderado/a · +56 9 ${1000 + Math.floor(r() * 8999)} ${1000 + Math.floor(r() * 8999)} (ficticio)`,
    heightCm: Math.round(130 + (age - 10) * 6 + r() * 12),
    weightKg: Math.round(30 + (age - 10) * 5 + r() * 10),
    updatedAt: "2026-03-10T12:00:00.000Z",
    updatedBy: "nurse-1",
  };
}

export function profile(studentId: string): HealthProfile {
  const m = (g.__insedu_health ??= new Map());
  if (!m.has(studentId)) m.set(studentId, seeded(studentId));
  return m.get(studentId)!;
}

export function saveProfile(p: HealthProfile) {
  (g.__insedu_health ??= new Map()).set(p.studentId, p);
}

export function visitsOf(studentId: string) {
  return school()
    .health.filter((h) => h.studentId === studentId)
    .sort((a, b) => (b.at ?? b.date).localeCompare(a.at ?? a.date));
}

/** IMC solo para enfermería; nunca se muestra al estudiante ni se usa en desafíos. */
export function bmi(p: HealthProfile) {
  return p.heightCm && p.weightKg ? Math.round((p.weightKg / (p.heightCm / 100) ** 2) * 10) / 10 : null;
}
