import "server-only";
import { buildEdeJson, localTime, provisionalRefs, subsidyList, type EdeInput, type EdeRefs } from "@insedu/domain";
import { accountById } from "./accounts";
import { fullName, school } from "./demo";
import { ensureEnrollments } from "./matricula";
import { allStaff, logbook, meetingsState, repo, subsidyState, timetableState } from "./store";
import { actasOf, isTeacher } from "./entrevistas";
import { bells, signatureWarning } from "./horario";
import { getBlob } from "./documentos";

/**
 * Exportación al EDE con los datos del establecimiento. Mientras no se genere el diccionario oficial de
 * códigos desde la base del validador, se usan los códigos provisionales y el informe lo advierte.
 */
const OFFICIAL_REFS: EdeRefs = {};

export const edeRefs = (): { refs: EdeRefs; provisional: boolean } =>
  Object.keys(OFFICIAL_REFS).length ? { refs: OFFICIAL_REFS, provisional: false } : { refs: provisionalRefs(), provisional: true };

/** documents: contenido base64 de las actas. Sin él (informe en pantalla) basta saber que el acta existe. */
export function edeInput(documents?: Record<string, string | undefined>): EdeInput {
  const s = school();
  const records = new Map(ensureEnrollments().map((r) => [r.id, r]));
  const year = (s.schoolDays[0] ?? new Date().toISOString()).slice(0, 4);
  const students = s.courses.flatMap((c) => {
    const inCourse = s.students.filter((st) => st.courseId === c.id);
    const order = subsidyList(inCourse.map((st) => ({ id: st.id, name: fullName(st), enrolledOn: records.get(st.id)?.enrolledOn, withdrawnOn: st.withdrawnOn, surplus: false })), s.schoolDays[0]);
    return order.map((o, i) => {
      const st = inCourse.find((x) => x.id === o.id)!;
      const r = records.get(st.id);
      return { id: st.id, rut: st.rut, document: r?.document ?? "RUN", firstName: st.firstName, lastName: st.lastName, birthDate: r?.birthDate, sex: r?.sex, address: r?.address, courseId: st.courseId, listNumber: i + 1, schoolNumber: r?.number, enrolledOn: r?.enrolledOn, withdrawnOn: st.withdrawnOn };
    });
  });
  const lessons = repo.subjects().flatMap((x) => repo.lessonsOf(x.id));
  const day = bells().bells;
  const tz = s.timeZone || "America/Santiago";
  // La hora de una anotación es la de su registro en la bitácora (las del colegio ficticio no la tienen).
  const conductTimes = new Map(logbook().filter((e) => e.entity === "anotacion" && e.action === "crear").map((e) => [e.recordId, e.at]));
  return {
    school: { rbd: s.rbd, name: s.name, year },
    courses: s.courses.map((c) => ({ id: c.id, name: c.name, level: c.level, headTeacherId: c.headTeacherId || undefined })),
    subjects: repo.subjects().map((x) => ({ id: x.id, courseId: x.courseId, name: x.name, teacherId: x.teacherId || undefined })),
    students,
    staff: allStaff().map((p) => ({ id: p.id, name: p.name, rut: p.id.startsWith("acc-") ? accountById(p.id)?.rut : undefined })),
    daily: s.attendance.map((a) => ({ studentId: a.studentId, date: a.date, status: a.status })),
    lessons: lessons.map((l) => {
      const signedAt = l.signature?.at ?? l.signedAt;
      return { id: l.id, subjectId: l.subjectId, date: l.date, attendance: l.attendance, signedAt, signerId: l.signature?.by, signatureKey: l.signature?.key, withinSchedule: signedAt ? !signatureWarning(l.subjectId, l.date, l.block, signedAt) : undefined };
    }),
    schedule: timetableState().slots.flatMap((x) => {
      const b = day.find((p) => p.number === x.period);
      return b ? [{ subjectId: x.subjectId, weekday: x.weekday, period: x.period, start: b.start, end: b.end }] : [];
    }),
    evaluations: repo.subjects().flatMap((x) => repo.evaluationsOf(x.id)).map((e) => ({ id: e.id, subjectId: e.subjectId, title: e.title, date: e.date, weight: e.weight, signedAt: e.signature?.at, signerId: e.signature?.by, signatureKey: e.signature?.key })),
    grades: repo.subjects().flatMap((x) => repo.gradesOf(x.id)).map((g) => ({ evaluationId: g.evaluationId, studentId: g.studentId, value: g.value })),
    conduct: s.conduct.map((c) => {
      const at = conductTimes.get(c.id);
      return { id: c.id, studentId: c.studentId, date: c.date, time: at ? localTime(at, tz).concat(":00") : undefined, kind: c.kind, severity: c.severity, description: c.description, recordedBy: c.recordedBy, article: c.article, measures: c.measures?.map((m) => ({ id: m.id, type: m.type, from: m.from, to: m.to })), signedAt: c.signature?.at, signatureKey: c.signature?.key };
    }),
    meetings: meetingsState().map((m) => ({
      id: m.id, kind: m.kind, courseId: m.courseId, studentId: m.studentId, date: m.date, time: m.time, description: `${m.topics}\nAcuerdos: ${m.agreements}`,
      by: m.by, byTeacher: isTeacher(m.by), signedAt: m.signature.at, signatureKey: m.signature.key,
      attendees: m.attendees.map((a) => ({ studentId: a.studentId, name: a.name, rut: a.rut })), actaIds: actasOf(m.id).map((d) => d.id),
    })),
    documents: documents ?? Object.fromEntries(meetingsState().flatMap((m) => actasOf(m.id)).map((d) => [d.id, "(sin cargar)"])),
    suspensions: subsidyState().events.filter((e) => e.kind === "suspension").map((e) => ({ id: e.id, date: e.date, reason: e.reason, authorization: e.authorization })),
    exportedAt: new Date().toISOString(),
    timeZone: s.timeZone || "America/Santiago",
  };
}

export function edeExport(documents?: Record<string, string | undefined>) {
  const { refs, provisional } = edeRefs();
  const out = buildEdeJson(edeInput(documents), refs);
  if (provisional) out.issues.unshift({ severity: "error", message: "Se usan códigos provisionales deducidos de las reglas del validador: el archivo sirve para revisar la estructura, no para entregarlo" });
  return out;
}

/** Contenido de las actas de entrevistas y reuniones, para el archivo que se entrega. */
export async function edeDocuments(): Promise<Record<string, string | undefined>> {
  const ids = meetingsState().flatMap((m) => actasOf(m.id)).map((d) => d.id);
  const out: Record<string, string | undefined> = {};
  for (const id of ids) out[id] = (await getBlob(id).catch(() => null))?.toString("base64");
  return out;
}
