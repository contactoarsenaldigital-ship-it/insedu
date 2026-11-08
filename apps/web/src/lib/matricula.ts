import "server-only";
import {
  computeDv, CONDITION_LABEL, formatRut, missingEnrollmentData, mulberry32, nextEnrollmentNumber, parseRut, REGULAR_MODALITY, registrySummary, WITHDRAWAL_LABEL,
  type EnrollmentRecord, type Sheet, type Student,
} from "@insedu/domain";
import { accountsState, audit } from "./accounts";
import { courseById, fullName, school, studentById } from "./demo";
import { profile } from "./health";
import type { Session } from "./session";
import { enrollmentRecords, logEvent } from "./store";

/**
 * Registro general de matrícula. La baja no borra al estudiante: conserva su ficha e historia y
 * sale de las listas activas (ver `activeStudents`). Solo el colegio ficticio recibe datos generados.
 */
export const canManageEnrollment = (s: Session) => s.person.roles.some((r) => r === "school_admin" || r === "director");

const FICTITIOUS_STREETS = ["Los Aromos", "Las Acacias", "El Roble", "Los Olivos", "Las Encinas"];
const FICTITIOUS_COMUNAS = [
  { code: "13119", name: "Maipú", postal: "9250000" }, { code: "13110", name: "La Florida", postal: "8240000" }, { code: "13120", name: "Ñuñoa", postal: "7750000" },
  { code: "13201", name: "Puente Alto", postal: "8150000" }, { code: "13101", name: "Santiago", postal: "8320000" },
];
const FICTITIOUS_GUARDIANS = ["Claudia", "Paola", "Andrea", "Alejandra", "Carolina", "Rodrigo", "Cristián", "Patricio", "Mauricio", "Gonzalo"];
const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function demoData(student: Student): Partial<EnrollmentRecord> {
  const r = mulberry32([...student.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11));
  const street = `${FICTITIOUS_STREETS[Math.floor(r() * FICTITIOUS_STREETS.length)]} ${100 + Math.floor(r() * 899)}`;
  const comuna = FICTITIOUS_COMUNAS[Math.floor(r() * FICTITIOUS_COMUNAS.length)]!;
  const address = `${street}, ${comuna.name}`;
  const location = { comunaCode: comuna.code, city: "Santiago", street, unit: r() < 0.4 ? `Depto ${100 + Math.floor(r() * 400)}` : "Casa", postalCode: comuna.postal };
  const given = FICTITIOUS_GUARDIANS[Math.floor(r() * FICTITIOUS_GUARDIANS.length)]!;
  const rutBody = 46_000_000 + Math.floor(r() * 800_000);
  const hp = profile(student.id);
  return {
    sex: hp.sex,
    birthDate: hp.birthDate,
    enrolledOn: `${school().schoolDays[0]?.slice(0, 4) ?? "2026"}-03-0${1 + Math.floor(r() * 5)}`,
    address,
    location,
    enrollmentScan: true,
    guardians: [{
      name: `${given} ${student.lastName}`, address, location, rut: `${rutBody}${computeDv(rutBody)}`, phone: `+56 9 ${1000 + Math.floor(r() * 8999)} ${1000 + Math.floor(r() * 8999)}`,
      email: `${plain(given)}.${plain(student.lastName.split(" ")[0]!)}${Math.floor(r() * 90) + 10}@correo-ficticio.example`,
    }],
  };
}

/** Crea la ficha que falte (datos anteriores al registro). Los números siguen el orden de los estudiantes. */
export function ensureEnrollments(): EnrollmentRecord[] {
  const records = enrollmentRecords();
  const known = new Set(records.map((r) => r.id));
  for (const st of school().students) {
    if (known.has(st.id)) continue;
    const level = courseById(st.courseId)?.level ?? "";
    records.push({
      id: st.id,
      number: nextEnrollmentNumber(records, level),
      level,
      modality: REGULAR_MODALITY,
      document: "RUN",
      guardians: [],
      condition: "regular",
      notes: [],
      ...(st.id.startsWith("student-") ? demoData(st) : {}),
    });
  }
  return records;
}

