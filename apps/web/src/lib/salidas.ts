import "server-only";
import { computeDv, formatRut, mulberry32, parseRut, uuidv7, type Role, type Sheet } from "@insedu/domain";
import { activeStudents, courseById, fullName, school, studentById } from "./demo";
import type { Session } from "./session";
import { exitsState, findPerson } from "./store";

/**
 * Registro de salidas o retiros. Portería e inspectoría lo escriben; dirección y administración
 * también. La jefatura consulta su curso y el apoderado gestiona a quién autoriza para su pupilo.
 */
const WRITERS: Role[] = ["gatekeeper", "inspector", "director", "school_admin"];

export const canRegisterExits = (s: Session) => s.person.roles.some((r) => WRITERS.includes(r));
export const wardsOf = (s: Session) => (s.person.roles.includes("guardian_academic") ? s.person.wards ?? [] : []);

export function canSeeStudentExits(s: Session, studentId: string) {
  if (canRegisterExits(s) || wardsOf(s).includes(studentId)) return true;
  const st = studentById(studentId);
  return !!st && s.scope.headOfCourseIds.includes(st.courseId);
}

export const exitsToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
export const nowTime = () => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit" }).format(new Date());

export const pickupsOf = (studentId: string) => exitsState().pickups.filter((p) => p.studentId === studentId && !p.revokedAt);
export const exitsOf = (studentId: string) =>
  exitsState().exits.filter((e) => e.studentId === studentId).sort((a, b) => b.date.localeCompare(a.date) || b.exitTime.localeCompare(a.exitTime));

/** Salidas que todavía no marcan regreso: quienes retiraron al estudiante y no ha vuelto. */
export const openExits = (date: string) => exitsState().exits.filter((e) => e.date === date && !e.returnTime);

const run = (rut?: string) => (rut ? (parseRut(rut) ? formatRut(rut) : rut) : "");
const nameOf = (id: string) => findPerson(id)?.name ?? id;

/** Planillas para el respaldo y la descarga. La imagen de la firma no se exporta: se indica que existe. */
export function exitSheets(courseId?: string): Sheet[] {
  const { exits, courseExits, pickups } = exitsState();
  const scope = courseId ? ` · ${courseById(courseId)?.name}` : "";
  const inScope = (c: string) => !courseId || c === courseId;
  const student = (id: string) => {
    const st = studentById(id);
    return st ? fullName(st) : id;
  };
  return [
    {
      name: "Salidas y retiros",
      title: `Registro de salidas o retiros${scope}`,
      columns: [
        { header: "Folio", format: "integer" }, { header: "Fecha", format: "date" }, { header: "Estudiante", width: 30 }, { header: "Curso", width: 14 }, { header: "Local" }, { header: "Hora de salida" }, { header: "Hora de regreso" },
        { header: "Persona que retira", width: 28 }, { header: "RUN", width: 14 }, { header: "Autorizada" }, { header: "Comunicación del apoderado", width: 30 }, { header: "Firma", width: 24 }, { header: "Motivo", width: 30 }, { header: "Observaciones", width: 34 }, { header: "Registró", width: 24 },
      ],
      rows: exits.filter((e) => inScope(e.courseId)).sort((a, b) => a.date.localeCompare(b.date) || a.folio - b.folio).map((e) => [
        e.folio, e.date, student(e.studentId), courseById(e.courseId)?.name ?? "", e.campus ?? "", e.exitTime, e.returnTime ?? "", e.pickupName, run(e.pickupRut), e.pickupAuthId ? "Sí" : "No", e.guardianNote ?? "",
        e.signature ? "Firma en pantalla registrada" : `Poder simple: ${e.paperEvidence ?? ""}`, e.reason, e.observations ?? "", nameOf(e.by),
      ]),
    },
    {
      name: "Salidas de curso",
      title: `Salidas de cursos completos${scope}`,
      columns: [{ header: "Folio", format: "integer" }, { header: "Fecha", format: "date" }, { header: "Curso", width: 14 }, { header: "Hora de salida" }, { header: "Hora de regreso" }, { header: "Estudiantes fuera", format: "integer" }, { header: "A cargo", width: 28 }, { header: "Destino", width: 34 }, { header: "Registró", width: 24 }],
      rows: courseExits.filter((e) => inScope(e.courseId)).sort((a, b) => a.date.localeCompare(b.date)).map((e) => [e.folio, e.date, courseById(e.courseId)?.name ?? "", e.exitTime, e.returnTime ?? "", e.studentsOut, e.responsible, e.destination, nameOf(e.by)]),
    },
    {
      name: "Personas autorizadas",
      title: `Personas autorizadas para retirar${scope}`,
      columns: [{ header: "Estudiante", width: 30 }, { header: "Curso", width: 14 }, { header: "Autorizada", width: 28 }, { header: "RUN", width: 14 }, { header: "Relación", width: 16 }, { header: "Teléfono", width: 16 }, { header: "Registrada por" }, { header: "Constancia", width: 28 }, { header: "Desde", width: 12 }, { header: "Revocada", width: 12 }],
      rows: pickups.filter((p) => inScope(studentById(p.studentId)?.courseId ?? "")).map((p) => [student(p.studentId), courseById(studentById(p.studentId)?.courseId ?? "")?.name ?? "", p.name, run(p.rut), p.relation, p.phone ?? "", p.source === "apoderado" ? "Apoderado" : "Establecimiento", p.evidence ?? "", p.at.slice(0, 10), p.revokedAt?.slice(0, 10) ?? ""]),
    },
  ];
}

const FICTITIOUS_PICKUPS = ["Marta Rojas Vidal", "Pedro Soto Mena", "Elena Díaz Fuentes", "Luis Pérez Araya"];

/** Colegio ficticio: autorizados de 5° Básico A y algunos retiros recientes (sin firma real). */
export function seedExits() {
  const st = exitsState();
  const r = mulberry32(31);
  const days = school().schoolDays;
  const day = (n: number) => days[Math.max(0, days.length - 1 - n)] ?? days[0]!;
  const pupils = activeStudents().filter((s) => s.courseId === "course-1").slice(0, 8);
  pupils.forEach((p, i) => {
    const body = 9_000_000 + Math.floor(r() * 900_000);
    const rut = `${body}${computeDv(body)}`;
    st.pickups.push({ id: uuidv7(), studentId: p.id, name: FICTITIOUS_PICKUPS[i % FICTITIOUS_PICKUPS.length]!, rut, relation: i % 2 ? "Tío/a" : "Abuelo/a", source: "apoderado", by: `guardian-of-${p.id}`, at: `${days[0]}T12:00:00.000Z` });
  });
  pupils.slice(0, 3).forEach((p, i) => {
    const auth = st.pickups.find((x) => x.studentId === p.id)!;
    const date = day(i * 4 + 1);
    st.exits.push({ id: uuidv7(), folio: i + 1, studentId: p.id, courseId: p.courseId, date, exitTime: `1${i + 1}:15`, returnTime: i === 0 ? "14:30" : undefined, pickupName: auth.name, pickupRut: auth.rut, pickupAuthId: auth.id, paperEvidence: "Firma en cuaderno de portería (dato ficticio)", reason: i ? "Control médico" : "Trámite familiar", by: "inspector-1", at: `${date}T15:00:00.000Z` });
  });
  st.courseExits.push({ id: uuidv7(), folio: 4, courseId: "course-2", date: day(6), exitTime: "09:00", returnTime: "13:00", studentsOut: 28, responsible: "Rodrigo Tapia", destination: "Visita pedagógica al museo", by: "inspector-1", at: `${day(6)}T12:00:00.000Z` });
}
