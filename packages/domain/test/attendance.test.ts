import { describe, expect, it } from "vitest";
import { attendanceRate, localTime, processScan, syncQueue, type ScanContext, type ScanEvent } from "../src/attendance";

const RUT = "123456785";
const ctx = (): ScanContext => ({
  findStudent: (_t, rut) => (rut === RUT ? { id: "s1", courseStart: "08:00" } : undefined),
  acceptedToday: new Map(),
  processedClientIds: new Set(),
  toleranceMinutes: 5,
  timeZone: "America/Santiago",
});
// 2026-10-15 en Chile es UTC-3: 11:00Z = 08:00 local
const ev = (clientId: string, at: string, deviceId = "d1", raw = "12.345.678-5"): ScanEvent => ({
  clientId,
  tenantId: "t1",
  rawCode: raw,
  scannedAt: at,
  scannedBy: "u-portero",
  deviceId,
  accessPoint: "Acceso principal",
});

describe("escaneo de credenciales", () => {
  it("convierte la hora a la zona del colegio", () => {
    expect(localTime("2026-10-15T11:03:00Z", "America/Santiago")).toBe("08:03");
  });

  it("registra presente dentro de la tolerancia y atraso fuera de ella", () => {
    const c = ctx();
    expect(processScan(ev("a", "2026-10-15T11:04:00Z"), c)).toMatchObject({ kind: "recorded", status: "present" });
    const c2 = ctx();
    expect(processScan(ev("b", "2026-10-15T11:20:00Z"), c2)).toMatchObject({ kind: "recorded", status: "late", minutesLate: 15 });
  });

  it("detecta un segundo escaneo del mismo RUT (posible credencial copiada)", () => {
    const c = ctx();
    processScan(ev("a", "2026-10-15T10:55:00Z", "d1"), c);
    expect(processScan(ev("b", "2026-10-15T10:58:00Z", "d2"), c)).toMatchObject({ kind: "duplicate", sameDevice: false });
  });

  it("es idempotente al reintentar la cola offline", () => {
    const c = ctx();
    const queue = [ev("a", "2026-10-15T10:55:00Z")];
    syncQueue(queue, c);
    expect(syncQueue(queue, c)[0]!.outcome).toEqual({ kind: "already_synced", clientId: "a" });
  });

  it("rechaza códigos inválidos y estudiantes desconocidos", () => {
    const c = ctx();
    expect(processScan(ev("x", "2026-10-15T10:55:00Z", "d1", "123456784"), c).kind).toBe("invalid_code");
    expect(processScan(ev("y", "2026-10-15T10:55:00Z", "d1", "11111111-1"), c).kind).toBe("unknown_student");
  });

  it("la inasistencia justificada cuenta como inasistencia", () => {
    expect(attendanceRate(["present", "late", "justified", "absent"])).toBe(0.5);
  });
});
