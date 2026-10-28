import { describe, expect, it } from "vitest";
import {
  ageAt,
  bmiCutoffs,
  evaluateRisk,
  histogram,
  indicatorsByPeriod,
  nutritionStatus,
  periodIndex,
  periodsOf,
  type PeriodIndicators,
} from "../src/riskboard";
import { weekdays } from "../src/synthetic/generator";

const ok: PeriodIndicators = { average: 5.5, failingSubjects: 0, negatives: 0, serious: 0, attendance: 0.95, nurseVisits: 0 };
const p = (over: Partial<PeriodIndicators>): PeriodIndicators => ({ ...ok, ...over });

describe("tablero de Salvaguarda", () => {
  it("divide el periodo escolar en quincenas y ubica las fechas", () => {
    const periods = periodsOf(weekdays("2026-08-17", "2026-10-23"));
    expect(periods).toHaveLength(5);
    expect(periods[0]!.label).toBe("17-08 a 28-08");
    expect(periodIndex(periods, "2026-10-26")).toBe(4); // lo posterior cuenta en el último periodo
    expect(periodIndex(periods, "2026-08-01")).toBe(-1);
  });

  it("clasifica el IMC según edad y sexo, no con el corte del adulto", () => {
    expect(bmiCutoffs(10, "M")).toEqual({ overweight: 19.84, obesity: 24 });
    expect(bmiCutoffs(10.25, "F").obesity).toBeCloseTo(24.44, 2);
    expect(nutritionStatus(24.5, 10, "M")).toBe("obesidad"); // en un adulto, 24,5 sería normal
    expect(nutritionStatus(21, 10, "F")).toBe("sobrepeso");
    expect(nutritionStatus(17, 10, "F")).toBe("normal");
    expect(nutritionStatus(14, 15, "M")).toBe("bajo_peso");
    expect(Math.floor(ageAt("2014-03-15", "2026-10-28"))).toBe(12);
  });

  it("calcula indicadores por periodo desde los registros", () => {
    const periods = periodsOf(weekdays("2026-10-12", "2026-10-23"));
    const ind = indicatorsByPeriod(periods, {
      grades: [{ id: "1", studentId: "s", subject: "Matemática", date: "2026-10-13", value: 3.2 }, { id: "2", studentId: "s", subject: "Lenguaje", date: "2026-10-14", value: 3.6 }],
      conduct: [{ id: "c", studentId: "s", date: "2026-10-15", kind: "negative", severity: "grave", description: "x", recordedBy: "t" }],
      attendance: [{ id: "a", tenantId: "t", studentId: "s", date: "2026-10-13", status: "absent", source: "teacher", recordedBy: "t" }],
      health: [{ id: "h", studentId: "s", date: "2026-10-16", reason: "x", sentHome: false }],
    });
    expect(ind[0]!.average).toBeCloseTo(3.4, 5);
    expect(ind[0]).toMatchObject({ failingSubjects: 2, negatives: 1, serious: 1, attendance: 0, nurseVisits: 1 });
  });

  it("detecta el riesgo integral: rendimiento, conducta e IMC alto, y recomienda acciones", () => {
    const r = evaluateRisk([ok, ok, ok, p({ average: 3.7, negatives: 2 }), p({ average: 3.6, negatives: 2 })], { bmi: 27, status: "obesidad", ageYears: 12 });
    expect(r.current.map((c) => c.factor)).toEqual(["academico", "conducta", "nutricion"]);
    expect(r.pattern).toBe("riesgo_integral");
    expect(r.priority).toBe("alta");
    expect(r.trend).toBe("empeora");
    expect(r.actions.join(" ")).toContain("CESFAM");
    expect(r.actions.join(" ")).toContain("Oficina Local de la Niñez");
  });

  it("deriva a Salvaguarda la conducta reiterada con bajo rendimiento", () => {
    const r = evaluateRisk([ok, ok, p({ negatives: 1 }), p({ negatives: 1, average: 3.8 }), p({ negatives: 1, average: 3.7 })]);
    expect(r.repeatedConduct).toBe(true);
    expect(r.pattern).toBe("conducta_rendimiento");
    expect(r.actions[0]).toContain("convocar a los especialistas");
  });

  it("explica cada factor con su valor y umbral, y no alerta sin motivo", () => {
    const r = evaluateRisk([ok, ok, ok, p({ attendance: 0.8 }), p({ attendance: 0.78 })]);
    expect(r.current).toEqual([{ factor: "asistencia", reason: "Asistencia 79 % (mínimo 85 %)" }]);
    expect(r.priority).toBe("seguimiento");
    expect(evaluateRisk([ok, ok, ok, ok, ok]).priority).toBeNull();
    expect(evaluateRisk([ok, ok], { bmi: 21, status: "sobrepeso", ageYears: 10 }).current).toEqual([]); // sobrepeso: dato, no factor
  });

  it("arma el histograma de estudiantes por número de factores en cada periodo", () => {
    const periods = periodsOf(weekdays("2026-10-12", "2026-10-23"), 5);
    const h = histogram([[["academico"], []], [["academico", "conducta"], ["conducta"]], [[], ["academico", "conducta", "salud"]]], periods);
    expect(h.map(({ uno, dos, tresOMas }) => [uno, dos, tresOMas])).toEqual([[1, 1, 0], [1, 0, 1]]);
  });
});
