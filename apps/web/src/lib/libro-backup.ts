import "server-only";
import { formatGrade, formatRut, parseRut, type Sheet } from "@insedu/domain";
import { fullName, school } from "./demo";
import { enrollmentSheet } from "./matricula";
import { pieSheets } from "./pie";
import { exitSheets } from "./salidas";
import { documentsState, findPerson, logbook, repo } from "./store";
import { subsidySheets } from "./subvenciones";

/**
 * Respaldo del libro de clases para fiscalización: todo lo registrado, incluida la bitácora, en una
 * planilla. La salud y la bóveda de Salvaguarda no son parte del libro y quedan fuera.
 * No es el formato del Estándar de Datos para la Educación: ese traspaso está pendiente (ADR 0005).
 */
const run = (rut: string) => (parseRut(rut) ? formatRut(rut) : rut);
const nameOf = (id: string) => findPerson(id)?.name ?? id;
const text = (v: unknown) => (v == null ? "" : typeof v === "string" ? v : typeof v === "number" ? String(v) : JSON.stringify(v));
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago" }) : "");

const SIGNATURE = { mineduc: "Verificador Mineduc", interno: "Demostración", sin: "Sin verificador" };
const LESSON_STATUS = { present: "Presente", late: "Atrasado", absent: "Ausente", justified: "Justificado" };

