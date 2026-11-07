import { createHash } from "node:crypto";

/**
 * Bitácora del libro de clases (SOLO SERVIDOR).
 *
 * La Circular de registros (REX 30/2021, numeral 6.1.b; ORD 1355/2023, punto 5) exige que cada
 * ingreso, modificación o eliminación quede registrada, individualizando al usuario, con fecha,
 * hora y motivo. Cada evento incluye la huella del anterior: alterar un evento o borrar uno que
 * otro referencia se detecta al verificar.
 *
 * Dos instancias del servidor pueden agregar eventos a la vez y apuntar al mismo anterior, así que
 * la cadena admite bifurcaciones: se verifica que cada evento sea íntegro y que su anterior exista.
 */
export type LogbookAction = "crear" | "modificar" | "corregir" | "firmar" | "eliminar" | "exportar";

export type LogbookInput = {
  actor: string;
  action: LogbookAction;
  /** Tipo de registro: clase, asistencia, evaluacion, nota, anotacion, matricula, libro… */
  entity: string;
  recordId: string;
  courseId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
};

export type LogbookEvent = LogbookInput & { id: string; at: string; prev: string; hash: string };

export const GENESIS = "inicio";

const hashOf = (e: Omit<LogbookEvent, "hash">) =>
  createHash("sha256")
    .update(JSON.stringify([e.id, e.at, e.prev, e.actor, e.action, e.entity, e.recordId, e.courseId ?? null, e.before ?? null, e.after ?? null, e.reason ?? null]))
    .digest("hex");

/** Agrega un evento encadenado al último de la bitácora. */
export function appendEvent(log: LogbookEvent[], input: LogbookInput, id: string, at = new Date().toISOString()): LogbookEvent {
  const base = { ...input, id, at, prev: log.at(-1)?.hash ?? GENESIS };
  const event: LogbookEvent = { ...base, hash: hashOf(base) };
  log.push(event);
  return event;
}

export type LogbookCheck = { ok: boolean; checked: number; altered: string[]; missingPrevious: string[] };

/** Revisa la integridad: huella de cada evento y existencia de su evento anterior. */
export function verifyLogbook(log: LogbookEvent[]): LogbookCheck {
  const hashes = new Set(log.map((e) => e.hash));
  const altered: string[] = [];
  const missingPrevious: string[] = [];
  for (const e of log) {
    const { hash, ...rest } = e;
    if (hashOf(rest) !== hash) altered.push(e.id);
    if (e.prev !== GENESIS && !hashes.has(e.prev)) missingPrevious.push(e.id);
  }
  return { ok: !altered.length && !missingPrevious.length, checked: log.length, altered, missingPrevious };
}
