import { describe, expect, it } from "vitest";
import {
  buildSubsidySheet, correctionIssues, coversSecondHour, dayEventIssues, declarationDiff, declarationIssues, subsidyList, subsidySnapshot,
  type SubsidyCorrection, type SubsidyInput, type SubsidyStudent,
} from "../src/subsidy";

const D1 = "2026-10-05";
const D2 = "2026-10-06";
const st = (id: string, extra: Partial<SubsidyStudent> = {}): SubsidyStudent => ({ id, name: id, surplus: false, ...extra });
const input = (extra: Partial<SubsidyInput> = {}): SubsidyInput => ({
  days: [D1],
  students: [st("a"), st("b")],
  daily: [{ studentId: "a", date: D1, status: "present" }, { studentId: "b", date: D1, status: "absent" }],
  lessons: [],
  corrections: [],
  events: [],
  courseStart: "08:00",
  timeZone: "America/Santiago",
  ...extra,
});
const correction = (extra: Partial<SubsidyCorrection> = {}): SubsidyCorrection => ({ id: "c", courseId: "x", studentId: "b", date: D1, mark: "present", kind: "traspaso", reason: "Error de traspaso", afterDeclaration: false, by: "d", at: "2026-10-07T12:00:00Z", ...extra });

describe("segunda hora", () => {
  it("reconoce los bloques que la cubren", () => {
    expect(["2", "1-2", "2-3", "1 - 3"].every(coversSecondHour)).toBe(true);
    expect(["1", "3-4", "tarde", ""].some(coversSecondHour)).toBe(false);
  });

  it("prefiere la clase de segunda hora y exige que coincida con la diaria", () => {
    const s = buildSubsidySheet(input({ lessons: [{ date: D1, block: "1-2", attendance: { a: "present", b: "present" } }] }));
    expect(s.rows.find((r) => r.student.id === "b")!.cells[0]).toMatchObject({ mark: "present", discrepancy: true });
    expect(s.issues.filter((i) => i.severity === "error")).toHaveLength(1);
  });

  it("ignora las clases de otros bloques", () => {
    const s = buildSubsidySheet(input({ lessons: [{ date: D1, block: "3-4", attendance: { a: "absent", b: "present" } }] }));
    expect(s.days[0]).toMatchObject({ attended: 1, absent: 1, hasSecondHour: false });
  });

  it("deja ausente a quien llega después de la segunda hora, hasta tener justificativo", () => {
    const late = { studentId: "a", date: D1, status: "late" as const, arrivedAt: "2026-10-05T13:00:00Z" }; // 10:00 en Chile
    const s = buildSubsidySheet(input({ daily: [late, { studentId: "b", date: D1, status: "present" }] }));
    expect(s.rows.find((r) => r.student.id === "a")!.cells[0]).toMatchObject({ mark: "absent", lateEntry: true });
    const fixed = buildSubsidySheet(input({ daily: [late, { studentId: "b", date: D1, status: "present" }], corrections: [correction({ studentId: "a", kind: "ingreso_posterior", document: "Certificado 12" })] }));
    expect(fixed.days[0]).toMatchObject({ attended: 2, absent: 0 });
  });

  it("cuenta el atraso dentro de la segunda hora como presente", () => {
    const s = buildSubsidySheet(input({ daily: [{ studentId: "a", date: D1, status: "late", arrivedAt: "2026-10-05T11:40:00Z" }, { studentId: "b", date: D1, status: "justified" }] }));
    expect(s.days[0]).toMatchObject({ attended: 1, absent: 1, enrolled: 2 });
  });
});

