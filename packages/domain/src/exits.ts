/**
 * Registro de salidas o retiros (Circular de registros, numeral 7).
 * Contenido mínimo: fecha, estudiante, curso, hora de salida y de regreso, quién retira, su firma y
 * observaciones. También exige un registro de personas autorizadas por los apoderados, una anotación
 * por cada salida de un curso completo y medidas especiales si retira una persona no registrada.
 */
import { isValidRut } from "./rut";

export type AuthorizedPickup = {
  id: string;
  studentId: string;
  name: string;
  rut: string;
  relation: string;
  phone?: string;
  /** Quién lo registró y dónde consta la autorización del apoderado. */
  source: "apoderado" | "establecimiento";
  evidence?: string;
  by: string;
  at: string;
  revokedAt?: string;
  revokedBy?: string;
};

import type { LessonSignature } from "./gradebook";

export type StudentExit = {
  id: string;
  folio: number;
  studentId: string;
  courseId: string;
  date: string;
  exitTime: string;
  returnTime?: string;
  pickupName: string;
  pickupRut?: string;
  /** Persona del registro de autorizados; sin ella, debe constar la comunicación del apoderado. */
  pickupAuthId?: string;
  guardianNote?: string;
  /** Firma manuscrita en pantalla (PNG), o bien referencia a un poder simple en papel. */
  signature?: string;
  paperEvidence?: string;
  reason: string;
  observations?: string;
  campus?: string;
  by: string;
  at: string;
  /** Firma con verificador de quien registra el retiro (el EDE la exige). */
  staffSignature?: LessonSignature;
};

export type CourseExit = {
  id: string;
  folio: number;
  courseId: string;
  date: string;
  exitTime: string;
  returnTime?: string;
  studentsOut: number;
  responsible: string;
  destination: string;
  by: string;
  at: string;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_SIGNATURE_LENGTH = 120_000;
export const isSignatureImage = (s: string) => /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= MAX_SIGNATURE_LENGTH;

export const nextFolio = (records: { date: string; folio: number }[], date: string) =>
  records.filter((r) => r.date.slice(0, 4) === date.slice(0, 4)).reduce((max, r) => Math.max(max, r.folio), 0) + 1;

export type ExitDraft = {
  date: string; exitTime: string; returnTime?: string; pickupName: string; pickupRut?: string;
  pickupAuthId?: string; guardianNote?: string; signature?: string; paperEvidence?: string; reason: string;
};

export function exitIssues(d: ExitDraft, ctx: { today: string; authorizedIds: string[]; hasOpenExit: boolean }): string[] {
  const issues: string[] = [];
  if (!DATE.test(d.date)) issues.push("Indique la fecha");
  else if (d.date > ctx.today) issues.push("La fecha no puede ser futura");
  if (!TIME.test(d.exitTime)) issues.push("Indique la hora de salida");
  if (d.returnTime && !TIME.test(d.returnTime)) issues.push("La hora de regreso no es válida");
  else if (d.returnTime && TIME.test(d.exitTime) && d.returnTime < d.exitTime) issues.push("La hora de regreso no puede ser anterior a la de salida");
  if (d.pickupName.trim().length < 5 || !d.pickupName.trim().includes(" ")) issues.push("Escriba el nombre y apellido de quien retira");
  if (d.pickupRut && !isValidRut(d.pickupRut)) issues.push("El RUN de quien retira no es válido");
  if (d.reason.trim().length < 5) issues.push("Indique el motivo de la salida");
  if (d.pickupAuthId) {
    if (!ctx.authorizedIds.includes(d.pickupAuthId)) issues.push("Esa persona ya no está autorizada");
  } else {
    if (!d.pickupRut) issues.push("Una persona no registrada debe identificarse con su RUN");
    if ((d.guardianNote ?? "").trim().length < 5) issues.push("Indique dónde consta la comunicación del apoderado que autoriza este retiro");
  }
  if (d.signature) {
    if (!isSignatureImage(d.signature)) issues.push("La firma no es válida. Vuelva a firmar");
  } else if ((d.paperEvidence ?? "").trim().length < 5) {
    issues.push("Falta la firma de quien retira, en pantalla o en un poder simple");
  }
  if (ctx.hasOpenExit) issues.push("Este estudiante tiene una salida sin regreso registrado ese día");
  return issues;
}

export function returnIssues(exitTime: string, returnTime: string): string[] {
  if (!TIME.test(returnTime)) return ["Indique la hora de regreso"];
  return returnTime < exitTime ? ["La hora de regreso no puede ser anterior a la de salida"] : [];
}

export function pickupIssues(p: { name: string; rut: string; relation: string; phone?: string }, ctx: { existingRuts: string[] }): string[] {
  const issues: string[] = [];
  if (p.name.trim().length < 5 || !p.name.trim().includes(" ")) issues.push("Escriba nombre y apellido");
  if (!isValidRut(p.rut)) issues.push("El RUN no es válido");
  else if (ctx.existingRuts.includes(p.rut.replace(/[.\s-]/g, "").toUpperCase())) issues.push("Esa persona ya está autorizada para este estudiante");
  if (p.relation.trim().length < 3) issues.push("Indique la relación con el estudiante");
  if (p.phone && !/^\+?[\d\s]{8,15}$/.test(p.phone.trim())) issues.push("El teléfono no es válido");
  return issues;
}

export function courseExitIssues(d: { date: string; exitTime: string; returnTime?: string; studentsOut: number; responsible: string; destination: string }, ctx: { today: string; enrolled: number }): string[] {
  const issues: string[] = [];
  if (!DATE.test(d.date)) issues.push("Indique la fecha");
  else if (d.date > ctx.today) issues.push("La fecha no puede ser futura");
  if (!TIME.test(d.exitTime)) issues.push("Indique la hora de salida");
  if (d.returnTime && (!TIME.test(d.returnTime) || d.returnTime < d.exitTime)) issues.push("La hora de regreso no es válida");
  if (!Number.isInteger(d.studentsOut) || d.studentsOut < 1 || d.studentsOut > ctx.enrolled) issues.push(`Indique cuántos estudiantes salen (1 a ${ctx.enrolled})`);
  if (d.responsible.trim().length < 5) issues.push("Indique quién está a cargo del curso");
  if (d.destination.trim().length < 5) issues.push("Indique el destino o la actividad");
  return issues;
}
