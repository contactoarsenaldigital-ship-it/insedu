import { describe, expect, it } from "vitest";
import { canMessage, deliveryWindow, validateMessage, type Participant } from "../src/messaging";
import { balance, canRedeem, earned, goalProgress, levelOf, validateGoal, type LedgerEntry, type Redemption, type Reward } from "../src/rewards";

const now = new Date("2026-10-16T15:00:00Z");
const e = (points: number, kind: LedgerEntry["kind"] = "earn"): LedgerEntry => ({ id: String(Math.random()), studentId: "s1", at: now.toISOString(), kind, points, source: "x", message: "x" });
const reward: Reward = { id: "r1", name: "Elegir la música del recreo", description: "", cost: 30, stock: 2, active: true };

describe("saldo y nivel", () => {
  it("canjear reduce el saldo pero no el nivel", () => {
    const ledger = [e(60), e(-30, "reserve")];
    expect(balance(ledger, "s1")).toBe(30);
    expect(earned(ledger, "s1")).toBe(60);
    expect(levelOf(earned(ledger, "s1")).name).toBe("Constante");
  });
  it("informa cuánto falta para el siguiente nivel", () => {
    expect(levelOf(90)).toMatchObject({ name: "Constante", nextName: "Perseverante", toNext: 10 });
    expect(levelOf(500)).toMatchObject({ name: "Referente", nextName: undefined, progress: 1 });
  });
});

describe("canje", () => {
  it("exige saldo suficiente y stock", () => {
    expect(canRedeem("s1", reward, [e(10)], [], now)).toContain("Te faltan 20 puntos");
    expect(canRedeem("s1", { ...reward, stock: 0 }, [e(100)], [], now)).toContain("No quedan unidades disponibles");
    expect(canRedeem("s1", reward, [e(100)], [], now)).toEqual([]);
  });
  it("evita duplicados y respeta el límite semanal", () => {
    const pending: Redemption = { id: "x", studentId: "s1", rewardId: "r1", cost: 30, at: now.toISOString(), status: "pendiente" };
    expect(canRedeem("s1", reward, [e(100)], [pending], now)).toContain("Ya tienes una solicitud pendiente de esta recompensa");
    const recent: Redemption = { ...pending, status: "aprobado", at: new Date(now.getTime() - 3 * 864e5).toISOString() };
    expect(canRedeem("s1", reward, [e(100)], [recent], now)[0]).toContain("una vez cada 7 días");
    const old: Redemption = { ...recent, at: new Date(now.getTime() - 9 * 864e5).toISOString() };
    expect(canRedeem("s1", reward, [e(100)], [old], now)).toEqual([]);
  });
  it("una recompensa de curso no se canjea desde otro curso", () => {
    expect(canRedeem("s1", { ...reward, courseId: "c1" }, [e(100)], [], now, "c2")).toContain("La recompensa es de otro curso");
  });
});

describe("metas cooperativas", () => {
  const goal = { id: "g", courseId: "c1", title: "Semana sin ausencias", metric: "asistencia" as const, target: 0.9, from: "2026-10-12", to: "2026-10-16", reward: "Recreo extendido", createdBy: "t" };
  it("calcula el avance del curso en el periodo", () => {
    const att = [
      ...Array.from({ length: 9 }, () => ({ date: "2026-10-13", status: "present" })),
      { date: "2026-10-13", status: "absent" },
      { date: "2026-10-01", status: "absent" }, // fuera de periodo
    ];
    const p = goalProgress(goal, { attendance: att, positives: [] });
    expect(p.value).toBeCloseTo(0.9);
    expect(p.achieved).toBe(true);
  });
  it("valida la definición", () => {
    expect(validateGoal({ ...goal, target: 1.5 })).toContain("La meta numérica no es válida");
    expect(validateGoal(goal)).toEqual([]);
  });
});

describe("mensajería", () => {
  const rel = { courseOfStudent: (s: string) => (s === "s1" ? "c1" : "c2"), teacherCourses: (p: string) => (p === "t1" ? ["c1"] : []) };
  const teacher: Participant = { id: "t1", roles: ["teacher"] };
  const other: Participant = { id: "t2", roles: ["teacher"] };
  const guardian: Participant = { id: "g1", roles: ["guardian_academic"], wards: ["s1"] };
  const student: Participant = { id: "s1", roles: ["student"] };
  const insp: Participant = { id: "i1", roles: ["inspector"] };

  it("docente y apoderado con vínculo pueden escribirse", () => {
    expect(canMessage(teacher, guardian, rel).allow).toBe(true);
    expect(canMessage(guardian, teacher, rel).allow).toBe(true);
  });
  it("sin vínculo no; inspectoría sí", () => {
    expect(canMessage(other, guardian, rel).allow).toBe(false);
    expect(canMessage(guardian, insp, rel).allow).toBe(true);
  });
  it("no hay conversaciones privadas con estudiantes", () => {
    expect(canMessage(teacher, student, rel)).toMatchObject({ allow: false });
    expect(canMessage(student, teacher, rel)).toMatchObject({ allow: false });
  });
  it("horario de contacto: notifica en horario hábil y difiere fuera de él", () => {
    expect(deliveryWindow(new Date("2026-10-16T15:00:00Z")).notifyNow).toBe(true); // viernes 12:00
    const fri22 = deliveryWindow(new Date("2026-10-17T01:00:00Z")); // viernes 22:00 → lunes 08:00
    expect(fri22.notifyNow).toBe(false);
    expect(fri22.minutesUntil).toBe(2 * 1440 + 10 * 60);
    const mon07 = deliveryWindow(new Date("2026-10-19T10:00:00Z")); // lunes 07:00
    expect(mon07.minutesUntil).toBe(60);
  });
  it("valida el largo", () => {
    expect(validateMessage(" ")).not.toBeNull();
    expect(validateMessage("Hola, ¿podemos conversar?")).toBeNull();
  });
});