describe("totales", () => {
  it("suma por día y por estudiante, con asistencia media", () => {
    const s = buildSubsidySheet(input());
    expect(s.days[0]).toMatchObject({ attended: 1, absent: 1, enrolled: 2, status: "complete" });
    expect(s.rows[0]).toMatchObject({ attended: 1, absent: 0 });
    expect(s.rate).toBe(0.5);
  });

  it("marca el día sin registros como error y no inventa presentes", () => {
    const s = buildSubsidySheet(input({ days: [D1, D2] }));
    expect(s.days[1]).toMatchObject({ status: "empty", attended: 0 });
    expect(s.issues[0]).toMatchObject({ severity: "error", message: expect.stringContaining("06") });
  });

  it("marca el día incompleto", () => {
    const s = buildSubsidySheet(input({ daily: [{ studentId: "a", date: D1, status: "present" }] }));
    expect(s.days[0]!.status).toBe("incomplete");
  });

  it("no cuenta el día suspendido, pero sí el cambio de actividades", () => {
    const event = (kind: "suspension" | "cambio_actividad") => ({ id: "e", date: D1, kind, reason: "x", authorization: "y", by: "d", at: "t" });
    expect(buildSubsidySheet(input({ events: [event("suspension")] }))).toMatchObject({ rate: null, issues: [] });
    expect(buildSubsidySheet(input({ events: [event("cambio_actividad")] })).days[0]).toMatchObject({ attended: 1, status: "complete" });
  });

  it("refleja altas y bajas desde su fecha", () => {
    const s = buildSubsidySheet(input({ days: [D1, D2], students: [st("a", { withdrawnOn: D2 }), st("b", { enrolledOn: D2 })], daily: [{ studentId: "a", date: D1, status: "present" }, { studentId: "b", date: D2, status: "present" }] }));
    expect(s.days.map((d) => d.enrolled)).toEqual([1, 1]);
    expect(s.days.every((d) => d.status === "complete")).toBe(true);
    expect(s.rows.find((r) => r.student.id === "a")!.cells[1]!.state).toBe("out");
  });

  it("registra al excedente sin sumarlo, y lo suma desde que reemplaza a otro", () => {
    const surplus = buildSubsidySheet(input({ students: [st("a"), st("b", { surplus: true })], daily: [{ studentId: "a", date: D1, status: "absent" }, { studentId: "b", date: D1, status: "present" }] }));
    expect(surplus.days[0]).toMatchObject({ attended: 0, absent: 1, enrolled: 1 });
    expect(surplus.rows.find((r) => r.student.id === "b")!.attended).toBe(1);
    const until = buildSubsidySheet(input({ days: [D1, D2], students: [st("a", { surplusUntil: D2 })], daily: [{ studentId: "a", date: D1, status: "present" }, { studentId: "a", date: D2, status: "present" }] }));
    expect(until.days.map((d) => d.enrolled)).toEqual([0, 1]);
  });

  it("aplica la última corrección y resuelve la diferencia", () => {
    const s = buildSubsidySheet(input({
      lessons: [{ date: D1, block: "2", attendance: { a: "present", b: "present" } }],
      corrections: [correction({ mark: "present", at: "2026-10-07T12:00:00Z" }), correction({ id: "c2", mark: "absent", at: "2026-10-08T12:00:00Z" })],
    }));
    expect(s.rows.find((r) => r.student.id === "b")!.cells[0]).toMatchObject({ mark: "absent", corrected: true, discrepancy: false });
    expect(s.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("deja al final de la lista a quien entra después", () => {
    expect(subsidyList([st("zeta"), st("ana", { enrolledOn: D2 }), st("bea")], D1).map((x) => x.id)).toEqual(["bea", "zeta", "ana"]);
  });
});

describe("validaciones", () => {
  const ctx = { today: D2, days: [D1, D2], enrolled: true };
  it("corrección con justificativo", () => {
    expect(correctionIssues({ date: D1, mark: "present", kind: "ingreso_posterior", reason: "Llegó de control médico", document: "Certificado 12" }, ctx)).toEqual([]);
    expect(correctionIssues({ date: D1, mark: "present", kind: "ingreso_posterior", reason: "Llegó de control médico" }, ctx)).toEqual(["Indique dónde consta el justificativo"]);
    expect(correctionIssues({ date: "2026-10-03", mark: "absent", kind: "traspaso", reason: "corto" }, { ...ctx, enrolled: false })).toHaveLength(2);
  });

  it("evento del día", () => {
    expect(dayEventIssues({ date: D1, kind: "suspension", reason: "Corte de agua en la comuna", authorization: "Oficio 45" }, { duplicate: false })).toEqual([]);
    expect(dayEventIssues({ date: D1, kind: "suspension", reason: "Corte de agua en la comuna", authorization: "Oficio 45" }, { duplicate: true })).toHaveLength(1);
  });

  it("declaración", () => {
    const d = { month: "2026-10", declaredOn: "2026-11-02", certificate: "F-100" };
    const c = { today: "2026-11-06", blocking: 0, alreadyDeclared: false, changed: false };
    expect(declarationIssues(d, c)).toEqual([]);
    expect(declarationIssues({ ...d, month: "2026-11" }, c)).toEqual(["El mes debe haber terminado para declararlo"]);
    expect(declarationIssues(d, { ...c, blocking: 2 })).toHaveLength(1);
    expect(declarationIssues(d, { ...c, alreadyDeclared: true })).toHaveLength(2);
    expect(declarationIssues({ ...d, reason: "Corrección de un justificativo" }, { ...c, alreadyDeclared: true, changed: true })).toEqual([]);
  });

  it("detecta lo que cambió después de declarar", () => {
    const declared = subsidySnapshot(buildSubsidySheet(input()));
    expect(declarationDiff(declared, declared)).toEqual([]);
    const after = subsidySnapshot(buildSubsidySheet(input({ corrections: [correction()] })));
    expect(declarationDiff(declared, after)).toEqual([D1]);
  });
});
