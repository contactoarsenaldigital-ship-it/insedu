/**
 * Entrevistas y reuniones con apoderados (Circular de registros, 6.2.e: «las entrevistas con el apoderado y su
 * contenido se encuentran ingresados en el sistema»).
 *
 * - Quien conduce firma el registro con su verificador al guardarlo.
 * - El apoderado firma el acta en papel; el acta escaneada se adjunta al registro. El validador del EDE exige
 *   ese documento para cada entrevista y reunión.
 * - Una entrevista es por estudiante; una reunión es por curso, con la lista de apoderados que asistieron.
 */
import type { LessonSignature } from "./gradebook";
import { parseRut } from "./rut";

export type MeetingKind = "entrevista" | "reunion";

export const MEETING_LABEL: Record<MeetingKind, string> = {
  entrevista: "Entrevista con apoderado",
  reunion: "Reunión de apoderados",
};

export type AttendeeRelation = "titular" | "suplente" | "otro";

export const RELATION_LABEL: Record<AttendeeRelation, string> = {
  titular: "Apoderado/a titular",
  suplente: "Apoderado/a suplente",
  otro: "Otro adulto responsable",
};

/** Adulto que asistió, por el estudiante que representa. */
export type MeetingAttendee = { studentId: string; name: string; rut?: string; relation: AttendeeRelation };

export type GuardianMeeting = {
  id: string;
  kind: MeetingKind;
  courseId: string;
  /** Solo entrevistas: el estudiante del que se trata. */
  studentId?: string;
  date: string;
  /** Hora de inicio, HH:MM. */
  time: string;
  /** Motivo y temas tratados. */
  topics: string;
  agreements: string;
  attendees: MeetingAttendee[];
  /** Quien condujo la entrevista o dirigió la reunión. */
  by: string;
  signature: LessonSignature;
  at: string;
};

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

export function meetingIssues(
  m: { kind: string; studentId?: string; date: string; time: string; topics: string; agreements: string; attendees: { studentId: string; name: string; rut?: string; relation: string }[] },
  ctx: { today: string; courseStudentIds: string[] },
): string[] {
  const issues: string[] = [];
  if (m.kind !== "entrevista" && m.kind !== "reunion") issues.push("Indique si es una entrevista o una reunión");
  if (!isDate(m.date)) issues.push("Fecha inválida");
  else if (m.date > ctx.today) issues.push("La fecha no puede ser futura: se registra lo que ya ocurrió");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time)) issues.push("Indique la hora (HH:MM)");
  if (m.topics.trim().length < 10) issues.push("Describa el motivo y los temas tratados (mínimo 10 caracteres)");
  if (m.agreements.trim().length < 5) issues.push("Registre los acuerdos (mínimo 5 caracteres)");
  if (m.kind === "entrevista" && (!m.studentId || !ctx.courseStudentIds.includes(m.studentId))) issues.push("Seleccione al estudiante del curso");
  if (!m.attendees.length) issues.push(m.kind === "reunion" ? "Marque a los apoderados que asistieron" : "Indique quién asistió a la entrevista");
  for (const a of m.attendees) {
    if (!ctx.courseStudentIds.includes(a.studentId)) issues.push("Un asistente no corresponde a un estudiante del curso");
    if (a.name.trim().length < 3) issues.push("Escriba el nombre de quien asistió");
    if (a.rut && !parseRut(a.rut)) issues.push("El RUN de quien asistió no es válido");
    if (!(a.relation in RELATION_LABEL)) issues.push("Indique la relación con el estudiante");
  }
  return [...new Set(issues)];
}
