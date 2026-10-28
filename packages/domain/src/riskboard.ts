/**
 * Tablero de indicadores para el Encargado de Salvaguarda.
 *
 * Reúne, por estudiante y por periodo de dos semanas, los indicadores académicos, de conducta,
 * de asistencia y de salud (incluido el estado nutricional según IMC para la edad), detecta
 * combinaciones que requieren atención y sugiere acciones.
 *
 * Principios: las alertas apoyan el criterio profesional, no diagnostican ni sancionan; cada
 * factor se explica con su valor y su umbral; los datos de salud solo los ve quien ejerce hoy
 * como Encargado de Salvaguarda.
 */
import { attendanceRate } from "./attendance";
import type { AttendanceRecord, ConductRecord, GradeRecord, HealthVisit } from "./types";

// ───────────────────────── Periodos ─────────────────────────

export type Period = { index: number; from: string; to: string; label: string };

const dm = (d: string) => d.slice(5).split("-").reverse().join("-");

/** Divide los días hábiles en periodos de `size` días (10 = dos semanas). */
export function periodsOf(schoolDays: string[], size = 10): Period[] {
  const out: Period[] = [];
  for (let i = 0; i < schoolDays.length; i += size) {
    const chunk = schoolDays.slice(i, i + size);
    out.push({ index: out.length, from: chunk[0]!, to: chunk.at(-1)!, label: `${dm(chunk[0]!)} a ${dm(chunk.at(-1)!)}` });
  }
  return out;
}

/** Periodo al que pertenece una fecha; lo posterior al último periodo cuenta en el último. */
export function periodIndex(periods: Period[], date: string): number {
  for (let i = periods.length - 1; i >= 0; i--) if (date >= periods[i]!.from) return i;
  return -1;
}

// ───────────────────────── Estado nutricional ─────────────────────────

export type Sex = "F" | "M";
export type NutritionStatus = "bajo_peso" | "normal" | "sobrepeso" | "obesidad";

export const NUTRITION_LABEL: Record<NutritionStatus, string> = {
  bajo_peso: "Bajo peso",
  normal: "Normal",
  sobrepeso: "Sobrepeso",
  obesidad: "Obesidad",
};

/**
 * Puntos de corte de IMC para la edad (IOTF, Cole et al. 2000): equivalentes a IMC 25 (sobrepeso)
 * y 30 (obesidad) del adulto, cada medio año entre 6 y 18 años. Referencia internacional usada
 * en la maqueta; en el piloto se reemplaza por la norma técnica de MINSAL (OMS 2007).
 */
const IOTF: Record<Sex, [number, number, number][]> = {
  M: [
    [6, 17.55, 19.78], [6.5, 17.71, 20.23], [7, 17.92, 20.63], [7.5, 18.16, 21.09], [8, 18.44, 21.6], [8.5, 18.76, 22.17],
    [9, 19.1, 22.77], [9.5, 19.46, 23.39], [10, 19.84, 24.0], [10.5, 20.2, 24.57], [11, 20.55, 25.1], [11.5, 20.89, 25.58],
    [12, 21.22, 26.02], [12.5, 21.56, 26.43], [13, 21.91, 26.84], [13.5, 22.27, 27.25], [14, 22.62, 27.63], [14.5, 22.96, 27.98],
    [15, 23.29, 28.3], [15.5, 23.6, 28.6], [16, 23.9, 28.88], [16.5, 24.19, 29.14], [17, 24.46, 29.41], [17.5, 24.73, 29.7], [18, 25, 30],
  ],
  F: [
    [6, 17.34, 19.65], [6.5, 17.53, 20.08], [7, 17.75, 20.51], [7.5, 18.03, 21.01], [8, 18.35, 21.57], [8.5, 18.69, 22.18],
    [9, 19.07, 22.81], [9.5, 19.45, 23.46], [10, 19.86, 24.11], [10.5, 20.29, 24.77], [11, 20.74, 25.42], [11.5, 21.2, 26.05],
    [12, 21.68, 26.67], [12.5, 22.14, 27.24], [13, 22.58, 27.76], [13.5, 22.98, 28.2], [14, 23.34, 28.57], [14.5, 23.66, 28.87],
    [15, 23.94, 29.11], [15.5, 24.17, 29.29], [16, 24.37, 29.43], [16.5, 24.54, 29.56], [17, 24.7, 29.69], [17.5, 24.85, 29.84], [18, 25, 30],
  ],
};

