import "server-only";
import { createHash } from "node:crypto";
import { subsidySnapshot, safeFileName, type DocumentOwnerKind, type GuardianMeeting, type InstitutionalKind, computeDv, DEFAULT_BELLS, blocksOn, WEEKDAYS, mulberry32, uuidv7, withOffset, type DegreeType, type DegreeVerification, type DisciplinaryMeasureType, type LessonSignature, type LessonStatus } from "@insedu/domain";
import { activeStudents, school } from "./demo";
import { appendEvent } from "@insedu/domain/server";
import { ensureEnrollments } from "./matricula";
import { courseSheet, subsidyMonths, subsidyToday } from "./subvenciones";
import { deliveriesState, documentsState, edeDataState, exitsState, logbook, meetingsState, repo, STAFF, subsidyState, timetableState } from "./store";

/**
 * Registros ficticios de la demostración para que la exportación al EDE se vea completa: horario, clases firmadas,
 * firma de la asistencia diaria, títulos, capacidad y medidas. Se siembran junto con el colegio, así que el
 * reinicio de la demostración los restaura. Los RUN usan el mismo rango ficticio que los estudiantes.
 */

/** PDF de ejemplo que acompaña cada matrícula definitiva ficticia. */
export const DEMO_ENROLLMENT_SCAN = "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxMzAgPj4Kc3RyZWFtCkJUIC9GMSAxNiBUZiA2MCA3NjAgVGQgKEZpY2hhIGRlIG1hdHJpY3VsYSAtIERFTU9TVFJBQ0lPTikgVGogMCAtMjggVGQgL0YxIDEyIFRmIChEb2N1bWVudG8gZGUgZWplbXBsbyBjb24gZGF0b3MgZmljdGljaW9zLikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDA0MjIgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0OTIKJSVFT0YK";
const DEMO_SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALQAAAA4CAMAAABjYSKjAAAABlBMVEX///8UKGRZb9M5AAAAAnRSTlMA/1uRIrUAAAFJSURBVHja7VjbrsMgDMP//9NH06QjMijYIdtUzX6Z1hZwcMiF1gzDMAzDMIxfBh64I+d/1riFCUDPGuBYf9k09KxBkn75Ch/W57ka+h+CQPwqK0/aztctfvzbEoi2iZYWyDOs3D9cDwo+JVjaNH2uOUfDN3N1gkR5IJBGBen902t1QFsafSoZhC7GrOeaB0jO0qAScXwEcsu5rlIRNwhjjC0i3UjSCUsBRR+J22qulaXYh+jxPGq7hgzp40FjuL4BaerNckDLrFLpOGrUxTvXZ3wg4x+7435CGnQ0FP0DycAmpB0mrkmkybQXleYGQcrwNQd0WkrpyfokV1eWRYmitagApThP24NG15/TnJ0jLTnaIDFTSiLXiVG71pT10U573oNOMLQafPeqbVpdYz42Rp/dtIIrGdrRvn3bNFPa14yGYRiGYRi3wx+dpwQp/w4LWwAAAABJRU5ErkJggg==";

const DEMO_FILE_PREFIX = "demo-file-";
export const isDemoFile = (id: string) => id.startsWith(DEMO_FILE_PREFIX);

