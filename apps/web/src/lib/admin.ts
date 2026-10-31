import "server-only";
import { isSensitive, normalizeRut, RELATIONSHIPS, ROLE_LABEL, type Role } from "@insedu/domain";
import { accountByEmail, accountsState, audit, sendInvitation, sendMail, type AccessRequest, type Account, type AccountScope, type MfaMethod } from "./accounts";
import { school } from "./demo";
import type { Session } from "./session";
import { repo } from "./store";

/**
 * Administración de cuentas: lo que hace Daniela (administración del establecimiento) y lo que
 * aprueba dirección. Separado de `accounts.ts` porque aplica el alcance sobre el libro de clases.
 */

export const isAdmin = (s: Session) => s.person.roles.includes("school_admin");
export const isDirector = (s: Session) => s.person.roles.includes("director");

export const studentByRut = (rut?: string) => (rut ? school().students.find((s) => s.rut === normalizeRut(rut)) : undefined);

/** Perfil sugerido según la relación que declaró la persona. */
export const suggestedRole = (r: AccessRequest): Role | undefined => RELATIONSHIPS[r.relationship as keyof typeof RELATIONSHIPS]?.role;

/** Pistas para revisar una solicitud antes de aprobarla. */
export function requestHints(r: AccessRequest): { ok: boolean; text: string }[] {
  const hints: { ok: boolean; text: string }[] = [];
  const dup = accountByEmail(r.email);
  hints.push(dup ? { ok: false, text: `Ya existe una cuenta con este correo (${dup.name}, ${dup.status})` } : { ok: true, text: "Correo confirmado con código y sin cuenta previa" });
  if (accountsState().users.some((a) => a.rut === r.rut)) hints.push({ ok: false, text: "Ya existe una cuenta con este RUN" });
  if (r.relationship === "apoderado" || r.relationship === "estudiante") {
    const st = studentByRut(r.studentRut);
    hints.push(st
      ? { ok: true, text: `Estudiante matriculado: ${st.firstName} ${st.lastName}` }
      : { ok: false, text: "El RUN de estudiante no aparece en la matrícula" });
  }
  if (r.relationship === "docente" || r.relationship === "asistente" || r.relationship === "apoyo" || r.relationship === "directivo") {
    hints.push({ ok: false, text: "Confirme con dirección o con el contrato que la persona trabaja en el establecimiento" });
  }
  return hints;
}

export type Proposal = { roles: Role[]; scope: AccountScope; mfa: MfaMethod };

/** Lee del formulario el perfil y el alcance que asigna administración. */
export function proposalFrom(form: FormData): Proposal {
  const roles = form.getAll("roles").map(String).filter((r): r is Role => r in ROLE_LABEL);
  const scope: AccountScope = {};
  const subjectIds = form.getAll("subjectIds").map(String).filter((id) => repo.subject(id));
  if (subjectIds.length) scope.subjectIds = subjectIds;
  const head = String(form.get("headOfCourseId") ?? "");
  if (head && repo.course(head)) scope.headOfCourseId = head;
  const st = studentByRut(String(form.get("studentRut") ?? "").trim());
  if (st) scope.studentId = st.id;
  // Los perfiles sensibles usan siempre app autenticadora.
  const mfa: MfaMethod = isSensitive(roles) || form.get("mfa") === "app" ? "app" : "correo";
  return { roles, scope, mfa };
}

export function proposalIssues(p: Proposal): string[] {
  const issues: string[] = [];
  if (!p.roles.length) issues.push("Asigne al menos un perfil");
  if ((p.roles.includes("student") || p.roles.includes("guardian_academic")) && !p.scope.studentId) issues.push("Indique el estudiante");
  if (p.roles.includes("student") && p.roles.length > 1) issues.push("Un estudiante no puede tener otros perfiles");
  if (p.scope.headOfCourseId && !p.roles.includes("teacher")) issues.push("La jefatura de curso requiere el perfil Docente");
  return issues;
}

/** Docentes: asignaturas y jefatura pasan a la cuenta en el libro de clases. */
function applyScope(a: Account) {
  for (const id of a.scope.subjectIds ?? []) {
    const s = repo.subject(id);
    if (s) s.teacherId = a.id;
  }
  if (a.scope.headOfCourseId) {
    const c = repo.course(a.scope.headOfCourseId);
    if (c) c.headTeacherId = a.id;
  }
}

/** Crea la cuenta (invitada) y le envía el enlace de activación. */
export function createAccount(
  data: { name: string; rut: string; email: string; phone?: string; requestId?: string },
  p: Proposal,
  by: string,
  origin: string,
  invite = true,
): Account {
  const roles: Role[] = p.scope.headOfCourseId && !p.roles.includes("head_teacher") ? [...p.roles, "head_teacher"] : p.roles;
  const a: Account = {
    id: `acc-${crypto.randomUUID().slice(0, 8)}`,
    name: data.name,
    rut: normalizeRut(data.rut),
    email: data.email.trim().toLowerCase(),
    phone: data.phone,
    roles,
    scope: p.scope,
    status: "invitada",
    mfaPlan: p.mfa,
    recoveryHashes: [],
    failedLogins: 0,
    createdAt: new Date().toISOString(),
    createdBy: by,
    requestId: data.requestId,
  };
  accountsState().users.push(a);
  applyScope(a);
  if (invite) sendInvitation(a, origin); // sin invitación: «Reenviar enlace» desde Usuarios
  audit(by, "Cuenta creada", `${a.name} · ${roles.map((r) => ROLE_LABEL[r]).join(", ")} · segundo factor: ${a.mfaPlan === "app" ? "app" : "correo"}`);
  return a;
}

/** Quita a una cuenta suspendida de sus asignaturas y jefatura (vuelven a quedar sin asignar). */
export function releaseScope(a: Account) {
  for (const s of repo.subjects()) if (s.teacherId === a.id) s.teacherId = "teacher-1";
  for (const c of repo.courses()) if (c.headTeacherId === a.id) c.headTeacherId = "teacher-1";
}

/** Restablecer acceso: borra clave y segundo factor y envía un enlace nuevo de activación. */
export function resetAccess(a: Account, by: string, origin: string) {
  a.passwordHash = undefined;
  a.mfa = undefined;
  a.pendingTotpSecret = undefined;
  a.recoveryHashes = [];
  a.revealRecovery = undefined;
  a.failedLogins = 0;
  a.lockedUntil = undefined;
  a.status = "invitada";
  sendInvitation(a, origin);
  audit(by, "Acceso restablecido", `${a.name}: se envió un enlace nuevo de activación`);
}

export function rejectRequest(r: AccessRequest, by: string, reason: string) {
  r.status = "rechazada";
  r.reason = reason;
  r.decidedBy = [...(r.decidedBy ?? []), by];
  r.decidedAt = new Date().toISOString();
  sendMail(r.email, "Su solicitud de acceso a INSEDU", `Hola, ${r.name.split(" ")[0]}. No pudimos aprobar su solicitud. Motivo: ${reason}. Si cree que es un error, comuníquese con el establecimiento.`);
  audit(by, "Solicitud rechazada", `${r.name} · ${reason}`);
}