/** Cortes de sobrepeso y obesidad para una edad (interpolación lineal entre medios años). */
export function bmiCutoffs(ageYears: number, sex: Sex): { overweight: number; obesity: number } {
  const t = IOTF[sex];
  const a = Math.min(18, Math.max(6, ageYears));
  const i = Math.max(0, t.findIndex(([age]) => age > a) - 1);
  const [a0, o0, b0] = t[i]!;
  const [a1, o1, b1] = t[Math.min(i + 1, t.length - 1)]!;
  const f = a1 === a0 ? 0 : (a - a0) / (a1 - a0);
  return { overweight: o0 + (o1 - o0) * f, obesity: b0 + (b1 - b0) * f };
}

/** Bajo peso se aproxima como menos del 75 % del corte de sobrepeso (cercano a la delgadez grado 1 de IOTF). */
export function nutritionStatus(bmi: number, ageYears: number, sex: Sex): NutritionStatus {
  const c = bmiCutoffs(ageYears, sex);
  if (bmi >= c.obesity) return "obesidad";
  if (bmi >= c.overweight) return "sobrepeso";
  if (bmi < c.overweight * 0.75) return "bajo_peso";
  return "normal";
}

/** Edad en años (con decimales) a una fecha dada. */
export function ageAt(birthDate: string, date: string): number {
  return (new Date(`${date}T12:00:00Z`).getTime() - new Date(`${birthDate}T12:00:00Z`).getTime()) / (365.25 * 864e5);
}

// ───────────────────────── Indicadores por periodo ─────────────────────────

export type PeriodIndicators = {
  average: number | null; // promedio de notas del periodo
  failingSubjects: number; // asignaturas con promedio bajo 4,0 en el periodo
  negatives: number; // anotaciones negativas
  serious: number; // de ellas, graves o gravísimas
  attendance: number | null; // proporción 0..1
  nurseVisits: number;
};

