import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { HkdfKeyProvider } from "../src/safeguarding/crypto";
import type { Actor } from "../src/safeguarding/policy";
import { MemoryVaultStore, VaultDenied, VaultService } from "../src/safeguarding/service";
import type { Role } from "../src/types";

const T = "t1";
let now = new Date("2026-10-16T14:00:00Z");
const clock = () => now;
const fresh = () => new Date(now.getTime() - 60_000).toISOString();
const actor = (userId: string, roles: Role[], strong = true): Actor => ({
  userId,
  tenantId: T,
  roles,
  lastStrongAuthAt: strong ? fresh() : undefined,
});

let store: MemoryVaultStore;
let vault: VaultService;
const titular = () => actor("sg-1", ["safeguarding_lead"]);

beforeEach(() => {
  now = new Date("2026-10-16T14:00:00Z");
  store = new MemoryVaultStore();
  store.setAssignment({ tenantId: T, titularUserId: "sg-1", titularActive: true });
  vault = new VaultService(store, new HkdfKeyProvider(randomBytes(32).toString("base64")), clock);
});

describe("casos del expediente confidencial", () => {
  it("el titular crea y lee un caso; el contenido queda cifrado en el almacenamiento", async () => {
    const c = await vault.openCase(titular(), "s1", "Seguimiento", "Entrevista inicial con la estudiante");
    expect(JSON.stringify(store.cases(T))).not.toContain("Entrevista inicial");
    const read = await vault.readCase(titular(), c.id, "Seguimiento semanal");
    expect(read.content.entries[0]!.text).toBe("Entrevista inicial con la estudiante");
    expect(store.accessLog(T).at(-1)).toMatchObject({ action: "open", actorId: "sg-1", reason: "Seguimiento semanal" });
  });

  it("una misma consulta repetida en 10 minutos se registra una vez", async () => {
    const c = await vault.openCase(titular(), "s1", "Caso", "nota");
    await vault.readCase(titular(), c.id, "Seguimiento");
    await vault.readCase(titular(), c.id, "Seguimiento");
    expect(store.accessLog(T).filter((e) => e.action === "open")).toHaveLength(1);
    now = new Date(now.getTime() + 11 * 60_000);
    await vault.readCase({ ...titular(), lastStrongAuthAt: fresh() }, c.id, "Seguimiento");
    expect(store.accessLog(T).filter((e) => e.action === "open")).toHaveLength(2);
  });

  it("sin verificación reciente no se abre", async () => {
    const c = await vault.openCase(titular(), "s1", "Caso", "");
    await expect(vault.readCase(actor("sg-1", ["safeguarding_lead"], false), c.id, "Revisión")).rejects.toBeInstanceOf(VaultDenied);
  });

  it("director, psicóloga y docente son rechazados y el intento queda registrado", async () => {
    const c = await vault.openCase(titular(), "s1", "Caso", "nota");
    for (const a of [actor("dir", ["director"]), actor("psi", ["psychologist"]), actor("doc", ["teacher"])]) {
      await expect(vault.readCase(a, c.id, "curiosidad")).rejects.toBeInstanceOf(VaultDenied);
    }
    expect(store.accessLog(T).filter((e) => e.action === "denied")).toHaveLength(3);
    expect(() => vault.inbox(actor("dir", ["director"]))).toThrow(VaultDenied);
  });
});

describe("depósito sin lectura", () => {
  it("la psicóloga deposita, no puede leer, y el titular lo incorpora a un caso", async () => {
    const psi = actor("psi", ["psychologist"]);
    const r = await vault.deposit(psi, "s2", "entrevista", "La estudiante relata dificultades en su hogar");
    expect(r.id).toBeTruthy();
    expect(vault.inbox(titular()).pendingDeposits).toHaveLength(1);
    const c = await vault.reviewDeposit(titular(), r.id);
    const read = await vault.readCase(titular(), c.id, "Revisión de depósito");
    expect(read.content.entries.some((e) => e.text.includes("dificultades en su hogar"))).toBe(true);
    expect(vault.inbox(titular()).pendingDeposits).toHaveLength(0);
    await expect(vault.readCase(psi, c.id, "ver lo que deposité")).rejects.toBeInstanceOf(VaultDenied);
  });

  it("un docente no puede depositar", async () => {
    await expect(vault.deposit(actor("doc", ["teacher"]), "s1", "documento", "Texto suficientemente largo")).rejects.toBeInstanceOf(VaultDenied);
  });
});

