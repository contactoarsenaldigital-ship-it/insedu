import "server-only";
import { computeDv, DEFAULT_BELLS, blocksOn, WEEKDAYS, mulberry32, uuidv7, withOffset, type DegreeType, type DegreeVerification, type DisciplinaryMeasureType, type LessonSignature, type LessonStatus } from "@insedu/domain";
import { activeStudents, school } from "./demo";
import { edeDataState, exitsState, repo, STAFF, timetableState } from "./store";

/**
 * Registros ficticios de la demostración para que la exportación al EDE se vea completa: horario, clases firmadas,
 * firma de la asistencia diaria, títulos, capacidad y medidas. Se siembran junto con el colegio, así que el
 * reinicio de la demostración los restaura. Los RUN usan el mismo rango ficticio que los estudiantes.
 */

/** PDF de ejemplo que acompaña cada matrícula definitiva ficticia. */
export const DEMO_ENROLLMENT_SCAN = "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxMzAgPj4Kc3RyZWFtCkJUIC9GMSAxNiBUZiA2MCA3NjAgVGQgKEZpY2hhIGRlIG1hdHJpY3VsYSAtIERFTU9TVFJBQ0lPTikgVGogMCAtMjggVGQgL0YxIDEyIFRmIChEb2N1bWVudG8gZGUgZWplbXBsbyBjb24gZGF0b3MgZmljdGljaW9zLikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDA0MjIgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0OTIKJSVFT0YK";
const DEMO_SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALQAAAA4CAMAAABjYSKjAAAABlBMVEX///8UKGRZb9M5AAAAAnRSTlMA/1uRIrUAAAFJSURBVHja7VjbrsMgDMP//9NH06QjMijYIdtUzX6Z1hZwcMiF1gzDMAzDMIxfBh64I+d/1riFCUDPGuBYf9k09KxBkn75Ch/W57ka+h+CQPwqK0/aztctfvzbEoi2iZYWyDOs3D9cDwo+JVjaNH2uOUfDN3N1gkR5IJBGBen902t1QFsafSoZhC7GrOeaB0jO0qAScXwEcsu5rlIRNwhjjC0i3UjSCUsBRR+J22qulaXYh+jxPGq7hgzp40FjuL4BaerNckDLrFLpOGrUxTvXZ3wg4x+7435CGnQ0FP0DycAmpB0mrkmkybQXleYGQcrwNQd0WkrpyfokV1eWRYmitagApThP24NG15/TnJ0jLTnaIDFTSiLXiVG71pT10U573oNOMLQafPeqbVpdYz42Rp/dtIIrGdrRvn3bNFPa14yGYRiGYRi3wx+dpwQp/w4LWwAAAABJRU5ErkJggg==";

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

export function seedEdeDemo() {
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
    for (const c of s.courses) {
      const pupils = activeStudents().filter((x) => x.courseId === c.id);
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
}
