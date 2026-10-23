import { describe, expect, it } from "vitest";
import { computeDv, credentialPayload, formatRut, isValidRut, maskRut, readCredentialScan } from "../src/rut";

describe("RUT", () => {
  it("calcula dígitos verificadores conocidos", () => {
    expect(computeDv(11111111)).toBe("1");
    expect(computeDv(12345678)).toBe("5");
    expect(computeDv(10000013)).toBe("K");
    expect(computeDv(24000000)).toBe(computeDv(24000000)); // determinista
  });

  it("valida con y sin formato", () => {
    expect(isValidRut("12.345.678-5")).toBe(true);
    expect(isValidRut("123456785")).toBe(true);
    expect(isValidRut("12345678-4")).toBe(false);
    expect(isValidRut("10000013-k")).toBe(true);
    expect(isValidRut("abc")).toBe(false);
  });

  it("formatea y enmascara", () => {
    expect(formatRut("123456785")).toBe("12.345.678-5");
    expect(maskRut("123456785")).toBe("•••••678-5");
  });

  it("la credencial contiene cuerpo + DV y se lee aunque el lector agregue ruido", () => {
    expect(credentialPayload("12.345.678-5")).toBe("123456785");
    expect(readCredentialScan(" 12345678-5 ")).toBe("123456785");
    expect(readCredentialScan("RUT:123456785")).toBe("123456785");
    expect(readCredentialScan("123456784")).toBeNull();
  });
});

import { uuidv7 } from "../src/ids";
describe("UUIDv7", () => {
  it("tiene versión 7 y es ordenable por tiempo", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a[14]).toBe("7");
    expect(a < b).toBe(true);
  });
});
