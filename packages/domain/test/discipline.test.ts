import { describe, expect, it } from "vitest";
import { evaluationSignIssues, measureDays, measureIssues } from "../src/discipline";

const ctx = { kind: "negative", isDirector: false, incidentDate: "2026-10-05", today: "2026-11-07" };
const ok = { type: "citacion_apoderado", detail: "Se cita al apoderado para el 8 de octubre", article: "Art. 42" };

describe("medidas disciplinarias", () => {
  it("acepta una medida completa", () => {
    expect(measureIssues(ok, ctx)).toEqual([]);
  });

  it("exige artículo, detalle y anotación negativa", () => {
    expect(measureIssues({ type: "x", detail: "corto" }, { ...ctx, kind: "positive" })).toHaveLength(4);
  });

  it("reserva la expulsión a la dirección", () => {
    const m = { ...ok, type: "expulsion" };
    expect(measureIssues(m, ctx)).toEqual(["La cancelación de matrícula y la expulsión las aplica solo la dirección"]);
    expect(measureIssues(m, { ...ctx, isDirector: true })).toEqual([]);
  });

  it("exige fechas coherentes en la suspensión", () => {
    expect(measureIssues({ ...ok, type: "suspension" }, ctx)).toEqual(["La suspensión requiere fecha de inicio y de término"]);
    expect(measureIssues({ ...ok, type: "suspension", from: "2026-10-04", to: "2026-10-06" }, ctx)).toEqual(["La medida no puede comenzar antes del hecho"]);
    expect(measureIssues({ ...ok, type: "suspension", from: "2026-10-07", to: "2026-10-06" }, ctx)).toEqual(["La suspensión termina antes de comenzar"]);
    expect(measureDays({ from: "2026-10-06", to: "2026-10-08" })).toBe(3);
  });
});

describe("firma de evaluaciones", () => {
  it("exige notas y cuenta quiénes faltan", () => {
    const grades = [{ evaluationId: "e1", studentId: "a", value: 5 }];
    expect(evaluationSignIssues({ id: "e1" }, grades, ["a", "b"])).toEqual({ errors: [], missing: 1 });
    expect(evaluationSignIssues({ id: "e2" }, grades, ["a"]).errors).toEqual(["Ingrese las notas antes de firmar"]);
    expect(evaluationSignIssues({ id: "e1", signature: {} }, grades, ["a"]).errors).toEqual(["La evaluación ya está firmada"]);
  });
});
