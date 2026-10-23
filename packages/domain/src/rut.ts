/**
 * RUT chileno y credencial del estudiante.
 *
 * Decisión de producto: la credencial lleva un código de barras cuyo contenido es
 * el RUT del estudiante (cuerpo + dígito verificador, sin puntos ni guion), por
 * ejemplo "24567890K". Se escanea con el teléfono del personal autorizado.
 *
 * Como el RUT es un dato conocido y reproducible, el escaneo nunca es la única
 * verificación: la app muestra foto y nombre (verificación visual) y el dominio
 * detecta duplicados (ver attendance.ts).
 */

export type Rut = { body: number; dv: string };

/** Calcula el dígito verificador con el algoritmo módulo 11. */
export function computeDv(body: number): string {
  if (!Number.isInteger(body) || body <= 0) throw new Error("Cuerpo de RUT inválido");
  let sum = 0;
  let factor = 2;
  let n = body;
  while (n > 0) {
    sum += (n % 10) * factor;
    n = Math.floor(n / 10);
    factor = factor === 7 ? 2 : factor + 1;
  }
  const r = 11 - (sum % 11);
  if (r === 11) return "0";
  if (r === 10) return "K";
  return String(r);
}

/** Normaliza cualquier escritura ("24.567.890-k", "24567890K", "24567890-K"). */
export function normalizeRut(input: string): string {
  return input.replace(/[.\s-]/g, "").toUpperCase();
}

/** Interpreta y valida un RUT. Devuelve null si no es válido. */
export function parseRut(input: string): Rut | null {
  const clean = normalizeRut(input);
  if (!/^\d{1,9}[0-9K]$/.test(clean)) return null;
  const body = Number(clean.slice(0, -1));
  const dv = clean.slice(-1);
  if (body < 1_000_000) return null; // fuera del rango de personas
  return computeDv(body) === dv ? { body, dv } : null;
}

export function isValidRut(input: string): boolean {
  return parseRut(input) !== null;
}

/** Formato de presentación: 24.567.890-K */
export function formatRut(rut: Rut | string): string {
  const r = typeof rut === "string" ? parseRut(rut) : rut;
  if (!r) throw new Error("RUT inválido");
  const body = r.body.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${body}-${r.dv}`;
}

/** Contenido del código de barras de la credencial (Code 128): cuerpo + DV. */
export function credentialPayload(rut: Rut | string): string {
  const r = typeof rut === "string" ? parseRut(rut) : rut;
  if (!r) throw new Error("RUT inválido");
  return `${r.body}${r.dv}`;
}

/**
 * Lee el contenido escaneado. Acepta el formato oficial y variantes que algunos
 * lectores agregan (prefijos, espacios, guion). Devuelve el RUT normalizado o null.
 */
export function readCredentialScan(raw: string): string | null {
  const candidate = normalizeRut(raw.trim()).replace(/^[^0-9]+/, "");
  const r = parseRut(candidate);
  return r ? `${r.body}${r.dv}` : null;
}

/** Enmascara el RUT para vistas donde no es necesario mostrarlo completo. */
export function maskRut(rut: string): string {
  const r = parseRut(rut);
  if (!r) return "RUT inválido";
  const s = r.body.toString();
  return `${"•".repeat(Math.max(0, s.length - 3))}${s.slice(-3)}-${r.dv}`;
}
