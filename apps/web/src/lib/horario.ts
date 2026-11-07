import "server-only";
import { blocksOn, blockWindow, DEFAULT_BELLS, localTime, withinBlock, type BellPeriod } from "@insedu/domain";
import type { Session } from "./session";
import { repo, timetableState } from "./store";

/**
 * Horario: jornada (horas con su inicio y término) y asignatura por curso, día y hora.
 * Dirección y administración lo editan; el resto de la comunidad lo consulta.
 */
export const canEditTimetable = (s: Session) => s.person.roles.some((r) => r === "school_admin" || r === "director");

/** Jornada configurada; si aún no se configura, la de ejemplo (y se avisa). */
export function bells(): { bells: BellPeriod[]; configured: boolean } {
  const configured = timetableState().bells;
  return configured.length ? { bells: [...configured].sort((a, b) => a.number - b.number), configured: true } : { bells: DEFAULT_BELLS, configured: false };
}

export const slotsOf = (courseId: string) => timetableState().slots.filter((s) => s.courseId === courseId);

/** Bloques programados de la asignatura en esa fecha. */
export const scheduledBlocks = (subjectId: string, date: string) => blocksOn(timetableState().slots, subjectId, date);

/** Revisa la hora de la firma contra el horario. Devuelve un aviso, o null si está dentro del bloque. */
export function signatureWarning(subjectId: string, date: string, block: string, signedAtIso: string, timeZone = "America/Santiago"): string | null {
  if (!timetableState().slots.length) return null;
  const scheduled = scheduledBlocks(subjectId, date);
  if (!scheduled.length) return "Esta asignatura no tiene clases en el horario de ese día: el validador del Mineduc rechazará la asistencia.";
  if (!scheduled.includes(block)) return `El bloque ${block} no coincide con el horario de ese día (${scheduled.join(", ")}).`;
  const signedDate = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(signedAtIso));
  const time = localTime(signedAtIso, timeZone);
  if (signedDate !== date || !withinBlock(bells().bells, block, time)) {
    const w = blockWindow(bells().bells, block);
    return `Se firmó fuera del horario del bloque${w ? ` (${w.start} a ${w.end})` : ""}: el validador del Mineduc exige firmar durante la clase.`;
  }
  return null;
}

export const subjectName = (id: string) => repo.subject(id)?.name ?? "";
