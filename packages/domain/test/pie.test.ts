import { describe, expect, it } from "vitest";
import { pieCourseStatus, pieEntryIssues, pieSignIssues, sectionsOf, type PieDraft, type PieEntry } from "../src/pie";

const today = "2026-11-06";
const ctx = { today, nominated: ["e1", "e2"], team: ["p1", "p2"] };
const draft = (extra: Partial<PieDraft> = {}): PieDraft => ({ section: "estrategias", date: today, text: "Uso de material concreto en grupos", studentIds: [], participantIds: [], ...extra });
const entry = (extra: Partial<PieEntry> = {}): PieEntry => ({ id: "x", courseId: "c", createdBy: "p1", createdAt: today, signatures: [], ...draft(), ...extra });

describe("Libro PIE", () => {
  it("cubre cada parte del registro que enumera la Circular", () => {
    expect(sectionsOf("equipo")).toEqual(["coordinacion"]);
    expect(sectionsOf("planificacion")).toEqual(["estrategias", "colaborativo", "diversidad", "plan_individual", "familia_plan"]);
    expect(sectionsOf("implementacion")).toEqual(["evaluacion", "apoyo", "logros"]);
    expect(sectionsOf("familia")).toEqual(["familia", "comunidad", "actas"]);
  });

  it("valida fecha y texto", () => {
    expect(pieEntryIssues(draft(), ctx)).toEqual([]);
    expect(pieEntryIssues(draft({ date: "2027-01-01", text: "corto" }), ctx)).toEqual(["La fecha no puede ser futura", "Describa lo registrado (mínimo 10 caracteres)"]);
  });

  it("un apoyo exige estudiantes de la nómina, duración y lugar", () => {
    expect(pieEntryIssues(draft({ section: "apoyo" }), ctx)).toEqual([
      "Elija al menos un estudiante de la nómina",
      "Indique la duración del apoyo en minutos (5 a 480)",
      "Indique dónde se realizó el apoyo",
    ]);
    expect(pieEntryIssues(draft({ section: "apoyo", studentIds: ["e1"], minutes: 45, place: "aula_comun" }), ctx)).toEqual([]);
    expect(pieEntryIssues(draft({ section: "apoyo", studentIds: ["ajeno"], minutes: 45, place: "aula_comun" }), ctx)).toEqual(["Hay estudiantes que no están en la nómina PIE del curso"]);
  });

  it("reuniones y actas exigen participantes del equipo", () => {
    expect(pieEntryIssues(draft({ section: "actas" }), ctx)).toEqual(["Indique quiénes participaron"]);
    expect(pieEntryIssues(draft({ section: "coordinacion", participantIds: ["otro"] }), ctx)).toEqual(["Hay participantes que no son del equipo de aula"]);
  });

  it("firma solo el equipo y una vez por persona; admite codocencia", () => {
    const e = entry({ signatures: [{ by: "p1", at: today, method: "interno" }] });
    expect(pieSignIssues(e, "p2", ctx.team)).toEqual([]);
    expect(pieSignIssues(e, "p1", ctx.team)).toEqual(["Usted ya firmó este registro"]);
    expect(pieSignIssues(e, "ajeno", ctx.team)).toEqual(["Solo el equipo de aula del curso puede firmar este registro"]);
  });

  it("resume el estado del curso y las horas de apoyo de la semana", () => {
    const status = pieCourseStatus([
      entry({ section: "apoyo", date: "2026-11-05", minutes: 90, signatures: [{ by: "p1", at: today, method: "interno" }] }),
      entry({ section: "apoyo", date: "2026-10-01", minutes: 45 }),
      entry({ section: "estrategias" }),
    ], 3, 2, today);
    expect(status.weeklySupportHours).toBe(2);
    expect(status.unsigned).toBe(2);
    expect(status.entriesByGroup).toEqual({ equipo: 0, planificacion: 1, implementacion: 2, familia: 0 });
    expect(status.emptyGroups).toEqual(["familia"]);
  });
});
