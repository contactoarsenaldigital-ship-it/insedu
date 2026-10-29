import "server-only";
import { DEFAULT_PASSWORD_POLICY, maskEmail, ROLE_LABEL, uuidv7, type Role } from "@insedu/domain";
import { digest, newChallenge, newSalt, randomToken, sameDigest, useChallenge, type Challenge, type ChallengeResult } from "@insedu/domain/server";
import { courseById, school } from "./demo";
import type { Person } from "./repository";

/**
 * Cuentas de acceso de la comunidad (Etapa 1).
 *
 * - Una persona solicita acceso o administración la crea; administración asigna el perfil y su
 *   alcance; los perfiles sensibles requieren además la aprobación de dirección.
 * - La persona activa su cuenta con un enlace de un solo uso: crea su clave y su segundo factor.
 * - En la maqueta no hay servicio de correo: los correos quedan en un buzón de demostración y los
 *   códigos se muestran rotulados en pantalla. En el piloto se envían por correo real.
 * - Las claves se guardan como huella scrypt; los códigos y enlaces, como huella con sal.
 */

export type MfaMethod = "correo" | "app";

export type AccountScope = {
  /** Docente: asignaturas que dicta (ids del libro de clases). */
  subjectIds?: string[];
  /** Docente: curso donde es profesor jefe. */
  headOfCourseId?: string;
  /** Apoderado: su pupilo. Estudiante: su propia ficha. */
  studentId?: string;
};

export type Account = {
  id: string; // acc-…
  name: string;
  rut: string;
  email: string;
  phone?: string;
  roles: Role[];
  scope: AccountScope;
  status: "invitada" | "activa" | "suspendida";
  /** Método de segundo factor que definió administración (perfiles sensibles: siempre app). */
  mfaPlan: MfaMethod;
  passwordHash?: string;
  mfa?: { method: MfaMethod; totpSecret?: string; enabledAt: string };
  /** Secreto en configuración durante la activación (aún no confirmado). */
  pendingTotpSecret?: string;
  recoveryHashes: { salt: string; hash: string }[];
  /** Códigos de recuperación recién creados, para mostrarlos una sola vez. */
  revealRecovery?: string[];
  activation?: { tokenHash: string; salt: string; expiresAt: string };
  failedLogins: number;
  lockedUntil?: string;
  lastLoginAt?: string;
  createdAt: string;
  createdBy: string;
  requestId?: string;
};

export type AccessRequest = {
  id: string;
  name: string;
  rut: string;
  email: string;
  phone?: string;
  relationship: string;
  studentRut?: string;
  note?: string;
  status: "verificando_correo" | "pendiente" | "esperando_direccion" | "aprobada" | "rechazada";
  createdAt: string;
  /** Propuesta de administración mientras espera a dirección. */
  proposal?: { roles: Role[]; scope: AccountScope; mfa: MfaMethod; by: string; at: string };
  decidedBy?: string[];
  decidedAt?: string;
  reason?: string;
  accountId?: string;
};

export type AuditEntry = { id: string; at: string; actor: string; action: string; detail: string };

export type Mail = { id: string; at: string; to: string; subject: string; body: string; link?: string };

export type Settings = {
  id: "parametros";
  contactStartHour: number;
  contactEndHour: number;
  riskMinAverage: number;
  riskMinAttendance: number; // 0..1
  riskMaxNegatives: number;
  riskMaxNurseVisits: number;
  copilotDailyLimit: number;
  passwordMinLength: number;
  codeMinutes: number;
  maxAttempts: number;
  lockMinutes: number;
  updatedAt?: string;
  updatedBy?: string;
};

export const DEFAULT_SETTINGS: Settings = {
  id: "parametros",
  contactStartHour: 8,
  contactEndHour: 18,
  riskMinAverage: 4.0,
  riskMinAttendance: 0.85,
  riskMaxNegatives: 2,
  riskMaxNurseVisits: 2,
  copilotDailyLimit: Number(process.env.AI_DAILY_LIMIT) || 100,
  passwordMinLength: DEFAULT_PASSWORD_POLICY.minLength,
  codeMinutes: 10,
  maxAttempts: 5,
  lockMinutes: 15,
};

export type AccountsState = {
  users: Account[];
  requests: AccessRequest[];
  challenges: Challenge[];
  audit: AuditEntry[];
  outbox: Mail[];
  settings: Settings[];
  /** Solo maqueta: el código vigente de cada desafío, para mostrarlo rotulado en pantalla. */
  demoCodes: { id: string; code: string }[];
};

const g = globalThis as unknown as { __insedu_accounts?: AccountsState };

export function initAccounts(): AccountsState {
  return { users: [], requests: [], challenges: [], audit: [], outbox: [], settings: [{ ...DEFAULT_SETTINGS }], demoCodes: [] };
}

export const accountsState = (): AccountsState => (g.__insedu_accounts ??= initAccounts());

export const settings = (): Settings => ({ ...DEFAULT_SETTINGS, ...(accountsState().settings[0] ?? {}) });

/** En la maqueta los códigos y enlaces se muestran en pantalla; con datos reales, nunca. */
export const showDemoSecrets = () => process.env.INSEDU_DATA_MODE !== "real";

