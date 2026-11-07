/**
 * Validación en línea del verificador de identidad del libro de clases digital (SOLO SERVIDOR).
 *
 * Servicio publicado en ede.mineduc.cl/desarrolladores/validación-transaccional:
 *   GET https://apiede.mineduc.cl/otp/verify-otp?rut=…&otp=…&DateWithTimeZone=…
 * Responde un JSON «con un indicador booleano»; la documentación no da el nombre del campo, así
 * que solo se acepta una respuesta 200 en que haya un booleano y todos sean verdaderos. Cualquier
 * otra cosa es rechazo: una firma nunca se da por válida si no se pudo comprobar.
 * El servicio exige el código en la URL: esa URL no debe escribirse en ningún registro.
 */
export const MINEDUC_OTP_URL = "https://apiede.mineduc.cl/otp/verify-otp";

export type MineducOtpResult = "valido" | "invalido" | "sin_servicio";

/** Fecha con zona horaria de Chile, en el formato del ejemplo oficial: 2019-04-26T15:46:45-04:00. */
export function dateWithTimeZone(at: Date, timeZone = "America/Santiago"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "longOffset",
  }).formatToParts(at);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const offset = v("timeZoneName").replace("GMT", "") || "+00:00";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}:${v("second")}${offset}`;
}

/** RUN con guion y K mayúscula, sin puntos: 14206906-3. */
export function otpRut(rut: string): string {
  const clean = rut.replace(/[.\s-]/g, "").toUpperCase();
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

function allBooleansTrue(body: unknown): boolean {
  if (typeof body === "boolean") return body;
  if (!body || typeof body !== "object") return false;
  const flags = Object.values(body).filter((v): v is boolean => typeof v === "boolean");
  return flags.length > 0 && flags.every(Boolean);
}

export async function verifyMineducOtp(
  input: { rut: string; otp: string; at?: Date },
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<MineducOtpResult> {
  if (!/^\d{6}$/.test(input.otp)) return "invalido";
  const q = new URLSearchParams({ rut: otpRut(input.rut), otp: input.otp, DateWithTimeZone: dateWithTimeZone(input.at ?? new Date()) });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${MINEDUC_OTP_URL}?${q}`, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (res.status >= 500) return "sin_servicio";
    if (!res.ok) return "invalido";
    return allBooleansTrue(await res.json().catch(() => null)) ? "valido" : "invalido";
  } catch {
    return "sin_servicio";
  } finally {
    clearTimeout(t);
  }
}
