import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Scope } from "@insedu/domain";
import { findPerson, loginPeople, repo } from "./store";
import type { Person } from "./repository";

/**
 * Sesión de DEMOSTRACIÓN: el visitante elige un usuario ficticio y se guarda su id en una
 * cookie firmada (HMAC). Permite que el servidor aplique permisos reales en cada acción.
 * En E1-F1 con cuentas se reemplaza por Supabase Auth (MFA para perfiles sensibles);
 * el resto del código solo usa getSession(), que mantiene el mismo contrato.
 */
const COOKIE = "insedu_demo_session";

function secret(): string {
  const s = process.env.INSEDU_SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.INSEDU_DATA_MODE === "real") {
    throw new Error("INSEDU_SESSION_SECRET (mínimo 32 caracteres) es obligatorio con datos reales");
  }
  return "insedu-demo-only-secret-do-not-use-with-real-data";
}

const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url");

export function encode(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function decode(token: string | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const id = token.slice(0, i);
  const a = Buffer.from(token.slice(i + 1));
  const b = Buffer.from(sign(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export type Session = { person: Person; scope: Scope; lastStrongAuthAt?: string };

// ───────────── Verificación en dos pasos (demostración) ─────────────
// En producción: TOTP/passkey de Supabase Auth. Aquí el código se calcula con HMAC por
// usuario y ventana de 30 s, y la página lo muestra rotulado como demostración.
const MFA_COOKIE = "insedu_demo_mfa";
const WINDOW_MS = 30_000;

export function mfaCode(userId: string, at = Date.now()): string {
  const w = Math.floor(at / WINDOW_MS);
  const h = createHmac("sha256", secret()).update(`mfa:${userId}:${w}`).digest();
  return String(h.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export function verifyMfaCode(userId: string, code: string, at = Date.now()): boolean {
  const c = code.replace(/\s/g, "");
  return [0, -WINDOW_MS].some((d) => mfaCode(userId, at + d) === c);
}

export async function markStrongAuth(userId: string) {
  const v = `${userId}|${new Date().toISOString()}`;
  (await cookies()).set(MFA_COOKIE, `${v}.${sign(v)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
}

async function strongAuthAt(userId: string): Promise<string | undefined> {
  const raw = (await cookies()).get(MFA_COOKIE)?.value;
  const v = raw ? decode(raw) : null;
  if (!v) return undefined;
  const [uid, at] = v.split("|");
  return uid === userId ? at : undefined;
}

export function scopeOf(personId: string): Scope {
  return {
    subjectIds: repo.subjects().filter((s) => s.teacherId === personId).map((s) => s.id),
    headOfCourseIds: repo.courses().filter((c) => c.headTeacherId === personId).map((c) => c.id),
  };
}

export async function getSession(): Promise<Session | null> {
  const id = decode((await cookies()).get(COOKIE)?.value);
  const person = id && loginPeople().some((p) => p.id === id) ? findPerson(id) : undefined;
  return person ? { person, scope: scopeOf(person.id), lastStrongAuthAt: await strongAuthAt(person.id) } : null;
}

/** Registran asistencia escaneando credenciales: docentes, inspectoría y portería (como el menú «Escanear»). */
export const canScan = (s: Session) => s.person.roles.some((r) => r === "teacher" || r === "head_teacher" || r === "inspector" || r === "gatekeeper");

/** Los archivos para MINEDUC incluyen a todo el establecimiento: solo dirección y administración. */
export const canExportMineduc = (s: Session) => s.person.roles.some((r) => r === "director" || r === "school_admin");

export async function setSession(userId: string) {
  (await cookies()).set(COOKIE, encode(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // una jornada
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
  (await cookies()).delete(MFA_COOKIE);
}
