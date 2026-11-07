import { describe, expect, it } from "vitest";
import {
  daysWaiting, deliveryIssues, institutionalIssues, missingInstitutional, nextRequestFolio, docRequestIssues, requestStatus,
  type DocumentRequest, type InstitutionalDoc,
} from "../src/deliveries";

const today = "2026-11-07";
const request = (extra: Partial<DocumentRequest> = {}): DocumentRequest => ({
  id: "r", folio: 1, studentId: "s", courseId: "c", requester: { kind: "apoderado", name: "Ana Rojas" }, requestedOn: "2026-11-02", documents: ["promocion"], by: "x", at: "t", ...extra,
});

describe("solicitudes", () => {
  it("valida lo mínimo", () => {
    expect(docRequestIssues({ requestedOn: "2026-11-02", documents: ["promocion"], requester: { name: "Ana Rojas" } }, today)).toEqual([]);
    expect(docRequestIssues({ requestedOn: "2026-12-01", documents: [], requester: { name: "Ana" } }, today)).toHaveLength(3);
    expect(docRequestIssues({ requestedOn: "2026-11-02", documents: ["otro"], requester: { name: "Ana Rojas" } }, today)).toEqual(["Describa el otro documento"]);
  });

  it("sigue el estado y los días de espera", () => {
    expect(requestStatus(request())).toBe("pendiente");
    expect(daysWaiting(request(), today)).toBe(5);
    const delivered = { on: today, medium: "electronico" as const, by: "x", at: "t" };
    expect(requestStatus(request({ delivery: delivered }))).toBe("por_confirmar");
    expect(requestStatus(request({ delivery: { ...delivered, confirmedAt: "t2" } }))).toBe("entregada");
    expect(requestStatus(request({ delivery: { ...delivered, medium: "papel" } }))).toBe("entregada");
    expect(requestStatus(request({ withdrawn: { reason: "x", by: "y", at: "z" } }))).toBe("desistida");
  });

  it("numera por año", () => {
    expect(nextRequestFolio([{ folio: 4, requestedOn: "2026-03-01" }, { folio: 9, requestedOn: "2025-12-01" }], today)).toBe(5);
    expect(nextRequestFolio([], "2027-03-01")).toBe(1);
  });
});

describe("entregas", () => {
  const ctx = { today, requestedOn: "2026-11-02", attachments: 0, open: true };
  it("en papel exige quien recibe y su firma", () => {
    expect(deliveryIssues({ on: today, medium: "papel", receivedBy: "Ana Rojas", signature: "data:image/png;base64,AA" }, ctx)).toEqual([]);
    expect(deliveryIssues({ on: today, medium: "papel", receivedBy: "Ana Rojas", paperEvidence: "Acta 12" }, ctx)).toEqual([]);
    expect(deliveryIssues({ on: today, medium: "papel", receivedBy: "Ana" }, ctx)).toHaveLength(2);
  });

  it("en forma electrónica exige los documentos adjuntos", () => {
    expect(deliveryIssues({ on: today, medium: "electronico" }, ctx)).toEqual(["Adjunte los documentos antes de entregarlos en forma electrónica"]);
    expect(deliveryIssues({ on: today, medium: "electronico" }, { ...ctx, attachments: 1 })).toEqual([]);
  });

  it("no acepta fechas imposibles ni solicitudes cerradas", () => {
    expect(deliveryIssues({ on: "2026-11-01", medium: "electronico" }, { ...ctx, attachments: 1, open: false })).toHaveLength(2);
  });
});

describe("instrumentos de interés general", () => {
  const doc = (kind: InstitutionalDoc["kind"], replacedAt?: string): InstitutionalDoc => ({ id: kind, kind, title: "x", version: "2026-03-01", replacedAt, by: "x", at: "t" });
  it("avisa cuáles faltan", () => {
    expect(missingInstitutional([doc("reglamento_interno"), doc("pei"), doc("pise", "t")])).toEqual(["evaluacion_promocion", "pise"]);
  });
  it("valida la dirección web", () => {
    expect(institutionalIssues({ kind: "pei", title: "PEI 2026", version: "2026-03-01", where: "https://colegio.cl/pei.pdf" }, today)).toEqual([]);
    expect(institutionalIssues({ kind: "pei", title: "PEI 2026", version: "2026-03-01", where: "http://colegio.cl" }, today)).toHaveLength(1);
    expect(institutionalIssues({ kind: "pei", title: "PEI", version: "2026-03-01", where: "Biblioteca, estante 2" }, today)).toEqual([]);
  });
});
