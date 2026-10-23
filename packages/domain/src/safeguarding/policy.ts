/**
 * Política de acceso al Expediente Confidencial de Salvaguarda (Plan Maestro 4.4.1).
 *
 * - Acceso ordinario EXCLUSIVO del Encargado de Salvaguarda titular vigente.
 * - El suplente formal solo accede mientras la suplencia está activa; en ese periodo
 *   el titular queda suspendido (sin acceso simultáneo permanente).
 * - Los profesionales de apoyo pueden DEPOSITAR antecedentes, pero no leerlos.
 * - Ningún rol obtiene acceso por jerarquía (director, administradores, soporte).
 * - Break-glass: solo ante riesgo inminente u obligación legal, con motivo, alcance
 *   mínimo (un estudiante), vigencia corta y segundo factor.
 * - Abrir o exportar exige reautenticación reciente.
 */
import type { Role } from "../types";

export type Actor = {
  userId: string;
  tenantId: string;
  roles: Role[];
  /** Instante de la última verificación MFA / reautenticación (ISO). */
  lastStrongAuthAt?: string;
};

export type SafeguardingAssignment = {
  tenantId: string;
  titularUserId: string;
  titularActive: boolean;
  substitute?: {
    userId: string;
    activeFrom: string; // ISO
    activeUntil: string; // ISO
  };
};

export type BreakGlassGrant = {
  id: string;
  tenantId: string;
  grantedTo: string;
  studentId: string;
  reason: "riesgo_inminente" | "obligacion_legal";
  justification: string;
  expiresAt: string;
  approvedBy: string[]; // ids; idealmente titular/suplente + autoridad del protocolo
};

export type Decision = { allow: true; basis: string } | { allow: false; reason: string };

export const DEPOSIT_ROLES: Role[] = [
  "psychologist",
  "counselor",
  "social_worker",
  "nurse",
  "safeguarding_lead",
];

/** Reautenticación exigida para abrir o exportar contenido confidencial. */
export const STRONG_AUTH_WINDOW_MS = 5 * 60 * 1000;

const deny = (reason: string): Decision => ({ allow: false, reason });

function strongAuthRecent(actor: Actor, now: Date): boolean {
  if (!actor.lastStrongAuthAt) return false;
  return now.getTime() - new Date(actor.lastStrongAuthAt).getTime() <= STRONG_AUTH_WINDOW_MS;
}

function substitutionActive(a: SafeguardingAssignment, now: Date): boolean {
  if (!a.substitute) return false;
  const t = now.getTime();
  return t >= new Date(a.substitute.activeFrom).getTime() && t < new Date(a.substitute.activeUntil).getTime();
}

/** ¿Quién tiene hoy el acceso ordinario? (exactamente una persona o nadie) */
export function currentHolder(a: SafeguardingAssignment, now = new Date()): string | null {
  if (substitutionActive(a, now)) return a.substitute!.userId;
  return a.titularActive ? a.titularUserId : null;
}

export function canReadVault(
  actor: Actor,
  assignment: SafeguardingAssignment,
  opts: { studentId: string; grants?: BreakGlassGrant[]; now?: Date },
): Decision {
  const now = opts.now ?? new Date();
  if (actor.tenantId !== assignment.tenantId) return deny("Otro establecimiento");

  const holder = currentHolder(assignment, now);
  if (holder === actor.userId) {
    if (!strongAuthRecent(actor, now)) return deny("Requiere reautenticación (MFA) reciente");
    return { allow: true, basis: holder === assignment.titularUserId ? "titular" : "suplencia_activa" };
  }

  const grant = (opts.grants ?? []).find(
    (g) =>
      g.tenantId === actor.tenantId &&
      g.grantedTo === actor.userId &&
      g.studentId === opts.studentId &&
      new Date(g.expiresAt).getTime() > now.getTime(),
  );
  if (grant) {
    if (!strongAuthRecent(actor, now)) return deny("Break-glass requiere segundo factor reciente");
    if (grant.justification.trim().length < 20) return deny("Justificación de break-glass insuficiente");
    return { allow: true, basis: `break_glass:${grant.id}` };
  }

  return deny("Acceso exclusivo del Encargado de Salvaguarda vigente");
}

export function canDeposit(actor: Actor, assignment: SafeguardingAssignment): Decision {
  if (actor.tenantId !== assignment.tenantId) return deny("Otro establecimiento");
  if (!actor.roles.some((r) => DEPOSIT_ROLES.includes(r))) {
    return deny("Rol sin facultad para depositar antecedentes");
  }
  return { allow: true, basis: "deposito_sin_lectura" };
}

export function canExport(
  actor: Actor,
  assignment: SafeguardingAssignment,
  opts: { studentId: string; reason: string; now?: Date },
): Decision {
  const read = canReadVault(actor, assignment, { studentId: opts.studentId, now: opts.now });
  if (!read.allow) return read;
  if (read.basis.startsWith("break_glass")) return deny("Break-glass no permite exportar");
  if (opts.reason.trim().length < 10) return deny("La exportación exige un motivo");
  return { allow: true, basis: `${read.basis}+export` };
}

/** Validación de una sucesión: nunca se transfieren credenciales, se revoca y se activa. */
export function designateSuccessor(
  a: SafeguardingAssignment,
  newTitularUserId: string,
  approvals: string[],
): SafeguardingAssignment {
  if (newTitularUserId === a.titularUserId) throw new Error("El sucesor debe ser otra persona");
  if (new Set(approvals).size < 2) throw new Error("La designación exige al menos dos aprobaciones");
  return { tenantId: a.tenantId, titularUserId: newTitularUserId, titularActive: true };
}

// ─────────────────── Instrucción mínima de protección ───────────────────

export type ProtectionInstruction = {
  studentId: string;
  action: string; // "Permitir salida de sala sin pedir explicación"
  targetRole: Role;
  targetUserId?: string;
  validFrom: string;
  validUntil: string;
  returnChannel: string; // "Avisar a Salvaguarda por mensaje interno"
};

/**
 * Términos que no deben aparecer en una instrucción mínima (diagnósticos o relato).
 * Es un resguardo, no un filtro perfecto: la responsabilidad final es de Salvaguarda.
 */
const FORBIDDEN_TERMS = [
  "diagnóstico", "diagnostico", "depresión", "depresion", "ansiedad", "abuso", "violación",
  "violacion", "suicid", "autolesi", "psiquiátr", "psiquiatr", "medicamento", "trastorno",
  "maltrato", "vulneración", "vulneracion", "relató", "relato", "declaró", "declaro",
];

export function validateInstruction(i: ProtectionInstruction): string[] {
  const issues: string[] = [];
  const text = i.action.toLowerCase();
  if (i.action.trim().length < 10) issues.push("La acción debe ser concreta");
  if (i.action.length > 280) issues.push("La instrucción debe ser breve (máx. 280 caracteres)");
  for (const t of FORBIDDEN_TERMS) {
    if (text.includes(t)) issues.push(`Contiene un término sensible ("${t}"): describa solo la acción`);
  }
  if (new Date(i.validUntil) <= new Date(i.validFrom)) issues.push("Vigencia inválida");
  if (!i.returnChannel.trim()) issues.push("Falta canal de retorno");
  return issues;
}
