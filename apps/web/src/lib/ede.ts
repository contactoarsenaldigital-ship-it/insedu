import "server-only";
import { buildEdeJson, DELIVERY_DOC_LABEL, localTime, provisionalRefs, requestStatus, subsidyList, weekdayOf, type EdeInput, type EdeRefs } from "@insedu/domain";
import { accountById } from "./accounts";
import { fullName, school } from "./demo";
import { ensureEnrollments } from "./matricula";
import { allStaff, edeDataState, deliveriesState, documentsState, exitsState, findPerson, logbook, meetingsState, pieState, repo, subsidyState, timetableState } from "./store";
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
      const g = r?.guardians[0];
      return { guardian: g?.name ? { name: g.name } : undefined, id: st.id, rut: st.rut, document: r?.document ?? "RUN", firstName: st.firstName, lastName: st.lastName, birthDate: r?.birthDate, sex: r?.sex, address: r?.address, courseId: st.courseId, listNumber: i + 1, schoolNumber: r?.number, enrolledOn: r?.enrolledOn, withdrawnOn: st.withdrawnOn };
    });
  });
  const lessons = repo.subjects().flatMap((x) => repo.lessonsOf(x.id));
  const day = bells().bells;
  const tz = s.timeZone || "America/Santiago";
  // La hora de una anotación es la de su registro en la bitácora (las del colegio ficticio no la tienen).
  const conductTimes = new Map(logbook().filter((e) => e.entity === "anotacion" && e.action === "crear").map((e) => [e.recordId, e.at]));
  return {
    school: { rbd: s.rbd, name: s.name, year },
    courses: s.courses.map((c) => ({ id: c.id, name: c.name, level: c.level, headTeacherId: c.headTeacherId || undefined, capacity: edeDataState().capacities.find((x) => x.courseId === c.id)?.capacity })),
    subjects: repo.subjects().map((x) => ({ id: x.id, courseId: x.courseId, name: x.name, teacherId: x.teacherId || undefined })),
    students,
    staff: allStaff().map((p) => ({
      id: p.id, name: p.name, rut: p.id.startsWith("acc-") ? accountById(p.id)?.rut : undefined,
      degrees: edeDataState().degrees.filter((d) => d.personId === p.id).map((d) => ({ title: d.title, institution: d.institution, awardDate: d.awardDate, idoneidad: d.idoneidad })),
    })),
    institutional: deliveriesState().institutional.map((d) => ({
      id: d.id, title: d.title, publishedAt: d.at, by: d.by, docIds: documentsState().filter((x) => x.ownerKind === "institucional" && x.ownerId === d.id).map((x) => x.id),
      acks: (d.acknowledgements ?? []).flatMap((a) => a.wardIds.map((studentId) => ({ studentId, name: findPerson(a.personId)?.name ?? "", at: a.at }))),
    })),
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
    pickups: exitsState().pickups.filter((p) => !p.revokedAt).map((p) => ({ studentId: p.studentId, name: p.name, rut: p.rut })),
    exits: exitsState().exits.map((e) => ({
      id: e.id, studentId: e.studentId, courseId: e.courseId, date: e.date, exitTime: e.exitTime, subjectId: subjectAt(e.courseId, e.date, e.exitTime), reason: e.reason,
      pickup: { name: e.pickupName, rut: e.pickupRut, authorized: !!e.pickupAuthId }, by: e.by, signedAt: e.staffSignature?.at, signatureKey: e.staffSignature?.key,
      docIds: [...(e.signature ? [`firma-salida:${e.id}`] : []), ...attached("salida", e.id)],
    })),
    deliveries: deliveriesState().requests.filter((r) => r.delivery && requestStatus(r) === "entregada").map((r) => {
      const d = r.delivery!;
      const confirmer = d.confirmedBy ? findPerson(d.confirmedBy) : undefined;
      const receiver = d.medium === "electronico"
        ? { name: confirmer?.name ?? r.requester.name, kind: confirmer?.roles.includes("student") ? "estudiante" as const : confirmer?.roles.includes("guardian_academic") ? "apoderado" as const : "otro" as const }
        : { name: d.receivedBy ?? r.requester.name, rut: d.receivedRut, kind: r.requester.kind };
      const roles = findPerson(d.by)?.roles ?? [];
      return {
        id: r.id, studentId: r.studentId, courseId: r.courseId, on: d.on, time: localTime(d.at, tz), documents: r.documents.map((k) => (k === "otro" && r.other ? r.other : DELIVERY_DOC_LABEL[k])).join("; "),
        receiver, by: d.by, byKind: roles.some((x) => x === "teacher" || x === "head_teacher") ? "docente" as const : roles.includes("school_admin") ? "administrativo" as const : "profesional" as const,
        signedAt: d.staffSignature?.at, signatureKey: d.staffSignature?.key, docIds: [...(d.signature ? [`firma-entrega:${r.id}`] : []), ...attached("entrega", r.id)],
      };
    }),
    pie: pieState().students.map((p) => ({ studentId: p.id, since: p.since, until: p.until })),
    documents: { ...signatureImages(), ...(documents ?? Object.fromEntries(blobDocIds().map((id) => [id, "(sin cargar)"]))) },
    suspensions: subsidyState().events.filter((e) => e.kind === "suspension").map((e) => ({ id: e.id, date: e.date, reason: e.reason, authorization: e.authorization })),
    exportedAt: new Date().toISOString(),
    timeZone: s.timeZone || "America/Santiago",
  };
}