export type StudentRecords = {
  grades: GradeRecord[];
  conduct: ConductRecord[];
  attendance: AttendanceRecord[];
  health: HealthVisit[];
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function indicatorsByPeriod(periods: Period[], r: StudentRecords): PeriodIndicators[] {
  const inP = <T extends { date: string }>(xs: T[], i: number) => xs.filter((x) => periodIndex(periods, x.date) === i);
  return periods.map((_, i) => {
    const grades = inP(r.grades, i);
    const bySubject = new Map<string, number[]>();
    for (const g of grades) bySubject.set(g.subject, [...(bySubject.get(g.subject) ?? []), g.value]);
    const negatives = inP(r.conduct, i).filter((c) => c.kind === "negative");
    const att = inP(r.attendance, i);
    return {
      average: avg(grades.map((g) => g.value)),
      failingSubjects: [...bySubject.values()].filter((v) => avg(v)! < 4).length,
      negatives: negatives.length,
      serious: negatives.filter((c) => c.severity === "grave" || c.severity === "gravisima").length,
      attendance: att.length ? attendanceRate(att.map((a) => a.status)) : null,
      nurseVisits: inP(r.health, i).length,
    };
  });
}

// ───────────────────────── Factores y patrones ─────────────────────────

export type Factor = "academico" | "conducta" | "asistencia" | "salud" | "nutricion";

export const FACTOR_LABEL: Record<Factor, string> = {
  academico: "Rendimiento",
  conducta: "Conducta",
  asistencia: "Asistencia",
  salud: "Salud",
  nutricion: "IMC alto",
};

/** Umbrales del «último mes» (dos periodos). Configurables por el establecimiento. */
export const RISK_RULES = {
  minAverage: 4.0,
  maxFailingSubjects: 1, // más de una asignatura bajo 4,0
  maxNegatives: 2, // tres o más anotaciones negativas
  minAttendance: 0.85, // requisito de promoción
  maxNurseVisits: 2, // tres o más atenciones de enfermería
};

export type FactorDetail = { factor: Factor; reason: string };

const dec = (x: number) => x.toFixed(1).replace(".", ",");
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Factores presentes en un conjunto de periodos (sumados). La nutrición se evalúa aparte. */
export function factorsIn(ps: PeriodIndicators[], rules = RISK_RULES): FactorDetail[] {
  const out: FactorDetail[] = [];
  const grades = ps.filter((p) => p.average != null);
  const average = avg(grades.map((p) => p.average!));
  const failing = Math.max(0, ...ps.map((p) => p.failingSubjects));
  if ((average != null && average < rules.minAverage) || failing > rules.maxFailingSubjects) {
    out.push({ factor: "academico", reason: average != null && average < rules.minAverage ? `Promedio ${dec(average)} (umbral ${dec(rules.minAverage)})` : `${failing} asignaturas bajo 4,0` });
  }
  const negatives = ps.reduce((a, p) => a + p.negatives, 0);
  const serious = ps.reduce((a, p) => a + p.serious, 0);
  if (negatives > rules.maxNegatives || serious > 0) {
    out.push({ factor: "conducta", reason: `${negatives} anotación(es) negativa(s)${serious ? `, ${serious} grave(s)` : ""}` });
  }
  const att = ps.filter((p) => p.attendance != null);
  const rate = avg(att.map((p) => p.attendance!));
  if (rate != null && rate < rules.minAttendance) out.push({ factor: "asistencia", reason: `Asistencia ${pct(rate)} (mínimo ${pct(rules.minAttendance)})` });
  const visits = ps.reduce((a, p) => a + p.nurseVisits, 0);
  if (visits > rules.maxNurseVisits) out.push({ factor: "salud", reason: `${visits} atenciones de enfermería` });
  return out;
}

export type Pattern = "riesgo_integral" | "conducta_rendimiento";
export type Priority = "alta" | "media" | "seguimiento";
export type Trend = "empeora" | "estable" | "mejora";

export const PATTERN_LABEL: Record<Pattern, string> = {
  riesgo_integral: "Riesgo integral: rendimiento, conducta y salud",
  conducta_rendimiento: "Conducta reiterada y bajo rendimiento",
};

export type Nutrition = { bmi: number; status: NutritionStatus; ageYears: number };

export type StudentRisk = {
  perPeriod: Factor[][]; // factores de cada periodo (para el histograma)
  current: FactorDetail[]; // último mes + estado nutricional
  repeatedConduct: boolean;
  pattern: Pattern | null;
  priority: Priority | null;
  trend: Trend;
  actions: string[];
};

/**
 * Evalúa a un estudiante. «Último mes» = los dos últimos periodos. La conducta es reiterada si hay
 * anotaciones negativas en al menos dos de los tres últimos periodos.
 */
export function evaluateRisk(ps: PeriodIndicators[], nutrition?: Nutrition, rules = RISK_RULES): StudentRisk {
  const withNutrition = (fs: FactorDetail[]) =>
    nutrition?.status === "obesidad" ? [...fs, { factor: "nutricion" as const, reason: `IMC ${dec(nutrition.bmi)}: obesidad según IMC para la edad` }] : fs;
  // Por periodo se usan umbrales proporcionales a dos semanas (la mitad de los del mes).
  const half = { ...rules, maxNegatives: Math.floor(rules.maxNegatives / 2), maxNurseVisits: Math.floor(rules.maxNurseVisits / 2) };
  const perPeriod = ps.map((p) => withNutrition(factorsIn([p], half)).map((f) => f.factor));
  const current = withNutrition(factorsIn(ps.slice(-2), rules));
  const has = (f: Factor) => current.some((c) => c.factor === f);
  const repeatedConduct = ps.slice(-3).filter((p) => p.negatives > 0).length >= 2;

  let pattern: Pattern | null = null;
  if (has("academico") && has("conducta") && (has("salud") || has("nutricion"))) pattern = "riesgo_integral";
  else if (has("academico") && (has("conducta") || repeatedConduct) && ps.slice(-2).some((p) => p.negatives > 0)) pattern = "conducta_rendimiento";

  const n = current.length;
  const priority: Priority | null = pattern || n >= 3 ? "alta" : n === 2 ? "media" : n === 1 ? "seguimiento" : null;

  const recent = perPeriod.at(-1)?.length ?? 0;
  const before = avg(perPeriod.slice(0, -1).map((f) => f.length)) ?? recent;
  const trend: Trend = recent > before + 0.5 ? "empeora" : recent < before - 0.5 ? "mejora" : "estable";

  return { perPeriod, current, repeatedConduct, pattern, priority, trend, actions: recommend(current.map((c) => c.factor), pattern) };
}

/** Acciones sugeridas: orientan, no reemplazan el criterio del equipo ni los protocolos del Reglamento Interno. */
export function recommend(factors: Factor[], pattern: Pattern | null): string[] {
  const out: string[] = [];
  const has = (f: Factor) => factors.includes(f);
  if (pattern === "riesgo_integral") {
    out.push(
      "Revisar el caso a la brevedad con el equipo de apoyo: profesor jefe, orientación, psicología y enfermería.",
      "Entrevistar al estudiante y a su apoderado para conocer su situación y acordar un plan de acompañamiento con plazos.",
      "Plan de apoyo académico con los docentes de las asignaturas descendidas.",
    );
  }
  if (pattern === "conducta_rendimiento") {
    out.push(
      "Analizar el caso en Salvaguarda y convocar a los especialistas necesarios: convivencia escolar, psicología, orientación y, si corresponde, trabajo social.",
      "Citar al apoderado y acordar medidas formativas y de apoyo académico, con seguimiento quincenal.",
    );
  }
  if (pattern) {
    out.push(
      "Si surgen indicios de vulneración de derechos, activar el protocolo y derivar a la Oficina Local de la Niñez (u OPD, según la comuna) o al Tribunal de Familia; si los hechos pueden constituir delito, denunciar dentro de 24 horas (Fiscalía, Carabineros o PDI).",
    );
  }
  if (has("nutricion")) out.push("Enfermería: derivar a evaluación en el centro de salud del estudiante (CESFAM) y orientar sobre alimentación y actividad física. El IMC no se comenta frente al curso.");
  if (has("salud") && !pattern) out.push("Enfermería revisa las atenciones repetidas y evalúa derivación a su centro de salud.");
  if (has("asistencia")) out.push("Contactar al apoderado por las inasistencias y revisar sus causas.");
  if (!pattern && has("academico") && has("conducta")) out.push("Coordinar con el profesor jefe e inspectoría un plan conjunto de apoyo académico y de convivencia.");
  else if (!pattern && has("academico")) out.push("Plan de reforzamiento con los docentes de asignatura.");
  else if (!pattern && has("conducta")) out.push("Profesor jefe e inspectoría acuerdan medidas formativas y conversan con el apoderado.");
  if (factors.length === 1 && !pattern) out.push("Seguimiento del profesor jefe; volver a revisar en el próximo periodo.");
  return out;
}

/** Distribución de estudiantes por número de factores en cada periodo (histograma). */
export function histogram(perPeriod: Factor[][][], periods: Period[]) {
  return periods.map((p, i) => {
    const counts = { uno: 0, dos: 0, tresOMas: 0 };
    for (const student of perPeriod) {
      const n = student[i]?.length ?? 0;
      if (n === 1) counts.uno++;
      else if (n === 2) counts.dos++;
      else if (n >= 3) counts.tresOMas++;
    }
    return { period: p, ...counts };
  });
}
