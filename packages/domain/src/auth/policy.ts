/**
 * Cuentas de acceso: política de claves, perfiles sensibles y validación de solicitudes.
 * Lógica pura (se usa también en el navegador para el indicador de fortaleza de la clave).
 *
 * Principios: clave robusta (mayúsculas, minúsculas, números y símbolos) sin cambios
 * periódicos forzados; segundo factor siempre; perfiles sensibles con app autenticadora y
 * doble aprobación (administración + dirección), para que nadie se asigne privilegios solo.
 */
import { isValidRut } from "../rut";
import type { Role } from "../types";

export type PasswordPolicy = { minLength: number };
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = { minLength: 12 };

/** Palabras que hacen predecible una clave escolar (se comparan sin tildes, números ni símbolos). */
const COMMON = ["password", "contrasena", "clave", "qwerty", "asdfgh", "colegio", "escuela", "liceo", "insedu", "chile", "admin", "bienvenido", "welcome", "letmein", "iloveyou", "estudiante", "profesor", "apoderado"];

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type PasswordContext = { name?: string; email?: string };

/** Problemas de una clave según la política; lista vacía = aceptable. */
export function passwordIssues(pw: string, ctx: PasswordContext = {}, policy = DEFAULT_PASSWORD_POLICY): string[] {
  const issues: string[] = [];
  if (pw.length < policy.minLength) issues.push(`Debe tener al menos ${policy.minLength} caracteres`);
  if (pw.length > 128) issues.push("Debe tener como máximo 128 caracteres");
  if (!/[a-zñáéíóúü]/.test(pw)) issues.push("Debe incluir una letra minúscula");
  if (!/[A-ZÑÁÉÍÓÚÜ]/.test(pw)) issues.push("Debe incluir una letra mayúscula");
  if (!/\d/.test(pw)) issues.push("Debe incluir un número");
  if (!/[^A-Za-z0-9ñÑáéíóúüÁÉÍÓÚÜ]/.test(pw)) issues.push("Debe incluir un símbolo, por ejemplo ! # $ % & *");
  const letters = plain(pw).replace(/[^a-z]/g, "");
  const common = COMMON.find((w) => letters.includes(w));
  if (common) issues.push(`No use palabras predecibles como «${common}»`);
  const personal = [...(ctx.name ? plain(ctx.name).split(/\s+/) : []), ...(ctx.email ? [plain(ctx.email.split("@")[0]!)] : [])].filter((w) => w.length >= 4);
  if (personal.some((w) => plain(pw).includes(w))) issues.push("No incluya su nombre ni su correo");
  if (/(.)\1{3,}/.test(pw)) issues.push("No repita el mismo carácter cuatro veces seguidas");
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef)/i.test(pw)) issues.push("No use secuencias como 1234 o abcd");
  return issues;
}

/** Fortaleza aproximada de 0 a 4 para el indicador visual. */
export function passwordStrength(pw: string, ctx: PasswordContext = {}): number {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let score = Math.min(4, Math.floor(pw.length / 4)) + classes - 3;
  if (passwordIssues(pw, ctx).length) score = Math.min(score, 2);
  return Math.max(0, Math.min(4, score));
}

// ───────────────────────── Perfiles ─────────────────────────

/** Perfiles que acceden a información sensible: app autenticadora y aprobación de dirección. */
export const SENSITIVE_ROLES: Role[] = ["platform_admin", "school_admin", "director", "safeguarding_lead", "psychologist", "nurse"];

export const isSensitive = (roles: Role[]) => roles.some((r) => SENSITIVE_ROLES.includes(r));

/** Perfiles que administración puede asignar a una cuenta. */
export const ASSIGNABLE_ROLES: Role[] = [
  "teacher", "inspector", "gatekeeper", "counselor", "social_worker", "psychologist", "nurse",
  "safeguarding_lead", "director", "school_admin", "guardian_academic", "student",
];

/** Relación declarada por quien solicita acceso y el perfil que se sugiere a administración. */
export const RELATIONSHIPS = {
  docente: { label: "Docente", role: "teacher" },
  asistente: { label: "Asistente de la educación (inspectoría o portería)", role: "inspector" },
  apoyo: { label: "Profesional de apoyo (orientación, psicología, trabajo social o enfermería)", role: "counselor" },
  directivo: { label: "Equipo directivo o administración", role: "director" },
  apoderado: { label: "Apoderado/a", role: "guardian_academic" },
  estudiante: { label: "Estudiante (desde 5° Básico)", role: "student" },
} as const satisfies Record<string, { label: string; role: Role }>;
export type Relationship = keyof typeof RELATIONSHIPS;

export type AccessRequestInput = {
  name: string;
  rut: string;
  email: string;
  phone?: string;
  relationship: string;
  studentRut?: string;
  note?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Problemas de una solicitud de acceso; lista vacía = se puede enviar. */
export function requestIssues(r: AccessRequestInput): string[] {
  const issues: string[] = [];
  if (r.name.trim().length < 5 || !r.name.trim().includes(" ")) issues.push("Escriba su nombre y apellido");
  if (!isValidRut(r.rut)) issues.push("El RUN no es válido");
  if (!EMAIL_RE.test(r.email.trim())) issues.push("El correo no es válido");
  if (r.phone && !/^\+?[\d\s]{8,15}$/.test(r.phone.trim())) issues.push("El teléfono no es válido");
  if (!(r.relationship in RELATIONSHIPS)) issues.push("Indique su relación con el establecimiento");
  if ((r.relationship === "apoderado" || r.relationship === "estudiante") && !isValidRut(r.studentRut ?? "")) {
    issues.push("Indique un RUN de estudiante válido");
  }
  if ((r.note ?? "").length > 500) issues.push("El comentario debe tener como máximo 500 caracteres");
  return issues;
}

/** Correo enmascarado para mostrar a dónde se envió un código: d*****@colegio.cl */
export const maskEmail = (email: string) => {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 1)}${"*".repeat(Math.max(3, user.length - 1))}@${domain}`;
};
