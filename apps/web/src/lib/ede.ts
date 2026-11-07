import "server-only";
import { buildEdeJson, provisionalRefs, subsidyList, type EdeInput, type EdeRefs } from "@insedu/domain";
import { accountById } from "./accounts";
import { fullName, school } from "./demo";
import { ensureEnrollments } from "./matricula";
import { allStaff, repo, subsidyState, timetableState } from "./store";
import { bells, signatureWarning } from "./horario";

/**
 * Exportación al EDE con los datos del establecimiento. Mientras no se genere el diccionario oficial de
 * códigos desde la base del validador, se usan los códigos provisionales y el informe lo advierte.
 */
const OFFICIAL_REFS: EdeRefs = {};

export const edeRefs = (): { refs: EdeRefs; provisional: boolean } =>
  Object.keys(OFFICIAL_REFS).length ? { refs: OFFICIAL_REFS, provisional: false } : { refs: provisionalRefs(), provisional: true };

export function edeInput(): EdeInput {
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
  return {
    school: { rbd: s.rbd, name: s.name, year },
    courses: s.courses.map((c) => ({ id: c.id, name: c.name, headTeacherId: c.headTeacherId || undefined })),
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
    suspensions: subsidyState().events.filter((e) => e.kind === "suspension").map((e) => ({ id: e.id, date: e.date, reason: e.reason, authorization: e.authorization })),
    exportedAt: new Date().toISOString(),
    timeZone: s.timeZone || "America/Santiago",
  };
}

export function edeExport() {
  const { refs, provisional } = edeRefs();
  const out = buildEdeJson(edeInput(), refs);
  if (provisional) out.issues.unshift({ severity: "error", message: "Se usan códigos provisionales deducidos de las reglas del validador: el archivo sirve para revisar la estructura, no para entregarlo" });
  return out;
}
