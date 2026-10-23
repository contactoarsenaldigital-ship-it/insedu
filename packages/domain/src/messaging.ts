/**
 * Comunicación familia-colegio (Plan Maestro 4.7).
 *
 * Reglas de protección de menores:
 * - No existen conversaciones privadas 1 a 1 entre un adulto del colegio y un estudiante.
 *   Los estudiantes reciben comunicados del curso; las conversaciones son con su apoderado.
 * - Un funcionario escribe solo a apoderados de estudiantes con los que tiene vínculo
 *   (cursos donde hace clases o es profesor jefe), o a otros funcionarios.
 * - Un apoderado escribe al profesor jefe, a los docentes del curso de su pupilo, a inspectoría
 *   y a dirección.
 * Horario de contacto: los mensajes se pueden enviar siempre, pero las notificaciones se entregan
 * en días hábiles entre 08:00 y 18:00 (configurable). Fuera de ese horario quedan en bandeja.
 */
import type { Role } from "./types";

export type Participant = {
  id: string;
  roles: Role[];
  /** Estudiantes a cargo (apoderados) */
  wards?: string[];
  /** Cursos con vínculo docente (docentes) */
  courseIds?: string[];
};

export type Relations = {
  courseOfStudent: (studentId: string) => string | undefined;
  /** Cursos donde la persona hace clases o es profesor jefe */
  teacherCourses: (personId: string) => string[];
};

const STAFF: Role[] = [
  "teacher", "head_teacher", "inspector", "director", "school_admin", "psychologist", "counselor",
  "social_worker", "nurse", "safeguarding_lead",
];
const isStaff = (p: Participant) => p.roles.some((r) => STAFF.includes(r));
const isGuardian = (p: Participant) => p.roles.includes("guardian_academic") || p.roles.includes("guardian_financial");
const isStudent = (p: Participant) => p.roles.includes("student");

export function canMessage(from: Participant, to: Participant, rel: Relations): { allow: boolean; reason?: string } {
  if (from.id === to.id) return { allow: false, reason: "No puede escribirse a sí mismo" };
  if (isStudent(from) || isStudent(to)) {
    return { allow: false, reason: "Por protección de menores no hay conversaciones privadas con estudiantes; escriba al apoderado" };
  }
  if (isStaff(from) && isStaff(to)) return { allow: true };
  const staff = isStaff(from) ? from : isStaff(to) ? to : undefined;
  const guardian = isGuardian(from) ? from : isGuardian(to) ? to : undefined;
  if (!staff || !guardian) return { allow: false, reason: "Destinatario no permitido" };
  if (staff.roles.some((r) => r === "inspector" || r === "director")) return { allow: true };
  const wardsCourses = (guardian.wards ?? []).map((w) => rel.courseOfStudent(w)).filter(Boolean) as string[];
  const shared = rel.teacherCourses(staff.id).some((c) => wardsCourses.includes(c));
  return shared ? { allow: true } : { allow: false, reason: "Sin vínculo con el curso del estudiante" };
}

export type ContactHours = { startHour: number; endHour: number; weekdays: number[] }; // 1=lunes … 7=domingo

export const DEFAULT_CONTACT_HOURS: ContactHours = { startHour: 8, endHour: 18, weekdays: [1, 2, 3, 4, 5] };

function localParts(d: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(f.find((p) => p.type === "weekday")!.value) + 1;
  const h = Number(f.find((p) => p.type === "hour")!.value) % 24;
  const m = Number(f.find((p) => p.type === "minute")!.value);
  return { wd, minutes: h * 60 + m };
}

/** ¿Se notifica ahora? Si no, cuántos minutos faltan para la próxima apertura del horario. */
export function deliveryWindow(now: Date, timeZone = "America/Santiago", ch: ContactHours = DEFAULT_CONTACT_HOURS) {
  const { wd, minutes } = localParts(now, timeZone);
  const open = ch.startHour * 60;
  const close = ch.endHour * 60;
  if (ch.weekdays.includes(wd) && minutes >= open && minutes < close) return { notifyNow: true, minutesUntil: 0 };
  // Buscar el próximo día hábil a la hora de apertura.
  for (let add = 0; add <= 7; add++) {
    const day = ((wd - 1 + add) % 7) + 1;
    if (!ch.weekdays.includes(day)) continue;
    if (add === 0 && minutes >= open) continue;
    return { notifyNow: false, minutesUntil: add * 1440 + open - minutes };
  }
  return { notifyNow: false, minutesUntil: 0 };
}

export function validateMessage(body: string): string | null {
  const t = body.trim();
  if (t.length < 2) return "El mensaje está vacío";
  if (t.length > 2000) return "El mensaje es demasiado extenso (máximo 2.000 caracteres)";
  return null;
}
