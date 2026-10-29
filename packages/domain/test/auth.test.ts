import { describe, expect, it } from "vitest";
import { isSensitive, maskEmail, passwordIssues, passwordStrength, requestIssues } from "../src/auth/policy";
import { base32Decode, base32Encode, hashPassword, newChallenge, newRecoveryCodes, otpauthUri, totp, useChallenge, verifyPassword, verifyTotp } from "../src/auth/secrets";

describe("cuentas de acceso", () => {
  it("exige clave con mayúsculas, minúsculas, números y símbolos", () => {
    expect(passwordIssues("Tr3n-Azul-Volcan")).toEqual([]);
    expect(passwordIssues("corta1!A")).toContain("Debe tener al menos 12 caracteres");
    expect(passwordIssues("sinmayusculas123!")).toContain("Debe incluir una letra mayúscula");
    expect(passwordIssues("SINMINUSCULAS123!")).toContain("Debe incluir una letra minúscula");
    expect(passwordIssues("SinNumerosAqui!!")).toContain("Debe incluir un número");
    expect(passwordIssues("SinSimbolos12345a")).toContain("Debe incluir un símbolo, por ejemplo ! # $ % & *");
  });

  it("rechaza claves predecibles o personales", () => {
    expect(passwordIssues("Colegio2026!xyz")[0]).toContain("colegio");
    expect(passwordIssues("Daniela#Segura9", { name: "Daniela Castro" })).toContain("No incluya su nombre ni su correo");
    expect(passwordIssues("Xaaaa#bmnq9YZt")).toContain("No repita el mismo carácter cuatro veces seguidas");
    expect(passwordIssues("Xy#1234mnopqR")).toContain("No use secuencias como 1234 o abcd");
    expect(passwordStrength("Tr3n-Azul-Volcan")).toBeGreaterThanOrEqual(3);
    expect(passwordStrength("abc")).toBe(0);
  });

  it("guarda la clave solo como huella scrypt con sal", () => {
    const h = hashPassword("Tr3n-Azul-Volcan");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(h).not.toContain("Tr3n");
    expect(hashPassword("Tr3n-Azul-Volcan")).not.toBe(h); // sal distinta
    expect(verifyPassword("Tr3n-Azul-Volcan", h)).toBe(true);
    expect(verifyPassword("tr3n-azul-volcan", h)).toBe(false);
  });

  it("código de 6 dígitos: un solo uso, vence y tiene intentos limitados", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    const { challenge, code } = newChallenge("c1", "acc-1", "ingreso", 10, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(challenge.codeHash).not.toContain(code);
    const wrong = code === "000000" ? "111111" : "000000";
    expect(useChallenge(challenge, wrong, 5, now)).toBe("incorrecto");
    expect(useChallenge(challenge, code, 5, now)).toBe("ok");
    expect(useChallenge(challenge, code, 5, now)).toBe("usado");

    const late = newChallenge("c2", "acc-1", "ingreso", 10, now);
    expect(useChallenge(late.challenge, late.code, 5, new Date("2026-10-29T12:11:00Z"))).toBe("vencido");

    const brute = newChallenge("c3", "acc-1", "ingreso", 10, now);
    for (let i = 0; i < 4; i++) useChallenge(brute.challenge, brute.code === "999999" ? "888888" : "999999", 5, now);
    expect(useChallenge(brute.challenge, "123", 5, now)).toBe("agotado");
    expect(useChallenge(brute.challenge, brute.code, 5, now)).toBe("agotado");
  });

  it("app autenticadora: cumple el vector de prueba de la RFC 6238", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    expect(totp(secret, 59_000, 8)).toBe("94287082");
    expect(totp(secret, 1_111_111_109_000, 8)).toBe("07081804");
    const now = Date.now();
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).toBe(true); // tolera un intervalo de desfase
    expect(verifyTotp(secret, totp(secret, now - 120_000), now)).toBe(false);
    expect(otpauthUri("INSEDU", "d@colegio.cl", secret)).toContain("secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("entrega 10 códigos de recuperación distintos", () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
  });

  it("valida solicitudes y marca los perfiles sensibles", () => {
    expect(requestIssues({ name: "Ana Rojas", rut: "12.345.678-5", email: "ana@correo.cl", relationship: "docente" })).toEqual([]);
    expect(requestIssues({ name: "Ana", rut: "12.345.678-0", email: "ana", relationship: "x" })).toHaveLength(4);
    expect(requestIssues({ name: "Ana Rojas", rut: "12.345.678-5", email: "ana@correo.cl", relationship: "apoderado" })).toContain("Indique un RUN de estudiante válido");
    expect(isSensitive(["psychologist"])).toBe(true);
    expect(isSensitive(["teacher", "head_teacher"])).toBe(false);
    expect(maskEmail("daniela@colegio.cl")).toBe("d******@colegio.cl");
  });
});
