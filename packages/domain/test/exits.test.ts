import { describe, expect, it } from "vitest";
import { courseExitIssues, exitIssues, isSignatureImage, nextFolio, pickupIssues, returnIssues, type ExitDraft } from "../src/exits";

const today = "2026-11-06";
const png = "data:image/png;base64,AAAA";
const draft = (extra: Partial<ExitDraft> = {}): ExitDraft => ({ date: today, exitTime: "11:30", pickupName: "Ana Rojas", pickupAuthId: "a1", signature: png, reason: "Control médico", ...extra });
const ctx = { today, authorizedIds: ["a1"], hasOpenExit: false };

describe("retiros", () => {
  it("acepta un retiro de persona autorizada con firma", () => {
    expect(exitIssues(draft(), ctx)).toEqual([]);
  });

  it("exige los datos mínimos", () => {
    expect(exitIssues(draft({ date: "2027-01-01", exitTime: "25:00", pickupName: "Ana", reason: "" }), ctx)).toEqual([
      "La fecha no puede ser futura", "Indique la hora de salida", "Escriba el nombre y apellido de quien retira", "Indique el motivo de la salida",
    ]);
  });

  it("una persona no registrada debe identificarse y traer comunicación del apoderado", () => {
    expect(exitIssues(draft({ pickupAuthId: undefined }), ctx)).toEqual([
      "Una persona no registrada debe identificarse con su RUN",
      "Indique dónde consta la comunicación del apoderado que autoriza este retiro",
    ]);
    expect(exitIssues(draft({ pickupAuthId: undefined, pickupRut: "12.345.678-5", guardianNote: "Correo del apoderado de hoy" }), ctx)).toEqual([]);
  });

  it("rechaza a una persona cuya autorización fue revocada", () => {
    expect(exitIssues(draft({ pickupAuthId: "revocada" }), ctx)).toEqual(["Esa persona ya no está autorizada"]);
  });

  it("exige firma en pantalla o poder simple", () => {
    expect(exitIssues(draft({ signature: undefined }), ctx)).toEqual(["Falta la firma de quien retira, en pantalla o en un poder simple"]);
    expect(exitIssues(draft({ signature: undefined, paperEvidence: "Poder simple N° 8" }), ctx)).toEqual([]);
    expect(exitIssues(draft({ signature: "<svg onload=x>" }), ctx)).toEqual(["La firma no es válida. Vuelva a firmar"]);
    expect(isSignatureImage(png)).toBe(true);
  });

  it("no admite una segunda salida con otra abierta ni un regreso anterior", () => {
    expect(exitIssues(draft(), { ...ctx, hasOpenExit: true })).toEqual(["Este estudiante tiene una salida sin regreso registrado ese día"]);
    expect(returnIssues("11:30", "10:00")).toEqual(["La hora de regreso no puede ser anterior a la de salida"]);
    expect(returnIssues("11:30", "13:00")).toEqual([]);
  });

  it("el folio es correlativo por año", () => {
    const records = [{ date: "2026-03-01", folio: 7 }, { date: "2025-12-01", folio: 90 }];
    expect(nextFolio(records, "2026-11-06")).toBe(8);
    expect(nextFolio(records, "2027-03-01")).toBe(1);
  });
});

describe("autorizados y salidas de curso", () => {
  it("valida a la persona autorizada", () => {
    expect(pickupIssues({ name: "Ana Rojas", rut: "12.345.678-5", relation: "Tía" }, { existingRuts: [] })).toEqual([]);
    expect(pickupIssues({ name: "Ana Rojas", rut: "12.345.678-5", relation: "Tía" }, { existingRuts: ["123456785"] })).toEqual(["Esa persona ya está autorizada para este estudiante"]);
    expect(pickupIssues({ name: "Ana", rut: "1", relation: "", phone: "x" }, { existingRuts: [] })).toHaveLength(4);
  });

  it("registra cuántos salen y quién está a cargo", () => {
    const base = { date: today, exitTime: "09:00", studentsOut: 28, responsible: "Carolina Fuentes", destination: "Museo de Ciencias" };
    expect(courseExitIssues(base, { today, enrolled: 30 })).toEqual([]);
    expect(courseExitIssues({ ...base, studentsOut: 31, responsible: "" }, { today, enrolled: 30 })).toEqual(["Indique cuántos estudiantes salen (1 a 30)", "Indique quién está a cargo del curso"]);
  });
});
