import "server-only";
import { uuidv7, type ProtectionInstruction, type Role } from "@insedu/domain";

/**
 * Instrucciones mínimas de protección publicadas FUERA de la bóveda (tabla
 * app.protection_instructions): solo la acción, vigencia, responsable y canal de retorno.
 */
export type PublishedInstruction = ProtectionInstruction & {
  id: string;
  issuedAt: string;
  issuedBy: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
};

const g = globalThis as unknown as { __insedu_instr?: PublishedInstruction[] };
const list = () => (g.__insedu_instr ??= []);

export function publish(i: ProtectionInstruction, by: string): PublishedInstruction {
  const p = { ...i, id: uuidv7(), issuedAt: new Date().toISOString(), issuedBy: by };
  list().push(p);
  return p;
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

/** Instrucciones vigentes dirigidas a la persona (por id) o a uno de sus roles. */
export function forPerson(personId: string, roles: Role[], courseHeadOf: string[], studentCourse: (sid: string) => string | undefined) {
  const d = today();
  return list().filter((i) => {
    if (i.validFrom > d || i.validUntil < d) return false;
    if (i.targetUserId) return i.targetUserId === personId;
    if (!roles.includes(i.targetRole)) return false;
    // Para profesor jefe, solo las de estudiantes de su curso.
    if (i.targetRole === "head_teacher") return courseHeadOf.includes(studentCourse(i.studentId) ?? "");
    return true;
  });
}

export function acknowledge(id: string, personId: string) {
  const i = list().find((x) => x.id === id);
  if (i && !i.acknowledgedAt) Object.assign(i, { acknowledgedAt: new Date().toISOString(), acknowledgedBy: personId });
  return i;
}

export function issuedFor(studentId: string) {
  return list().filter((i) => i.studentId === studentId);
}