/** PDF de ejemplo con el nombre del documento. Se genera al descargarlo, así que no ocupa espacio ni hay que borrarlo al reiniciar. */
export function demoPdf(title: string): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, "\\$&");
  const text = `BT /F1 16 Tf 60 740 Td (${esc("INSEDU · Documento de demostración")}) Tj 0 -30 Td /F1 12 Tf (${esc(title.slice(0, 80))}) Tj 0 -22 Td (Datos ficticios, sin validez legal.) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = objects.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

function attach(ownerKind: DocumentOwnerKind, ownerId: string, label: string, by: string, at: string, courseId?: string) {
  const content = demoPdf(label);
  documentsState().push({ id: `${DEMO_FILE_PREFIX}${uuidv7()}`, ownerKind, ownerId, courseId, label, fileName: safeFileName(label, "application/pdf"), mime: "application/pdf", size: content.length, sha256: createHash("sha256").update(content).digest("hex"), by, at });
}

export function demoStaffRut(staffId: string): string | undefined {
  const i = STAFF.findIndex((p) => p.id === staffId);
  if (i < 0) return undefined;
  const body = 46_950_000 + (i + 1) * 3_571;
  return `${body}${computeDv(body)}`;
}

type Degree = { title: string; institution: string; awardDate: string; degreeType: DegreeType; accredited: boolean; verification: DegreeVerification };
const DEGREES: Record<string, Degree> = {
  "teacher-1": { title: "Profesora de Matemática", institution: "Universidad Ficticia del Maipo", awardDate: "2011-12-16", degreeType: "profesional", accredited: true, verification: "copia_titulo" },
  "teacher-2": { title: "Profesor de Lenguaje y Comunicación", institution: "Universidad Ficticia Central", awardDate: "2013-07-05", degreeType: "profesional", accredited: true, verification: "copia_titulo" },
  "teacher-3": { title: "Profesora de Historia y Ciencias Sociales", institution: "Universidad Ficticia del Maipo", awardDate: "2009-12-18", degreeType: "profesional", accredited: true, verification: "certificado_oficial" },
  "teacher-4": { title: "Profesor de Inglés", institution: "Instituto Profesional Ficticio del Sur", awardDate: "2015-08-14", degreeType: "profesional", accredited: true, verification: "copia_titulo" },
  "inspector-1": { title: "Profesora de Educación General Básica", institution: "Universidad Ficticia Central", awardDate: "2004-12-17", degreeType: "profesional", accredited: true, verification: "copia_titulo" },
  "director-1": { title: "Magíster en Gestión Educacional", institution: "Universidad Ficticia del Maipo", awardDate: "2012-01-13", degreeType: "magister", accredited: true, verification: "certificado_oficial" },
  "psych-1": { title: "Psicóloga", institution: "Universidad Ficticia Central", awardDate: "2014-12-19", degreeType: "profesional", accredited: true, verification: "copia_titulo" },
  "pie-1": { title: "Educadora Diferencial", institution: "Universidad Ficticia del Maipo", awardDate: "2016-12-16", degreeType: "profesional", accredited: true, verification: "copia_titulo" },
  "sg-2": { title: "Orientador Educacional", institution: "Instituto Profesional Ficticio del Sur", awardDate: "2010-07-09", degreeType: "profesional", accredited: true, verification: "copia_titulo" },
};

const LESSON_TOPICS: Record<string, [string, string][]> = {
  Lenguaje: [["Comprender textos narrativos", "Lectura guiada y preguntas de inferencia"], ["Escribir textos argumentativos", "Planificación y borrador de una columna de opinión"]],
  Matemática: [["Resolver problemas con fracciones", "Ejercicios guiados y revisión en la pizarra"], ["Interpretar gráficos y tablas", "Análisis de datos en parejas"]],
  Historia: [["Analizar procesos históricos de Chile", "Lectura de fuentes y línea de tiempo"], ["Reconocer derechos ciudadanos", "Debate en grupos y puesta en común"]],
  Ciencias: [["Explicar el funcionamiento de los ecosistemas", "Experiencia práctica y registro de observaciones"], ["Describir cambios de la materia", "Demostración y guía de trabajo"]],
  Inglés: [["Comprender conversaciones breves", "Audio y actividad de comprensión"], ["Producir textos cortos", "Redacción de un correo informal"]],
  "Ed. Física": [["Mejorar la condición física", "Circuito de resistencia y elongación"], ["Practicar deportes colectivos", "Juego reducido y trabajo en equipo"]],
};

const MEASURES: DisciplinaryMeasureType[] = ["dialogo_formativo", "amonestacion_verbal", "citacion_apoderado"];

/** Instante UTC de una hora local de Chile en esa fecha. */
function localInstant(date: string, time: string): string {
  const offset = withOffset(`${date}T12:00:00Z`, "America/Santiago").slice(19);
  return new Date(`${date}T${time}:00${offset}`).toISOString();
}

const minusMinutes = (time: string, minutes: number) => {
  const [h, m] = time.split(":").map(Number);
  const total = h! * 60 + m! - minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** Un retiro de matrícula, un excedente y una suspensión de clases, coherentes con la asistencia y las notas. */
function seedCases(): string {
  const s = school();
  const day = (n: number) => s.schoolDays[Math.max(0, s.schoolDays.length - 1 - n)]!;
  const records = new Map(ensureEnrollments().map((r) => [r.id, r]));
  const adminAt = (date: string) => localInstant(date, "11:00");

  const leaving = s.students.filter((x) => x.courseId === "course-3")[10]!;
  const leftOn = day(20);
  leaving.withdrawnOn = leftOn;
  const after = (studentId: string, date: string) => studentId === leaving.id && date > leftOn;
  s.attendance = s.attendance.filter((a) => !after(a.studentId, a.date));
  s.grades = s.grades.filter((g) => !after(g.studentId, g.date));
  s.conduct = s.conduct.filter((c) => !after(c.studentId, c.date));
  const leavingRecord = records.get(leaving.id)!;
  leavingRecord.withdrawal = { date: leftOn, reason: "traslado", detail: "Traslado a otro establecimiento por cambio de domicilio de la familia.", evidence: "Declaración del apoderado N° 12, archivada en secretaría", by: "admin-1", at: adminAt(leftOn) };
  leavingRecord.notes.push({ at: adminAt(leftOn), by: "admin-1", text: "Se entregó al apoderado el certificado de traslado." });

  const surplus = records.get(s.students.filter((x) => x.courseId === "course-4")[5]!.id)!;
  surplus.condition = "excedente";
  surplus.resolution = "Resolución Exenta N° 2145 de la Seremi (ficticia)";

  let n = 14;
  while (s.grades.some((g) => g.date === day(n))) n++;
  const suspended = day(n);
  s.attendance = s.attendance.filter((a) => a.date !== suspended);
  s.conduct = s.conduct.filter((c) => c.date !== suspended);
  const { events } = subsidyState();
  const rexDate = day(n + 1);
  events.push({ id: uuidv7(), date: suspended, kind: "suspension", reason: "Corte programado de agua en el sector", authorization: "Resolución Exenta N° 1876 de la Seremi (ficticia)", recovery: "Sábado siguiente, calendario aprobado", rexNumber: "1876", rexDate, rexScanned: true, by: "director-1", at: adminAt(rexDate) });
  events.push({ id: uuidv7(), date: day(6), courseId: "course-2", kind: "cambio_actividad", reason: "Visita pedagógica al museo", authorization: "Aviso al Departamento Provincial N° 88 (ficticio)", by: "director-1", at: adminAt(day(8)) });
  return suspended;
}

export function seedEdeDemo() {
  const suspended = seedCases();
  const s = school();
  const r = mulberry32(4242);
  const key = () => String(100000 + Math.floor(r() * 900000));
  const seal = (by: string, at: string): LessonSignature => ({ by, at, method: "interno", rut: demoStaffRut(by), key: key() });
  const seededAt = localInstant(s.schoolDays[0]!, "08:00");

  // Capacidad y títulos
  const data = edeDataState();
  for (const c of s.courses) data.capacities.push({ id: uuidv7(), courseId: c.id, capacity: 40, by: "admin-1", at: seededAt });
  for (const [personId, d] of Object.entries(DEGREES)) data.degrees.push({ id: uuidv7(), personId, idoneidad: false, by: "admin-1", at: seededAt, ...d });

  // Horario
  const timetable = timetableState();
  timetable.bells.push(...DEFAULT_BELLS);
  // Cada curso toma en cada bloque a un docente distinto, así nadie queda en dos cursos a la vez y toda asignatura tiene horario.
  const teachers = [...new Set(repo.subjects().map((x) => x.teacherId))];
  s.courses.forEach((c, ci) => {
    for (const weekday of WEEKDAYS) {
      for (let pair = 0; pair * 2 < DEFAULT_BELLS.length; pair++) {
        const teacher = teachers[(ci + weekday + pair) % teachers.length];
        const options = repo.subjects().filter((x) => x.courseId === c.id && x.teacherId === teacher);
        const subject = options[weekday % options.length]!;
        for (const b of DEFAULT_BELLS.slice(pair * 2, pair * 2 + 2)) timetable.slots.push({ id: uuidv7(), courseId: c.id, subjectId: subject.id, weekday, period: b.number });
      }
    }
  });

  // Clases firmadas y asistencia diaria firmada: mismo estado que el registro diario
  const status = new Map(s.attendance.map((a) => [`${a.studentId}|${a.date}`, a.status as LessonStatus]));
  for (const date of s.schoolDays) {
    if (date === suspended) continue;
    for (const c of s.courses) {
      // Quien se retiró sigue en las listas hasta el día de su baja.
      const pupils = s.students.filter((x) => x.courseId === c.id && (!x.withdrawnOn || date <= x.withdrawnOn));
      data.dailySignatures.push({ id: uuidv7(), courseId: c.id, date, by: c.headTeacherId, at: localInstant(date, "09:25"), key: key() });
      for (const subject of repo.subjects().filter((x) => x.courseId === c.id)) {
        for (const block of blocksOn(timetable.slots, subject.id, date)) {
          const last = DEFAULT_BELLS.find((b) => b.number === Number(block.split("-").at(-1)))!;
          const at = localInstant(date, minusMinutes(last.end, 10));
          const topics = LESSON_TOPICS[subject.name] ?? [["Desarrollar habilidades de la asignatura", "Trabajo guiado en clases"]];
          const [objective, content] = topics[Math.floor(r() * topics.length)]!;
          repo.addLesson({
            subjectId: subject.id, courseId: c.id, date, block, objective, content, teacherId: subject.teacherId,
            attendance: Object.fromEntries(pupils.map((p) => [p.id, status.get(`${p.id}|${date}`) ?? "present"])),
            signedAt: at, signature: seal(subject.teacherId, at),
          });
        }
      }
    }
  }

  // Evaluaciones y anotaciones firmadas
  for (const subject of repo.subjects()) {
    for (const e of repo.evaluationsOf(subject.id)) e.signature = seal(subject.teacherId, localInstant(e.date, "16:00"));
  }
  for (const c of s.conduct) {
    const at = localInstant(c.date, "13:10");
    c.time = "10:15:00";
    c.signature = seal(c.recordedBy, at);
    if (c.kind === "negative") {
      c.article = "Art. 12 del Reglamento Interno";
      c.measures = [{ id: uuidv7(), type: MEASURES[Math.floor(r() * MEASURES.length)]!, detail: "Medida formativa conversada con el estudiante.", from: c.date, by: c.recordedBy, at }];
    }
  }

  // Salidas firmadas, al comienzo de un bloque: fn5E0 no admite un retiro en plena clase dentro de los totales de asistencia.
  const exitTimes = ["09:45", "11:30", "14:00"];
  exitsState().exits.forEach((e, i) => {
    e.exitTime = exitTimes[i % exitTimes.length]!;
    e.signature = DEMO_SIGNATURE;
    e.staffSignature = seal(e.by, localInstant(e.date, e.exitTime));
  });

  seedCommunity(seal);
  seedDeclarations();
  seedLogbook();
}

/** Declaraciones de asistencia de los meses ya cerrados. */
function seedDeclarations() {
  const today = subsidyToday();
  const courses = school().courses;
  for (const month of subsidyMonths().filter((m) => m < today.slice(0, 7))) {
    const [y, m] = month.split("-").map(Number);
    const declaredOn = new Date(Date.UTC(y!, m!, 5, 12)).toISOString().slice(0, 10);
    subsidyState().declarations.push({
      id: uuidv7(), month, declaredOn, certificate: `Certificado SIGE N° ${48_000 + m! * 13} (ficticio)`,
      snapshot: Object.fromEntries(courses.map((c) => [c.id, subsidySnapshot(courseSheet(c.id, month))])), by: "admin-1", at: localInstant(declaredOn, "12:00"),
    });
  }
}

/** Actividad reciente en la bitácora, con la fecha real de cada registro. */
function seedLogbook() {
  const lessons = repo.subjects().flatMap((x) => repo.lessonsOf(x.id)).filter((l) => l.signature).sort((a, b) => b.signature!.at.localeCompare(a.signature!.at)).slice(0, 24);
  const entries = [
    ...lessons.map((l) => ({ at: l.signature!.at, input: { actor: l.teacherId, action: "firmar" as const, entity: "clase", recordId: l.id, courseId: l.courseId, after: { fecha: l.date, bloque: l.block } } })),
    ...meetingsState().map((m) => ({ at: m.at, input: { actor: m.by, action: "firmar" as const, entity: "entrevista", recordId: m.id, courseId: m.courseId, after: { fecha: m.date } } })),
    ...subsidyState().declarations.map((d) => ({ at: d.at, input: { actor: d.by, action: "crear" as const, entity: "declaracion_asistencia", recordId: d.id, after: { month: d.month, declaredOn: d.declaredOn } } })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  for (const e of entries) appendEvent(logbook(), e.input, uuidv7(), e.at);
}

const INTERVIEWS: [string, string][] = [
  ["Seguimiento de la asistencia del estudiante y causas de sus inasistencias recientes.", "El apoderado avisará las ausencias el mismo día. Nueva revisión en un mes."],
  ["Rendimiento en Matemática y Lenguaje durante el semestre.", "Reforzamiento los martes y control de tareas en casa."],
  ["Convivencia escolar y relación con sus compañeros de curso.", "Acompañamiento de orientación y conversación semanal con el profesor jefe."],
];
const MEETING_AGENDAS: [string, string][] = [
  ["Resultados del semestre, calendario de evaluaciones y actividades del curso.", "Se aprueba el calendario y se elige la comisión de la salida pedagógica."],
  ["Plan de convivencia, asistencia del curso y preparación del cierre de año.", "El curso refuerza la puntualidad y organiza la jornada de cierre."],
];
const INSTITUTIONAL: [InstitutionalKind, string][] = [
  ["reglamento_interno", "Reglamento Interno y de Convivencia Escolar"],
  ["evaluacion_promocion", "Reglamento de Evaluación, Calificación y Promoción"],
  ["pei", "Proyecto Educativo Institucional"],
  ["pise", "Plan Integral de Seguridad Escolar"],
];

/** Entrevistas, reuniones, entregas de documentos e instrumentos, con sus actas y comprobantes de ejemplo. */
function seedCommunity(seal: (by: string, at: string) => LessonSignature) {
  const s = school();
  const records = new Map(ensureEnrollments().map((r) => [r.id, r]));
  const guardian = (id: string) => records.get(id)!.guardians[0]!;
  const day = (n: number) => s.schoolDays[Math.max(0, s.schoolDays.length - 1 - n)]!;
  const year = s.schoolDays[0]!.slice(0, 4);
  const addMeeting = (m: Omit<GuardianMeeting, "id" | "signature" | "at">, signedAt: string, label: string) => {
    const meeting: GuardianMeeting = { ...m, id: uuidv7(), signature: seal(m.by, signedAt), at: signedAt };
    meetingsState().push(meeting);
    attach("entrevista", meeting.id, label, m.by, signedAt, m.courseId);
  };

  s.courses.forEach((c, ci) => {
    const pupils = activeStudents().filter((x) => x.courseId === c.id);
    INTERVIEWS.forEach(([topics, agreements], i) => {
      const student = pupils[(i * 7 + ci * 3 + 2) % pupils.length]!;
      const g = guardian(student.id);
      const date = day(ci * 2 + i * 6 + 1);
      addMeeting({ kind: "entrevista", courseId: c.id, studentId: student.id, date, time: "16:30", topics, agreements, attendees: [{ studentId: student.id, name: g.name, rut: g.rut, relation: "titular" }], by: i === 2 ? "psych-1" : c.headTeacherId },
        localInstant(date, "17:10"), `Acta firmada de entrevista del ${date}`);
    });
    const [topics, agreements] = MEETING_AGENDAS[ci % MEETING_AGENDAS.length]!;
    const date = day(8 + ci);
    addMeeting({ kind: "reunion", courseId: c.id, date, time: "19:00", topics, agreements, attendees: pupils.filter((_, i) => i % 6 !== 5).map((p) => ({ studentId: p.id, name: guardian(p.id).name, rut: guardian(p.id).rut, relation: "titular" as const })), by: c.headTeacherId },
      localInstant(date, "20:15"), `Acta firmada de reunión de apoderados del ${date}`);
  });

  const { requests, institutional } = deliveriesState();
  const pupils = activeStudents();
  const request = (i: number, n: number, documents: typeof requests[number]["documents"], requestedOn: string) => {
    const student = pupils[(i * 17 + 3) % pupils.length]!;
    const g = guardian(student.id);
    return { id: uuidv7(), folio: n, studentId: student.id, courseId: student.courseId, requester: { kind: "apoderado" as const, name: g.name, rut: g.rut, personId: `guardian-of-${student.id}` }, requestedOn, documents, by: "admin-1", at: localInstant(requestedOn, "10:00") };
  };
  const deliveredAt = (on: string) => localInstant(on, "11:30");

  const signed = request(0, 1, ["logros"], day(22));
  requests.push({ ...signed, delivery: { on: day(20), medium: "papel", receivedBy: signed.requester.name, receivedRut: signed.requester.rut, signature: DEMO_SIGNATURE, by: "admin-1", at: deliveredAt(day(20)), staffSignature: seal("admin-1", deliveredAt(day(20))) } });

  const onPaper = request(1, 2, ["personalidad"], day(16));
  requests.push({ ...onPaper, delivery: { on: day(15), medium: "papel", receivedBy: onPaper.requester.name, receivedRut: onPaper.requester.rut, paperEvidence: "Recepción conforme archivada en secretaría", by: "admin-1", at: deliveredAt(day(15)), staffSignature: seal("admin-1", deliveredAt(day(15))) } });
  attach("entrega", onPaper.id, "Recepción conforme firmada", "admin-1", deliveredAt(day(15)), onPaper.courseId);

  const online = request(2, 3, ["promocion", "logros"], day(10));
  requests.push({ ...online, delivery: { on: day(9), medium: "electronico", confirmedAt: localInstant(day(8), "20:30"), confirmedBy: online.requester.personId, by: "admin-1", at: deliveredAt(day(9)), staffSignature: seal("admin-1", deliveredAt(day(9))) } });
  attach("entrega", online.id, "Certificado de promoción y de logros", "admin-1", deliveredAt(day(9)), online.courseId);

  const waiting = request(3, 4, ["evaluacion"], day(5));
  requests.push({ ...waiting, delivery: { on: day(3), medium: "electronico", by: "admin-1", at: deliveredAt(day(3)), staffSignature: seal("admin-1", deliveredAt(day(3))) } });
  attach("entrega", waiting.id, "Informe de evaluación", "admin-1", deliveredAt(day(3)), waiting.courseId);

  requests.push(request(4, 5, ["promocion"], day(1)));
  const dropped = request(5, 6, ["otro"], day(12));
  requests.push({ ...dropped, other: "Copia del informe de notas", withdrawn: { reason: "El apoderado ya obtuvo la copia desde su cuenta.", by: "admin-1", at: localInstant(day(11), "12:00") } });

  // Quien se retiró recibe los documentos para continuar sus estudios.
  for (const gone of s.students.filter((x) => x.withdrawnOn)) {
    const g = guardian(gone.id);
    const at = deliveredAt(gone.withdrawnOn!);
    requests.push({ id: uuidv7(), folio: requests.length + 1, studentId: gone.id, courseId: gone.courseId, requester: { kind: "apoderado", name: g.name, rut: g.rut, personId: `guardian-of-${gone.id}` }, requestedOn: gone.withdrawnOn!, documents: ["logros", "personalidad"], by: "admin-1", at, delivery: { on: gone.withdrawnOn!, medium: "papel", receivedBy: g.name, receivedRut: g.rut, signature: DEMO_SIGNATURE, by: "admin-1", at, staffSignature: seal("admin-1", at) } });
  }

  const publishedAt = localInstant(s.schoolDays[0]!, "09:00");
  INSTITUTIONAL.forEach(([kind, title], k) => {
    const id = uuidv7();
    // El apoderado de la demostración queda sin confirmar, para mostrar la confirmación en vivo.
    const acknowledgements = pupils.filter((p, i) => p.id !== "student-001" && i % 5 !== k % 5).map((p, i) => ({ personId: `guardian-of-${p.id}`, wardIds: [p.id], at: localInstant(day(40 - (i % 20)), "20:00") }));
    institutional.push({ id, kind, title, version: `${year}-03-02`, where: "Secretaría del establecimiento y portal INSEDU", by: "admin-1", at: publishedAt, acknowledgements });
    attach("institucional", id, `${title} ${year}`, "admin-1", publishedAt);
  });
}