/** Documentos escaneados adjuntos a un registro. */
const attached = (kind: "salida" | "entrega", ownerId: string) => documentsState().filter((d) => d.ownerKind === kind && d.ownerId === ownerId).map((d) => d.id);

/** Documentos cifrados que el archivo incluye: actas, poderes y comprobantes. */
const blobDocIds = () => [
  ...meetingsState().flatMap((m) => actasOf(m.id)).map((d) => d.id),
  ...documentsState().filter((d) => d.ownerKind === "salida" || d.ownerKind === "entrega" || d.ownerKind === "institucional").map((d) => d.id),
];

/** Firmas en pantalla (PNG) de quien retira o recibe, en base64. */
function signatureImages(): Record<string, string> {
  const b64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Object.fromEntries([
    ...exitsState().exits.filter((e) => e.signature).map((e) => [`firma-salida:${e.id}`, b64(e.signature!)]),
    ...deliveriesState().requests.filter((r) => r.delivery?.signature).map((r) => [`firma-entrega:${r.id}`, b64(r.delivery!.signature!)]),
  ]);
}

/** Asignatura que el curso tiene a esa hora según el horario, para el evento de salida de la clase. */
function subjectAt(courseId: string, date: string, time: string): string | undefined {
  const weekday = weekdayOf(date);
  const day = bells().bells;
  return timetableState().slots.find((x) => {
    const b = day.find((p) => p.number === x.period);
    return x.weekday === weekday && repo.subject(x.subjectId)?.courseId === courseId && !!b && b.start <= time && time < b.end;
  })?.subjectId;
}

export function edeExport(documents?: Record<string, string | undefined>) {
  const { refs, provisional } = edeRefs();
  const out = buildEdeJson(edeInput(documents), refs);
  if (provisional) out.issues.unshift({ severity: "error", message: "Se usan códigos provisionales deducidos de las reglas del validador: el archivo sirve para revisar la estructura, no para entregarlo" });
  return out;
}

/** Contenido de las actas de entrevistas y reuniones, para el archivo que se entrega. */
export async function edeDocuments(): Promise<Record<string, string | undefined>> {
  const ids = blobDocIds();
  const out: Record<string, string | undefined> = {};
  for (const id of ids) out[id] = (await getBlob(id).catch(() => null))?.toString("base64");
  return out;
}
