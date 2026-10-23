/**
 * Asistencia por escaneo de credencial en los accesos.
 *
 * - El personal autorizado (portería, inspectoría, docentes) escanea el código de barras
 *   de la credencial (RUT) con su teléfono.
 * - El registro funciona sin red: cada escaneo se guarda en una cola local con un id
 *   generado en el cliente y se sincroniza de forma idempotente.
 * - El servidor nunca sobrescribe: un segundo escaneo del mismo día se reporta como
 *   duplicado (posible suplantación o credencial copiada) y queda para revisión.
 */
import { readCredentialScan } from "./rut";
import type { AttendanceStatus } from "./types";

export type ScanEvent = {
  /** Identificador generado en el dispositivo (UUIDv7) — clave de idempotencia. */
  clientId: string;
  tenantId: string;
  rawCode: string;
  scannedAt: string; // ISO con zona
  scannedBy: string; // id del usuario autorizado
  deviceId: string;
  accessPoint: string; // "Acceso principal", "Portón sur"...
};

export type ScanOutcome =
  | { kind: "recorded"; rut: string; status: AttendanceStatus; minutesLate: number }
  | { kind: "duplicate"; rut: string; firstScanAt: string; sameDevice: boolean }
  | { kind: "already_synced"; clientId: string }
  | { kind: "invalid_code"; raw: string }
  | { kind: "unknown_student"; rut: string };

export type ScanContext = {
  /** Busca al estudiante por RUT normalizado dentro del tenant. */
  findStudent: (tenantId: string, rut: string) => { id: string; courseStart: string } | undefined;
  /** Registros ya aceptados en el día: rut -> primer escaneo */
  acceptedToday: Map<string, { at: string; deviceId: string }>;
  /** clientIds ya procesados (idempotencia). */
  processedClientIds: Set<string>;
  /** Minutos de tolerancia antes de marcar atraso. */
  toleranceMinutes: number;
  /** Zona horaria del colegio. */
  timeZone: string;
};

/** Hora local "HH:MM" de un instante en una zona horaria. */
export function localTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h === "24" ? "00" : h}:${m}`;
}

/** Fecha local "YYYY-MM-DD" de un instante en una zona horaria. */
export function localDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Procesa un escaneo. Puro y determinista: el llamador persiste el resultado. */
export function processScan(ev: ScanEvent, ctx: ScanContext): ScanOutcome {
  if (ctx.processedClientIds.has(ev.clientId)) {
    return { kind: "already_synced", clientId: ev.clientId };
  }
  const rut = readCredentialScan(ev.rawCode);
  if (!rut) return { kind: "invalid_code", raw: ev.rawCode };

  const student = ctx.findStudent(ev.tenantId, rut);
  if (!student) return { kind: "unknown_student", rut };

  const previous = ctx.acceptedToday.get(rut);
  if (previous) {
    return {
      kind: "duplicate",
      rut,
      firstScanAt: previous.at,
      sameDevice: previous.deviceId === ev.deviceId,
    };
  }

  const arrival = toMinutes(localTime(ev.scannedAt, ctx.timeZone));
  const start = toMinutes(student.courseStart);
  const minutesLate = Math.max(0, arrival - start - ctx.toleranceMinutes);
  const status: AttendanceStatus = minutesLate > 0 ? "late" : "present";

  ctx.processedClientIds.add(ev.clientId);
  ctx.acceptedToday.set(rut, { at: ev.scannedAt, deviceId: ev.deviceId });
  return { kind: "recorded", rut, status, minutesLate };
}

/**
 * Sincroniza una cola offline en orden cronológico. Devuelve un resultado por evento.
 * Reintentar la misma cola es seguro (idempotente por clientId).
 */
export function syncQueue(events: ScanEvent[], ctx: ScanContext) {
  return [...events]
    .sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))
    .map((ev) => ({ clientId: ev.clientId, outcome: processScan(ev, ctx) }));
}

/**
 * Porcentaje de asistencia. Presente o atrasado cuenta como asistencia; la
 * inasistencia justificada sigue contando como inasistencia (criterio del registro oficial).
 */
export function attendanceRate(statuses: AttendanceStatus[]): number {
  if (statuses.length === 0) return 1;
  const attended = statuses.filter((s) => s === "present" || s === "late").length;
  return attended / statuses.length;
}
