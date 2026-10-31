import "server-only";
import { ageAt, bmiCutoffs, mulberry32, nutritionStatus, SCHOOL_LEVELS, type Nutrition, type Sex } from "@insedu/domain";
import { courseById, school, studentById } from "./demo";

/**
 * Ficha de salud (no confidencial: datos relevantes para la actividad escolar).
 * Lo confidencial (salud mental, revelaciones) va a la bóveda de Salvaguarda.
 */
export type HealthProfile = {
  studentId: string;
  allergies: string;
  restrictions: string;
  emergencyContact: string;
  /** Sexo registral y fecha de nacimiento: necesarios para evaluar el IMC según la edad. */
  sex?: Sex;
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
  updatedAt: string;
  updatedBy: string;
};

const g = globalThis as unknown as { __insedu_health?: Map<string, HealthProfile> };

/** Nombres femeninos del colegio ficticio (el generador usa una lista fija de nombres). */
const FEMALE = new Set(["Martina", "Sofía", "Florencia", "Isidora", "Antonella", "Agustina", "Emilia", "Josefa", "Catalina", "Trinidad", "Amanda", "Renata", "Valentina", "Fernanda", "Javiera"]);

function seeded(studentId: string): HealthProfile {
  const n = Number(studentId.replace(/\D/g, "")) || 1;
  const r = mulberry32(n * 7919);
  const allergies = ["Sin alergias conocidas", "Penicilina", "Frutos secos", "Sin alergias conocidas", "Polen (estacional)"];
  const restrictions = ["Sin restricciones", "Asma: inhalador en mochila", "Sin restricciones", "No realizar ejercicio intenso (certificado vigente)", "Sin restricciones"];
  const base = {
    studentId,
    allergies: allergies[Math.floor(r() * allergies.length)]!,
    restrictions: restrictions[Math.floor(r() * restrictions.length)]!,
    emergencyContact: `Apoderado/a · +56 9 ${1000 + Math.floor(r() * 8999)} ${1000 + Math.floor(r() * 8999)} (ficticio)`,
    updatedAt: "2026-03-10T12:00:00.000Z",
    updatedBy: "nurse-1",
  };
  return { ...base, ...anthropometry(studentId, n) };
}

/**
 * Sexo, nacimiento, talla y peso verosímiles: la edad sigue al curso (1° Básico ≈ 6 años) y el
 * estado nutricional se reparte en proporciones cercanas a las del sistema escolar chileno.
 */
function anthropometry(studentId: string, n: number): Pick<HealthProfile, "sex" | "birthDate" | "heightCm" | "weightKg"> {
  const r = mulberry32(n * 104729);
  const st = studentById(studentId);
  const sex: Sex = st && FEMALE.has(st.firstName) ? "F" : "M";
  const level = Math.max(0, SCHOOL_LEVELS.indexOf((courseById(st?.courseId ?? "")?.level ?? "5° Básico") as (typeof SCHOOL_LEVELS)[number]));
  const birthDate = `${2026 - (6 + level) - 1}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`;
  const age = ageAt(birthDate, "2026-03-10");
  const heightCm = Math.round(80 + 5.8 * age - (sex === "F" && age >= 13 ? 4 : 0) + (r() - 0.5) * 12);
  const { overweight, obesity } = bmiCutoffs(age, sex);
  // Solo datos de demostración: con promedio general bajo aumenta la probabilidad de IMC alto, para
  // que el tablero de Salvaguarda muestre el escenario de riesgo integral. No es una regla del sistema.
  const own = school().grades.filter((x) => x.studentId === studentId).map((x) => x.value);
  const lowGrades = own.length > 0 && own.reduce((a, b) => a + b, 0) / own.length < 4.6;
  const u = lowGrades ? 0.55 + r() * 0.45 * 0.9 : r();
  const k = r();
  const bmi = u < 0.04 ? overweight * (0.7 + k * 0.04) : u < 0.55 ? overweight * (0.8 + k * 0.17) : u < 0.8 ? overweight + k * (obesity - overweight - 0.3) : obesity + k * 3.5;
  return { sex, birthDate, heightCm, weightKg: Math.round(bmi * (heightCm / 100) ** 2 * 10) / 10 };
}

/** Solo el colegio ficticio («student-…») recibe datos de salud generados; los importados parten en blanco. */
const synthetic = (studentId: string) => studentId.startsWith("student-");

export function profile(studentId: string): HealthProfile {
  const m = (g.__insedu_health ??= new Map());
  if (!m.has(studentId)) {
    m.set(studentId, synthetic(studentId)
      ? seeded(studentId)
      : { studentId, allergies: "Sin información", restrictions: "Sin información", emergencyContact: "Sin información", updatedAt: new Date().toISOString(), updatedBy: "carga-inicial" });
  }
  const p = m.get(studentId)!;
  if (!synthetic(studentId)) return p;
  // Fichas guardadas antes de registrar sexo y nacimiento: se completan con los datos del colegio ficticio.
  if (!p.sex || !p.birthDate) Object.assign(p, { ...anthropometry(studentId, Number(studentId.replace(/\D/g, "")) || 1), heightCm: p.heightCm, weightKg: p.weightKg });
  return p;
}

/** Estado nutricional según IMC para la edad, a la fecha de hoy. */
export function nutritionOf(studentId: string, today = new Date().toISOString().slice(0, 10)): Nutrition | undefined {
  const p = profile(studentId);
  const imc = bmi(p);
  if (imc == null || !p.sex || !p.birthDate) return undefined;
  const ageYears = ageAt(p.birthDate, today);
  return { bmi: imc, status: nutritionStatus(imc, ageYears, p.sex), ageYears };
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