describe("protocolos", () => {
  it("activar 'posible delito' fija la denuncia a 24 horas y detecta el vencimiento", async () => {
    const c = await vault.openCase(titular(), "s1", "Caso", "");
    const p = vault.activateProtocol(titular(), c.id, "posible_delito");
    expect(new Date(p.dueAt!).getTime() - now.getTime()).toBe(24 * 3_600_000);
    expect(VaultService.overdue(p, new Date(now.getTime() + 25 * 3_600_000))).toBe(true);
    const done = vault.completeProtocol(titular(), p.id, "Ministerio Público", "RUC 2600123456-7");
    expect(VaultService.overdue(done, new Date(now.getTime() + 25 * 3_600_000))).toBe(false);
  });
});

describe("instrucción mínima", () => {
  it("solo el titular la emite y se rechazan términos sensibles", async () => {
    const base = { studentId: "s1", targetRole: "head_teacher" as const, validFrom: "2026-10-16", validUntil: "2026-10-30", returnChannel: "Mensaje a Salvaguarda" };
    expect(() => vault.issueInstruction(titular(), { ...base, action: "Tiene ansiedad, permitir salida" })).toThrow(VaultDenied);
    expect(vault.issueInstruction(titular(), { ...base, action: "Permitir salida de sala sin pedir explicación" }).action).toContain("Permitir");
    expect(() => vault.issueInstruction(actor("dir", ["director"]), { ...base, action: "Permitir salida de sala" })).toThrow(VaultDenied);
  });
});

describe("suplencia y emergencia", () => {
  it("durante la suplencia el titular pierde acceso y lo recupera al terminar", async () => {
    const c = await vault.openCase(titular(), "s1", "Caso", "nota");
    vault.setSubstitution(titular(), "sg-2", "2026-10-16T00:00:00Z", "2026-10-20T00:00:00Z", ["sg-1", "dir"]);
    await expect(vault.readCase(titular(), c.id, "revisión")).rejects.toBeInstanceOf(VaultDenied);
    expect((await vault.readCase(actor("sg-2", ["counselor"]), c.id, "suplencia")).basis).toBe("suplencia_activa");
    vault.endSubstitution(titular());
    expect((await vault.readCase(titular(), c.id, "regreso")).basis).toBe("titular");
  });

  it("break-glass: un estudiante, máximo 4 horas, con otra aprobación", async () => {
    const c = await vault.openCase(titular(), "s1", "Caso", "nota");
    const other = await vault.openCase(titular(), "s9", "Otro", "nota");
    const dir = actor("dir", ["director"]);
    expect(() => vault.requestBreakGlass(dir, { studentId: "s1", reason: "riesgo_inminente", justification: "Riesgo vital informado por la familia", approvedBy: ["dir"], hours: 2 })).toThrow();
    expect(() => vault.requestBreakGlass(dir, { studentId: "s1", reason: "riesgo_inminente", justification: "Riesgo vital informado por la familia", approvedBy: ["sostenedor"], hours: 8 })).toThrow();
    vault.requestBreakGlass(dir, { studentId: "s1", reason: "riesgo_inminente", justification: "Riesgo vital informado por la familia", approvedBy: ["sostenedor"], hours: 2 });
    expect((await vault.readCase(dir, c.id, "emergencia")).basis).toMatch(/^break_glass/);
    await expect(vault.readCase(dir, other.id, "emergencia")).rejects.toBeInstanceOf(VaultDenied);
    await expect(vault.exportCase(dir, c.id, "copia para el tribunal")).rejects.toBeInstanceOf(VaultDenied);
    now = new Date(now.getTime() + 3 * 3_600_000);
    await expect(vault.readCase({ ...dir, lastStrongAuthAt: fresh() }, c.id, "emergencia")).rejects.toBeInstanceOf(VaultDenied);
  });

  it("la auditoría muestra accesos sin contenido", async () => {
    const c = await vault.openCase(titular(), "s1", "Caso", "contenido secreto");
    await vault.readCase(titular(), c.id, "seguimiento");
    const log = vault.audit(actor("dir", ["director"]));
    expect(JSON.stringify(log)).not.toContain("contenido secreto");
    expect(log[0]).toMatchObject({ action: "open" });
  });
});