export function libroSheets(courseId?: string): Sheet[] {
  const s = school();
  const courses = s.courses.filter((c) => !courseId || c.id === courseId);
  const courseIds = new Set(courses.map((c) => c.id));
  const courseName = new Map(s.courses.map((c) => [c.id, c.name]));
  const students = s.students.filter((st) => courseIds.has(st.courseId));
  const byId = new Map(students.map((st) => [st.id, st]));
  const subjects = repo.subjects().filter((x) => courseIds.has(x.courseId));
  const lessons = subjects.flatMap((x) => repo.lessonsOf(x.id).map((l) => ({ l, subject: x })));
  const scope = courseId ? ` · ${courseName.get(courseId)}` : "";
  const studentCols = [{ header: "RUN" }, { header: "Estudiante", width: 30 }, { header: "Curso", width: 14 }];
  const who = (id: string) => {
    const st = byId.get(id);
    return st ? [run(st.rut), fullName(st), courseName.get(st.courseId) ?? ""] : null;
  };
  const events = logbook().filter((e) => !courseId || e.courseId === courseId);

  return [
    enrollmentSheet(courseId),
    {
      name: "Control de asignatura",
      title: `Control de asignatura y firmas${scope}`,
      columns: [
        { header: "Fecha", format: "date" }, { header: "Bloque" }, { header: "Curso", width: 14 }, { header: "Asignatura", width: 18 }, { header: "Objetivo", width: 18 }, { header: "Actividad", width: 50 }, { header: "Docente", width: 24 },
        { header: "Presentes", format: "integer" }, { header: "Atrasos", format: "integer" }, { header: "Ausentes", format: "integer" }, { header: "Justificados", format: "integer" },
        { header: "Firmada", width: 20 }, { header: "Verificador", width: 18 }, { header: "RUN firmante", width: 14 },
      ],
      rows: lessons.map(({ l, subject }) => {
        const n = (k: string) => Object.values(l.attendance).filter((x) => x === k).length;
        return [l.date, l.block, courseName.get(l.courseId) ?? "", subject.name, l.objective, l.content, nameOf(l.teacherId), n("present"), n("late"), n("absent"), n("justified"), when(l.signedAt), l.signedAt ? SIGNATURE[l.signature?.method ?? "sin"] : "", l.signature?.rut ? run(l.signature.rut) : ""];
      }),
    },
    {
      name: "Asistencia por clase",
      title: `Asistencia por clase${scope}`,
      columns: [...studentCols, { header: "Fecha", format: "date" }, { header: "Bloque" }, { header: "Asignatura", width: 18 }, { header: "Estado" }],
      rows: lessons.flatMap(({ l, subject }) => Object.entries(l.attendance).flatMap(([id, status]) => {
        const st = who(id);
        return st ? [[...st, l.date, l.block, subject.name, LESSON_STATUS[status]]] : [];
      })),
    },
    {
      name: "Asistencia diaria",
      title: `Control de asistencia diaria${scope}`,
      columns: [...studentCols, { header: "Fecha", format: "date" }, { header: "Estado" }, { header: "Origen", width: 16 }],
      rows: s.attendance.flatMap((a) => {
        const st = who(a.studentId);
        return st ? [[...st, a.date, a.status, a.source]] : [];
      }),
    },
    {
      name: "Evaluaciones",
      title: `Evaluaciones y calificaciones${scope}`,
      columns: [...studentCols, { header: "Asignatura", width: 18 }, { header: "Fecha", format: "date" }, { header: "Nota", format: "grade" }],
      rows: s.grades.flatMap((g) => {
        const st = who(g.studentId);
        return st ? [[...st, g.subject, g.date, g.value]] : [];
      }),
    },
    {
      name: "Convivencia",
      title: `Anotaciones de convivencia escolar${scope}`,
      columns: [...studentCols, { header: "Fecha", format: "date" }, { header: "Tipo" }, { header: "Gravedad" }, { header: "Descripción", width: 60 }, { header: "Registró", width: 24 }],
      rows: s.conduct.flatMap((c) => {
        const st = who(c.studentId);
        return st ? [[...st, c.date, c.kind, c.severity ?? "", c.description, nameOf(c.recordedBy)]] : [];
      }),
    },
    ...pieSheets(courseId),
    ...subsidySheets(courseId),
    ...exitSheets(courseId),
    {
      name: "Documentos adjuntos",
      title: `Documentos escaneados (el contenido se descarga desde INSEDU)${scope}`,
      columns: [{ header: "Registro" }, { header: "Identificador", width: 40 }, { header: "Curso", width: 14 }, { header: "Documento", width: 34 }, { header: "Archivo", width: 30 }, { header: "Bytes", format: "integer" }, { header: "Huella SHA-256", width: 66 }, { header: "Adjuntó", width: 24 }, { header: "Fecha", width: 20 }],
      rows: documentsState().filter((d) => !courseId || d.courseId === courseId).map((d) => [d.ownerKind, d.ownerId, d.courseId ? courseName.get(d.courseId) ?? "" : "", d.label, d.fileName, d.size, d.sha256, nameOf(d.by), when(d.at)]),
    },
    {
      name: "Correcciones",
      title: `Correcciones con motivo${scope}`,
      columns: [{ header: "Fecha", width: 20 }, { header: "Curso", width: 14 }, { header: "Registro", width: 18 }, { header: "Identificador", width: 40 }, { header: "Antes" }, { header: "Después" }, { header: "Motivo", width: 50 }, { header: "Responsable", width: 24 }],
      rows: courses.flatMap((c) => repo.correctionsOf(c.id).map((x) => [when(x.at), c.name, x.target, x.recordId, grade(x.before), grade(x.after), x.reason, nameOf(x.by)])),
    },
    {
      name: "Bitácora",
      title: `Bitácora de acciones${scope}`,
      columns: [{ header: "Fecha y hora", width: 20 }, { header: "Usuario", width: 24 }, { header: "Acción" }, { header: "Registro" }, { header: "Identificador", width: 40 }, { header: "Curso", width: 14 }, { header: "Antes", width: 28 }, { header: "Después", width: 40 }, { header: "Motivo", width: 40 }, { header: "Huella", width: 66 }],
      rows: events.map((e) => [when(e.at), nameOf(e.actor), e.action, e.entity, e.recordId, e.courseId ? courseName.get(e.courseId) ?? "" : "", text(e.before), text(e.after), e.reason ?? "", e.hash]),
    },
  ];
}

const grade = (v: unknown) => (typeof v === "number" ? formatGrade(v) : text(v));