// ───────────────────────── Consultas ─────────────────────────

export const accountById = (id: string) => accountsState().users.find((a) => a.id === id);
export const accountByEmail = (email: string) => accountsState().users.find((a) => a.email === email.trim().toLowerCase());

/** Persona con la que la cuenta usa INSEDU: un estudiante usa su propia ficha. */
export function personOf(a: Account): Person {
  const st = a.scope.studentId ? school().students.find((s) => s.id === a.scope.studentId) : undefined;
  if (a.roles.includes("student") && st) {
    return { id: st.id, name: a.name, roles: ["student"], description: `Estudiante de ${courseById(st.courseId)?.name}` };
  }
  if (a.roles.includes("guardian_academic") && st) {
    return { id: a.id, name: a.name, roles: ["guardian_academic"], description: `Apoderado/a de ${st.firstName} ${st.lastName}`, wards: [st.id] };
  }
  const head = a.scope.headOfCourseId ? courseById(a.scope.headOfCourseId)?.name : undefined;
  const labels = a.roles.filter((r) => !(head && r === "head_teacher")).map((r) => ROLE_LABEL[r]);
  return { id: a.id, name: a.name, roles: a.roles, description: labels.join(" · ") + (head ? ` · profesor jefe de ${head}` : "") };
}

/** Personal con cuenta activa (para mensajes, suplencias y nombres). */
export function accountStaff(): Person[] {
  return accountsState().users.filter((a) => a.status === "activa" && !a.roles.includes("student") && !a.roles.includes("guardian_academic")).map(personOf);
}

// ───────────────────────── Registro y correo ─────────────────────────

export function audit(actor: string, action: string, detail: string) {
  accountsState().audit.push({ id: uuidv7(), at: new Date().toISOString(), actor, action, detail });
}

/** Buzón de demostración: en el piloto, aquí se llama al servicio de correo. */
export function sendMail(to: string, subject: string, body: string, link?: string): Mail {
  const mail: Mail = { id: uuidv7(), at: new Date().toISOString(), to, subject, body, link };
  accountsState().outbox.push(mail);
  return mail;
}

// ───────────────────────── Códigos de 6 dígitos ─────────────────────────

/** Emite un código nuevo (anula los anteriores del mismo propósito) y lo envía al correo. */
export function issueCode(subject: string, purpose: Challenge["purpose"], email: string): { code: string; expiresAt: string; sentTo: string } {
  const st = accountsState();
  st.challenges = st.challenges.filter((c) => !(c.subject === subject && c.purpose === purpose) && new Date(c.expiresAt).getTime() > Date.now() - 864e5);
  st.demoCodes = st.demoCodes.filter((d) => st.challenges.some((c) => c.id === d.id));
  const { challenge, code } = newChallenge(uuidv7(), subject, purpose, settings().codeMinutes);
  st.challenges.push(challenge);
  if (showDemoSecrets()) st.demoCodes.push({ id: challenge.id, code });
  sendMail(email, "Su código de verificación de INSEDU", `Su código es ${code}. Vence en ${settings().codeMinutes} minutos. Si usted no lo pidió, ignore este correo.`);
  return { code, expiresAt: challenge.expiresAt, sentTo: maskEmail(email) };
}

/** Último código vigente (solo para mostrarlo en la demostración). */
export function demoCodeFor(subject: string, purpose: Challenge["purpose"]): string | undefined {
  if (!showDemoSecrets()) return undefined;
  const ch = accountsState().challenges.find((c) => c.subject === subject && c.purpose === purpose && !c.usedAt);
  return ch ? accountsState().demoCodes.find((d) => d.id === ch.id)?.code : undefined;
}

export function checkCode(subject: string, purpose: Challenge["purpose"], code: string): ChallengeResult {
  const ch = accountsState().challenges.find((c) => c.subject === subject && c.purpose === purpose && !c.usedAt);
  if (!ch) return "vencido";
  return useChallenge(ch, code, settings().maxAttempts);
}

/** Un código por minuto como máximo, para no inundar el correo. */
export function canResend(subject: string, purpose: Challenge["purpose"]): boolean {
  const ch = accountsState().challenges.find((c) => c.subject === subject && c.purpose === purpose);
  return !ch || Date.now() - new Date(ch.createdAt).getTime() > 60_000;
}

// ───────────────────────── Activación ─────────────────────────

/** Crea el enlace de activación de un solo uso (48 horas) y lo envía al correo de la cuenta. */
export function sendInvitation(a: Account, origin: string): Mail {
  const token = randomToken();
  const salt = newSalt();
  a.activation = { tokenHash: digest(token, salt), salt, expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString() };
  const link = `${origin}/activar?t=${token}`;
  return sendMail(a.email, "Active su cuenta de INSEDU", `Hola, ${a.name.split(" ")[0]}. Administración creó su cuenta de INSEDU. Active su cuenta antes de 48 horas: cree su clave y configure su verificación en dos pasos.`, link);
}

export function accountByActivation(token: string): Account | undefined {
  return accountsState().users.find(
    (a) => a.activation && new Date(a.activation.expiresAt).getTime() > Date.now() && sameDigest(token, a.activation.salt, a.activation.tokenHash),
  );
}
