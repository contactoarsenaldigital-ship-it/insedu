"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  EMAIL_PATTERN, isValidRut, nextEnrollmentNumber, normalizeRut, parseDate, REGULAR_MODALITY, STRONG_AUTH_WINDOW_MS, withdrawalIssues,
  type EnrollmentCondition, type EnrollmentRecord, type GuardianContact, type WithdrawalReason,
} from "@insedu/domain";
import { courseById, fullName, school, studentById } from "@/lib/demo";
import { canManageEnrollment, enrollmentOf, ensureEnrollments, logEnrollment, suspendStudentAccounts } from "@/lib/matricula";
import { getSession, type Session } from "@/lib/session";
import { withState } from "@/lib/state";
import { addCourseSubjects, repo } from "@/lib/store";

/** Altas, cambios y bajas. Exige perfil y verificación reciente; todo queda en la bitácora. */
const SEARCH_COOKIE = "insedu_matricula_q";
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

function back(path: string, msg: { ok?: string; error?: string }): never {
  const q = new URLSearchParams(msg as Record<string, string>);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${q}`);
}

async function guard(next: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  if (!canManageEnrollment(s)) back("/matricula", { error: "Solo administración y dirección modifican el registro de matrícula." });
  const fresh = s.lastStrongAuthAt && Date.now() - new Date(s.lastStrongAuthAt).getTime() <= STRONG_AUTH_WINDOW_MS;
  if (!fresh) redirect(`/verificar?next=${encodeURIComponent(next)}`);
  return s;
}

const CONDITIONS: EnrollmentCondition[] = ["regular", "excedente", "intercambio", "practica", "migrante"];

function guardiansFrom(f: FormData): GuardianContact[] {
  return [0, 1].flatMap((i) => {
    const name = str(f, `g${i}_name`).replace(/\s+/g, " ");
    return name ? [{ name, address: str(f, `g${i}_address`), phone: str(f, `g${i}_phone`), email: str(f, `g${i}_email`).toLowerCase() || undefined }] : [];
  });
}

/** Lee los campos comunes de la ficha y los valida. */
function fieldsFrom(f: FormData) {
  const issues: string[] = [];
  const firstName = str(f, "firstName").replace(/\s+/g, " ");
  const lastName = str(f, "lastName").replace(/\s+/g, " ");
  if (firstName.length < 2) issues.push("Escriba los nombres");
  if (lastName.length < 2) issues.push("Escriba los apellidos paterno y materno");
  const course = courseById(str(f, "courseId"));
  if (!course) issues.push("Elija el curso");
  const date = (key: string, label: string) => {
    const raw = str(f, key);
    if (!raw) return undefined;
    const d = parseDate(raw);
    if (!d) issues.push(`${label} no es válida`);
    return d ?? undefined;
  };
  const birthDate = date("birthDate", "La fecha de nacimiento");
  const enrolledOn = date("enrolledOn", "La fecha de matrícula");
  const sexRaw = str(f, "sex");
  const sex = sexRaw === "F" ? "F" as const : sexRaw === "M" ? "M" as const : undefined;
  const condition = CONDITIONS.find((c) => c === str(f, "condition")) ?? "regular";
  const guardians = guardiansFrom(f);
  // Los mensajes viajan en la URL: nunca deben llevar nombres ni otros datos personales.
  if (guardians.some((g) => g.email && !EMAIL_PATTERN.test(g.email))) issues.push("El correo de un apoderado no es válido");
  return {
    issues, firstName, lastName, course,
    fields: { sex, birthDate, enrolledOn, condition, guardians, address: str(f, "address") || undefined, campus: str(f, "campus") || undefined, resolution: str(f, "resolution") || undefined },
  };
}

async function createImpl(f: FormData) {
  const s = await guard("/matricula/nueva");
  const { issues, firstName, lastName, course, fields } = fieldsFrom(f);
  const rut = normalizeRut(str(f, "rut"));
  if (!isValidRut(rut)) issues.push("El RUN o IPE no es válido");
  if (school().students.some((x) => x.rut === rut)) issues.push("Ya existe una ficha con ese RUN. Búsquela en el registro");
  if (issues.length || !course) back("/matricula/nueva", { error: issues.join(". ") });

  const id = `est-${crypto.randomUUID().slice(0, 12)}`;
  const records = ensureEnrollments();
  school().students.push({ id, tenantId: school().tenantId, rut, firstName, lastName, courseId: course.id });
  addCourseSubjects(course.id);
  const record: EnrollmentRecord = {
    id, number: nextEnrollmentNumber(records, course.level), level: course.level, modality: REGULAR_MODALITY, document: str(f, "document") === "IPE" ? "IPE" : "RUN",
    notes: [], ...fields, enrolledOn: fields.enrolledOn ?? today(),
  };
  records.push(record);
  logEnrollment(s.person.id, "crear", record, course.id, null, { rut, firstName, lastName, ...record });
  back(`/matricula/${id}`, { ok: `Alta registrada con el número ${record.number} de ${record.level}.` });
}

async function updateImpl(f: FormData) {
  const id = str(f, "id");
  const path = `/matricula/${id}`;
  const s = await guard(path);
  const student = studentById(id);
  const record = enrollmentOf(id);
  if (!student || !record) redirect("/matricula");
  const { issues, firstName, lastName, course, fields } = fieldsFrom(f);
  const rut = normalizeRut(str(f, "rut"));
  if (!isValidRut(rut)) issues.push("El RUN o IPE no es válido");
  if (school().students.some((x) => x.rut === rut && x.id !== id)) issues.push("Ese RUN ya pertenece a otra ficha");
  if (issues.length || !course) back(path, { error: issues.join(". ") });

  const before = { rut: student.rut, firstName: student.firstName, lastName: student.lastName, courseId: student.courseId, ...record, notes: undefined };
  const at = new Date().toISOString();
  const notes = [...record.notes];
  const add = (text: string) => notes.push({ at, by: s.person.id, text });
  if (student.courseId !== course.id) add(`Cambio de curso: de ${courseById(student.courseId)?.name} a ${course.name}.`);
  if (student.firstName !== firstName || student.lastName !== lastName) add(`Cambio de nombre: de ${fullName(student)} a ${firstName} ${lastName}.`);
  if (record.guardians[0]?.name && record.guardians[0].name !== fields.guardians[0]?.name) add(`Cambio de apoderado: de ${record.guardians[0].name} a ${fields.guardians[0]?.name ?? "sin apoderado"}.`);
  if (str(f, "note")) add(str(f, "note").slice(0, 500));

  // El nivel cambia con el curso, pero el número solo se reasigna si el nivel es otro.
  const number = course.level === record.level ? record.number : nextEnrollmentNumber(ensureEnrollments(), course.level, record.modality);
  Object.assign(student, { rut, firstName, lastName, courseId: course.id });
  Object.assign(record, { ...fields, enrolledOn: fields.enrolledOn ?? record.enrolledOn, level: course.level, number, document: str(f, "document") === "IPE" ? "IPE" : "RUN", notes });
  logEnrollment(s.person.id, "modificar", record, course.id, before, { rut, firstName, lastName, courseId: course.id, ...record, notes: undefined }, str(f, "note") || undefined);
  back(path, { ok: "Ficha actualizada." });
}

async function withdrawImpl(f: FormData) {
  const id = str(f, "id");
  const path = `/matricula/${id}`;
  const s = await guard(path);
  const student = studentById(id);
  const record = enrollmentOf(id);
  if (!student || !record) redirect("/matricula");
  if (record.withdrawal) back(path, { error: "Este estudiante ya tiene una baja registrada." });
  const w = { date: str(f, "date"), reason: str(f, "reason"), detail: str(f, "detail"), evidence: str(f, "evidence") };
  const issues = withdrawalIssues(w, { isDirector: s.person.roles.includes("director"), attestedAbsence: f.get("attest") === "1", today: today() });
  if (issues.length) back(path, { error: issues.join(". ") });

  record.withdrawal = { ...w, reason: w.reason as WithdrawalReason, by: s.person.id, at: new Date().toISOString() };
  student.withdrawnOn = w.date;
  suspendStudentAccounts(id, s.person.id);
  logEnrollment(s.person.id, "modificar", record, student.courseId, null, { withdrawal: record.withdrawal }, `Baja: ${w.detail}`);
  back(path, { ok: "Baja registrada. Entregue el certificado de baja al apoderado." });
}

/** Solo para errores de registro: el estudiante vuelve con su mismo número. */
async function undoImpl(f: FormData) {
  const id = str(f, "id");
  const path = `/matricula/${id}`;
  const s = await guard(path);
  const student = studentById(id);
  const record = enrollmentOf(id);
  if (!student || !record?.withdrawal) redirect(path);
  const reason = str(f, "reason");
  if (reason.length < 10) back(path, { error: "Explique por qué se anula la baja (mínimo 10 caracteres)." });
  const before = record.withdrawal;
  record.notes = [...record.notes, { at: new Date().toISOString(), by: s.person.id, text: `Baja anulada: ${reason}` }];
  record.withdrawal = undefined;
  student.withdrawnOn = undefined;
  logEnrollment(s.person.id, "modificar", record, student.courseId, { withdrawal: before }, { withdrawal: null }, `Baja anulada: ${reason}`);
  back(path, { ok: "Baja anulada. Si el estudiante tenía cuenta, reactívela en Configuración." });
}

export async function createEnrollment(f: FormData) {
  return withState(() => createImpl(f));
}
export async function updateEnrollment(f: FormData) {
  return withState(() => updateImpl(f));
}
export async function withdrawStudent(f: FormData) {
  return withState(() => withdrawImpl(f));
}
export async function undoWithdrawal(f: FormData) {
  return withState(() => undoImpl(f));
}

/** La búsqueda por nombre o RUN va en una cookie de corta duración, nunca en la URL. */
export async function filterEnrollment(f: FormData) {
  const q = str(f, "q").slice(0, 80);
  const jar = await cookies();
  if (q) jar.set(SEARCH_COOKIE, q, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/matricula", maxAge: 600 });
  else jar.delete({ name: SEARCH_COOKIE, path: "/matricula" });
  const params = new URLSearchParams();
  if (str(f, "nivel")) params.set("nivel", str(f, "nivel"));
  if (str(f, "estado")) params.set("estado", str(f, "estado"));
  redirect(`/matricula${params.size ? `?${params}` : ""}`);
}
