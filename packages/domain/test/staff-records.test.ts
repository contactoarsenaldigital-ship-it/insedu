import { describe, expect, it } from "vitest";
import { capacityIssues, degreeIssues } from "../src/staff-records";

describe("datos del establecimiento para el EDE", () => {
  it("valida la capacidad autorizada", () => {
    expect(capacityIssues("35")).toBeNull();
    expect(capacityIssues("0")).toBe("La capacidad autorizada debe estar entre 1 y 60");
    expect(capacityIssues("3,5")).toBe("La capacidad debe ser un número entero");
  });

  it("valida el título de un docente", () => {
    const ctx = { today: "2026-11-07", staffIds: ["t1"] };
    expect(degreeIssues({ personId: "t1", title: "Profesora de Matemática", institution: "Universidad de Chile", awardDate: "2010-12-20" }, ctx)).toEqual([]);
    expect(degreeIssues({ personId: "x", title: "Prof", institution: "U", awardDate: "2030-01-01" }, ctx)).toEqual([
      "Seleccione a un docente o profesional", "Escriba el título o certificado (mínimo 5 caracteres)", "Escriba la institución que lo otorgó", "La fecha de titulación no es válida",
    ]);
  });
});