export const enrollmentOf = (id: string) => ensureEnrollments().find((r) => r.id === id);

export const enrollmentSummary = () => registrySummary(ensureEnrollments(), school().students, (courseId) => courseById(courseId)?.level);

/** Registra la baja en cuentas y bitácora: la cuenta del estudiante deja de poder ingresar. */
export function suspendStudentAccounts(studentId: string, by: string) {
  for (const a of accountsState().users) {
    if (a.roles.includes("student") && a.scope.studentId === studentId && a.status !== "suspendida") {
      a.status = "suspendida";
      audit(by, "Cuenta suspendida", `${a.name}: baja en el registro de matrícula`);
    }
  }
}

export function logEnrollment(by: string, action: "crear" | "modificar" | "eliminar", record: EnrollmentRecord, courseId: string, before: unknown, after: unknown, reason?: string) {
  logEvent({ actor: by, action, entity: "matricula", recordId: record.id, courseId, before, after, reason });
}

const run = (rut: string) => (parseRut(rut) ? formatRut(rut) : rut);

/** Planilla del registro para fiscalización: todos los datos mínimos, incluidas las bajas. */
export function enrollmentSheet(courseId?: string): Sheet {
  const scope = courseId ? ` · ${courseById(courseId)?.name}` : "";
  const rows = ensureEnrollments()
    .map((r) => ({ r, st: studentById(r.id) }))
    .filter((x): x is { r: EnrollmentRecord; st: Student } => !!x.st && (!courseId || x.st.courseId === courseId))
    .sort((a, b) => a.r.level.localeCompare(b.r.level, "es") || a.r.number - b.r.number);
  return {
    name: "Registro de matrícula",
    title: `Registro general de matrícula${scope}`,
    columns: [
      { header: "Nivel", width: 12 }, { header: "Modalidad" }, { header: "N°", format: "integer" }, { header: "Documento" }, { header: "RUN o IPE", width: 14 }, { header: "Estudiante", width: 30 }, { header: "Sexo" }, { header: "Nacimiento", format: "date" }, { header: "Curso", width: 14 }, { header: "Local" }, { header: "Fecha de matrícula", format: "date" }, { header: "Domicilio", width: 30 }, { header: "Condición" }, { header: "Resolución", width: 20 },
      { header: "Apoderado", width: 28 }, { header: "Domicilio del apoderado", width: 30 }, { header: "Teléfono", width: 16 }, { header: "Correo", width: 24 }, { header: "Otros apoderados", width: 28 },
      { header: "Fecha de retiro", format: "date" }, { header: "Motivo de retiro", width: 36 }, { header: "Constancia", width: 28 }, { header: "Observaciones", width: 50 }, { header: "Datos faltantes", width: 30 },
    ],
    rows: rows.map(({ r, st }) => {
      const g = r.guardians[0];
      return [
        r.level, r.modality, r.number, r.document, run(st.rut), fullName(st), r.sex ?? "", r.birthDate ?? "", courseById(st.courseId)?.name ?? "", r.campus ?? "", r.enrolledOn ?? "", r.address ?? "", CONDITION_LABEL[r.condition], r.resolution ?? "",
        g?.name ?? "", g?.address ?? "", g?.phone ?? "", g?.email ?? "", r.guardians.slice(1).map((x) => `${x.name} (${x.phone})`).join("; "),
        r.withdrawal?.date ?? "", r.withdrawal ? `${WITHDRAWAL_LABEL[r.withdrawal.reason]}: ${r.withdrawal.detail}` : "", r.withdrawal?.evidence ?? "", r.notes.map((n) => `${n.at.slice(0, 10)}: ${n.text}`).join(" | "), missingEnrollmentData(r).join(", "),
      ];
    }),
  };
}
