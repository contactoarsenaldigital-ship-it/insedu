import { describe, expect, it } from "vitest";
import { missingEnrollmentData, nextEnrollmentNumber, registrySummary, withdrawalIssues, type EnrollmentRecord } from "../src/enrollment";
import type { Student } from "../src/types";

const rec = (id: string, number: number, extra: Partial<EnrollmentRecord> = {}): EnrollmentRecord => ({
  id, number, level: "7° Básico", modality: "Regular", document: "RUN", sex: "F", birthDate: "2013-05-14", enrolledOn: "2026-03-02", address: "Calle 1",
  guardians: [{ name: "Ana Soto", address: "Calle 1", phone: "+56912345678" }], condition: "regular", notes: [], ...extra,
});
const st = (id: string, extra: Partial<Student> = {}): Student => ({ id, tenantId: "t", rut: "1", firstName: "A", lastName: "B", courseId: "c7", ...extra });
const level = () => "7° Básico";
const today = "2026-11-06";

describe("registro de matrícula", () => {
  it("el correlativo es por nivel y no reutiliza números de bajas", () => {
    const records = [rec("a", 1), rec("b", 2, { withdrawal: { date: today, reason: "traslado", detail: "x", evidence: "y", by: "d", at: today } }), rec("c", 9, { level: "8° Básico" })];
    expect(nextEnrollmentNumber(records, "7° Básico")).toBe(3);
    expect(nextEnrollmentNumber(records, "1° Medio")).toBe(1);
  });

  it("informa los datos mínimos que faltan", () => {
    expect(missingEnrollmentData(rec("a", 1))).toEqual([]);
    const m = missingEnrollmentData(rec("a", 1, { sex: undefined, guardians: [], condition: "excedente" }));
    expect(m).toEqual(["Sexo", "Apoderado", "Domicilio del apoderado", "Teléfono del apoderado", "Resolución que autoriza la condición"]);
  });

  it("la matrícula efectiva cuadra con los cursos", () => {
    const w = { date: today, reason: "traslado" as const, detail: "x", evidence: "y", by: "d", at: today };
    const s = registrySummary([rec("a", 1), rec("b", 2, { withdrawal: w })], [st("a"), st("b", { withdrawnOn: today })], level);
    expect(s).toMatchObject({ total: 2, withdrawn: 1, effective: 1, incomplete: 0, mismatches: [] });
  });

  it("detecta descuadres, estudiantes sin ficha y números repetidos", () => {
    const s = registrySummary([rec("a", 1), rec("b", 1)], [st("a"), st("b"), st("c")], level);
    expect(s.mismatches).toEqual(["7° Básico: 2 en matrícula efectiva y 3 en los cursos", "1 estudiante(s) sin ficha de matrícula", "Número 1 repetido en 7° Básico"]);
  });
});

describe("bajas", () => {
  const base = { date: today, reason: "retiro_voluntario", detail: "Cambio de ciudad de la familia", evidence: "Declaración firmada N° 12" };
  const ctx = { isDirector: false, today };

  it("exige fecha no futura, motivo y constancia del apoderado", () => {
    expect(withdrawalIssues(base, ctx)).toEqual([]);
    expect(withdrawalIssues({ ...base, date: "2027-01-01" }, ctx)).toEqual(["La fecha de la baja no puede ser futura"]);
    expect(withdrawalIssues({ ...base, evidence: "" }, ctx)).toEqual(["Indique dónde consta la firma o declaración del apoderado"]);
  });

  it("la vía excepcional exige dirección, los 40 días e informe", () => {
    const w = { ...base, reason: "ausencia_prolongada", evidence: "" };
    expect(withdrawalIssues(w, ctx)).toHaveLength(3);
    expect(withdrawalIssues({ ...w, evidence: "Informe N° 3 ratificado" }, { isDirector: true, attestedAbsence: true, today })).toEqual([]);
  });
});
