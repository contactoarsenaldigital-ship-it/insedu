import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HkdfKeyProvider, open, seal } from "../src/safeguarding/crypto";
import {
  canDeposit,
  canExport,
  canReadVault,
  currentHolder,
  designateSuccessor,
  validateInstruction,
  type Actor,
  type SafeguardingAssignment,
} from "../src/safeguarding/policy";
import type { Role } from "../src/types";

const NOW = new Date("2026-10-15T15:00:00Z");
const fresh = "2026-10-15T14:58:00Z";
const assignment: SafeguardingAssignment = { tenantId: "t1", titularUserId: "titular", titularActive: true };
const actor = (userId: string, roles: Role[], strong = fresh, tenantId = "t1"): Actor => ({
  userId,
  tenantId,
  roles,
  lastStrongAuthAt: strong,
});

describe("bóveda de Salvaguarda · acceso exclusivo", () => {
  it("el titular accede con reautenticación reciente", () => {
    expect(canReadVault(actor("titular", ["safeguarding_lead"]), assignment, { studentId: "s1", now: NOW })).toEqual({
      allow: true,
      basis: "titular",
    });
  });

  it("el titular sin MFA reciente es rechazado", () => {
    expect(
      canReadVault(actor("titular", ["safeguarding_lead"], "2026-10-15T13:00:00Z"), assignment, { studentId: "s1", now: NOW }).allow,
    ).toBe(false);
  });

  // Pruebas negativas exigidas por el Plan Maestro (sección 9).
  const others: [string, Role[]][] = [
    ["director", ["director"]],
    ["admin-colegio", ["school_admin"]],
    ["admin-plataforma", ["platform_admin"]],
    ["docente", ["teacher", "head_teacher"]],
    ["inspector", ["inspector"]],
    ["psicologa", ["psychologist"]],
    ["enfermera", ["nurse"]],
    ["apoderado", ["guardian_academic"]],
    ["estudiante", ["student"]],
  ];
  for (const [id, roles] of others) {
    it(`${id} NO puede leer la bóveda`, () => {
      expect(canReadVault(actor(id, roles), assignment, { studentId: "s1", now: NOW }).allow).toBe(false);
    });
  }

  it("un Encargado de Salvaguarda de otro colegio no accede", () => {
    expect(canReadVault(actor("titular", ["safeguarding_lead"], fresh, "t2"), assignment, { studentId: "s1", now: NOW }).allow).toBe(false);
  });

  it("durante la suplencia accede solo el suplente (sin acceso simultáneo)", () => {
    const a: SafeguardingAssignment = {
      ...assignment,
      substitute: { userId: "suplente", activeFrom: "2026-10-14T00:00:00Z", activeUntil: "2026-10-20T00:00:00Z" },
    };
    expect(currentHolder(a, NOW)).toBe("suplente");
    expect(canReadVault(actor("suplente", ["safeguarding_lead"]), a, { studentId: "s1", now: NOW }).allow).toBe(true);
    expect(canReadVault(actor("titular", ["safeguarding_lead"]), a, { studentId: "s1", now: NOW }).allow).toBe(false);
    expect(currentHolder(a, new Date("2026-10-21T00:00:00Z"))).toBe("titular");
  });

  it("break-glass: solo un estudiante, con vigencia, justificación y sin exportar", () => {
    const grants = [
      {
        id: "bg1",
        tenantId: "t1",
        grantedTo: "director",
        studentId: "s1",
        reason: "riesgo_inminente" as const,
        justification: "Riesgo vital informado por la familia, Salvaguarda no ubicable",
        expiresAt: "2026-10-15T16:00:00Z",
        approvedBy: ["suplente", "sostenedor"],
      },
    ];
    const dir = actor("director", ["director"]);
    expect(canReadVault(dir, assignment, { studentId: "s1", grants, now: NOW }).allow).toBe(true);
    expect(canReadVault(dir, assignment, { studentId: "s2", grants, now: NOW }).allow).toBe(false);
    expect(canReadVault(dir, assignment, { studentId: "s1", grants, now: new Date("2026-10-15T17:00:00Z") }).allow).toBe(false);
  });

  it("los profesionales depositan pero no leen; el docente no deposita", () => {
    expect(canDeposit(actor("psicologa", ["psychologist"]), assignment).allow).toBe(true);
    expect(canDeposit(actor("docente", ["teacher"]), assignment).allow).toBe(false);
  });

  it("exportar exige motivo", () => {
    const t = actor("titular", ["safeguarding_lead"]);
    expect(canExport(t, assignment, { studentId: "s1", reason: "", now: NOW }).allow).toBe(false);
    expect(canExport(t, assignment, { studentId: "s1", reason: "Requerimiento de tribunal de familia", now: NOW }).allow).toBe(true);
  });

  it("la sucesión exige dos aprobaciones y otra persona", () => {
    expect(() => designateSuccessor(assignment, "titular", ["a", "b"])).toThrow();
    expect(() => designateSuccessor(assignment, "nuevo", ["a"])).toThrow();
    expect(designateSuccessor(assignment, "nuevo", ["a", "b"]).titularUserId).toBe("nuevo");
  });
});

describe("instrucción mínima de protección", () => {
  it("rechaza términos diagnósticos o de relato", () => {
    const issues = validateInstruction({
      studentId: "s1",
      action: "Tiene depresión, permitir salida de sala",
      targetRole: "teacher",
      validFrom: "2026-10-15",
      validUntil: "2026-10-30",
      returnChannel: "Mensaje interno a Salvaguarda",
    });
    expect(issues.some((i) => i.includes("depresión"))).toBe(true);
  });

  it("acepta una acción concreta sin antecedentes", () => {
    expect(
      validateInstruction({
        studentId: "s1",
        action: "Permitir salida de sala sin pedir explicación y avisar a inspectoría",
        targetRole: "teacher",
        validFrom: "2026-10-15",
        validUntil: "2026-10-30",
        returnChannel: "Mensaje interno a Salvaguarda",
      }),
    ).toEqual([]);
  });
});

describe("cifrado de sobre por colegio", () => {
  const kp = new HkdfKeyProvider(randomBytes(32).toString("base64"));

  it("cifra y descifra el contenido", async () => {
    const sealed = await seal(kp, "t1", "r1", { nota: "entrevista confidencial" });
    expect(sealed.payload).not.toContain("entrevista");
    expect(await open(kp, "t1", "r1", sealed)).toEqual({ nota: "entrevista confidencial" });
  });

  it("un ciphertext no puede abrirse en otro colegio ni en otro registro", async () => {
    const sealed = await seal(kp, "t1", "r1", { x: 1 });
    await expect(open(kp, "t2", "r1", sealed)).rejects.toThrow();
    await expect(open(kp, "t1", "r2", sealed)).rejects.toThrow();
  });

  it("rechaza llaves maestras de largo incorrecto", () => {
    expect(() => new HkdfKeyProvider(randomBytes(16).toString("base64"))).toThrow();
  });
});
