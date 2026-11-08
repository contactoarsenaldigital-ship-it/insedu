/**
 * Exportación al Estándar de Datos para la Educación (EDE), modelo CEDS NDS v7.1.
 *
 * Genera el JSON que lee el contenedor oficial `edemineduc/etl` (comando `parse`): un objeto cuyas claves son
 * los grupos de la planilla NDS-Reference-v7_1.xlsx (hoja «NDS Columns», columna JSONGroup), y cuyo valor es
 * una lista de objetos { Tabla: [filas] }. Las columnas usan los nombres exactos de esa planilla.
 *
 * Etapa 1 (este archivo): establecimiento, cursos y asignaturas; personas y sus identificadores; matrícula y
 * número de lista; asistencia diaria y por clase con la firma del verificador; suspensiones de clases.
 * Etapa 2: horario (CourseSectionSchedule) y sesiones del calendario por día de clase.
 * Etapa 3: jerarquía código de enseñanza → grado → curso, evaluaciones y notas (Assessment…, LearnerActivity) y
 * anotaciones (Incident, IncidentPerson, K12StudentDiscipline).
 * Etapa 4: firma de las anotaciones, entrevistas y reuniones con apoderados (con el acta escaneada en Document).
 * Etapa 5: apoderados y autorizados a retirar, salidas (tres eventos EarlyDeparture), entrega de documentación y
 *   nómina PIE (sin diagnósticos; el validador no revisa el PIE).
 * Etapa 6: datos de cada asignatura (CourseSection), títulos de los docentes y recepción de los instrumentos de interés general.
 */
import { parseRut } from "../rut";
import { subjectArea, type EdeRefKey, type EdeRefs } from "./refs";
import { measureDays, type DisciplinaryMeasureType } from "../discipline";
import type { StructuredAddress } from "../enrollment";
import type { DegreeType, DegreeVerification } from "../staff-records";
import COMUNAS from "./comunas.json";

export type EdeAttendanceStatus = "present" | "late" | "absent" | "justified";

export type EdeInput = {
  /** jornada: valor de la lista oficial (Mañana, Tarde, Mañana y Tarde, Vespertina/Nocturna). */
  school: {
    rbd: string; name: string; year: string; jornada?: string;
    location?: StructuredAddress & { building: string }; email?: string; phone?: string;
    /** Primer y último día de clases del periodo informado. */
    firstDay?: string; lastDay?: string;
  };
  /** capacity: capacidad autorizada del curso. */
  courses: { id: string; name: string; level: string; headTeacherId?: string; capacity?: number }[];
  subjects: { id: string; courseId: string; name: string; teacherId?: string }[];
  students: {
    id: string; rut: string; document: "RUN" | "IPE"; firstName: string; lastName: string; birthDate?: string; sex?: "F" | "M";
    address?: string; location?: StructuredAddress; courseId: string; listNumber: number; schoolNumber?: number; enrolledOn?: string; withdrawnOn?: string;
    /** Documento escaneado que respalda la matrícula definitiva. */
    enrollmentDocId?: string;
    /** Apoderado titular de la matrícula. */
    guardian?: { name: string; rut?: string; location?: StructuredAddress; phone?: string; email?: string };
  }[];
  /** Personas autorizadas a retirar, vigentes. */
  pickups: { studentId: string; name: string; rut?: string }[];
  /** Retiros de estudiantes. subjectId: la asignatura en curso a esa hora, según el horario. docIds: firma o poder de quien retira. */
  exits: {
    id: string; studentId: string; courseId: string; date: string; exitTime: string; subjectId?: string; reason: string;
    pickup: { name: string; rut?: string; authorized: boolean }; by: string; signedAt?: string; signatureKey?: string; docIds: string[];
  }[];
  /** Entregas de documentación ya recibidas. docIds: firma de recepción o comprobante escaneado. */
  deliveries: {
    id: string; studentId: string; courseId: string; on: string; time?: string; documents: string;
    receiver: { name: string; rut?: string; kind: "apoderado" | "estudiante" | "otro" };
    by: string; byKind: "docente" | "profesional" | "administrativo"; signedAt?: string; signatureKey?: string; docIds: string[];
  }[];
  /** Nómina del Programa de Integración Escolar, sin diagnósticos. */
  pie: { studentId: string; since: string; until?: string }[];
  staff: { id: string; rut?: string; name: string; degrees?: { title: string; institution: string; awardDate?: string; idoneidad: boolean; degreeType?: DegreeType; accredited?: boolean; verification?: DegreeVerification }[] }[];
  /** Instrumentos de interés general y los apoderados que confirmaron recibirlos. docIds: archivo del instrumento. */
  institutional: { id: string; title: string; publishedAt: string; by: string; docIds: string[]; acks: { studentId: string; name: string; rut?: string; at: string }[] }[];
  /** signatureKey: verificador de quien firmó la asistencia del curso ese día. */
  daily: { studentId: string; date: string; status: EdeAttendanceStatus; signedAt?: string; signatureKey?: string }[];
  lessons: { id: string; subjectId: string; date: string; attendance: Record<string, EdeAttendanceStatus>; signedAt?: string; signerId?: string; signatureKey?: string; withinSchedule?: boolean }[];
  /** Horario: una fila por asignatura, día y hora de la jornada. */
  schedule: { subjectId: string; weekday: 1 | 2 | 3 | 4 | 5; period: number; start: string; end: string }[];
  suspensions: { id: string; date: string; reason: string; authorization: string; rexNumber?: string; rexDate?: string; rexDocId?: string }[];
  /** Evaluaciones sumativas por asignatura; el peso es el coeficiente de la nota. */
  evaluations: { id: string; subjectId: string; title: string; date: string; weight: number; signedAt?: string; signerId?: string; signatureKey?: string }[];
  grades: { evaluationId: string; studentId: string; value: number }[];
  /** Anotaciones. La hora sale del registro en la bitácora, si existe. */
  conduct: { id: string; studentId: string; date: string; time?: string; kind: "positive" | "negative" | "commendation"; severity?: string; description: string; recordedBy: string; article?: string; measures?: { id: string; type: DisciplinaryMeasureType; from?: string; to?: string }[]; signedAt?: string; signatureKey?: string }[];
  /** Entrevistas y reuniones con apoderados. actaIds: documentos escaneados del acta firmada. */
  meetings: {
    id: string; kind: "entrevista" | "reunion"; courseId: string; studentId?: string; date: string; time: string; description: string;
    by: string; byTeacher: boolean; signedAt: string; signatureKey?: string;
    attendees: { studentId: string; name: string; rut?: string }[]; actaIds: string[];
  }[];
  /** Contenido de los documentos escaneados, en base64, por id. Sin contenido no se escribe la fila Document. */
  documents: Record<string, string | undefined>;
  /** Instante de la exportación, ISO. */
  exportedAt: string;
  timeZone: string;
};

type Row = Record<string, string | number | null>;
export type EdeJson = Record<string, Record<string, Row[]>[]>;
export type EdeIssue = { severity: "error" | "aviso"; message: string };

/** Fecha y hora con desfase horario, como exige el validador: 2026-10-05T08:30:00-03:00. */
export function withOffset(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "longOffset" }).formatToParts(d).map((p) => [p.type, p.value]));
  const offset = parts.timeZoneName === "GMT" ? "+00:00" : String(parts.timeZoneName).replace("GMT", "");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

/** Inicio del día local de una fecha, con desfase. */
const dayStart = (date: string, timeZone: string) => {
  // Mediodía UTC cae siempre en el mismo día en Chile; desde ahí se lee el desfase del día.
  const noon = withOffset(`${date}T12:00:00Z`, timeZone);
  return `${date}T00:00:00${noon.slice(19)}`;
};

const comunaByCode = new Map(COMUNAS.map((c) => [c.code, c]));
export const comunaName = (code: string) => comunaByCode.get(code)?.name ?? code;
/** RefState numera las regiones de forma correlativa: la 01 es el código 63. */
const regionRef = (comunaCode: string) => 62 + Number(comunaCode.slice(0, 2));
/** fn3DD: +56 seguido solo de dígitos. */
const phoneNumber = (phone: string) => phone.replace(/[^\d+]/g, "");

/** fn9F1 compara la hora con TIME(hora), que siempre incluye los segundos. */
const withSeconds = (time: string) => (time.length === 5 ? `${time}:00` : time);

/** «Pérez Soto» → apellido paterno y materno; «Ana María» → nombre y segundo nombre. */
export function splitNames(firstName: string, lastName: string) {
  const [first = "", ...middle] = firstName.trim().split(/\s+/);
  const [last = "", ...second] = lastName.trim().split(/\s+/);
  // fn4FA arma el nombre concatenando en SQL: un nulo borra el nombre completo, y el validador convierte "" en nulo.
  return { FirstName: first, MiddleName: middle.join(" ") || " ", LastName: last, SecondLastName: second.join(" ") || " " };
}

export function buildEdeJson(input: EdeInput, refs: EdeRefs): { json: EdeJson; issues: EdeIssue[]; counts: Record<string, number> } {
  const issues: EdeIssue[] = [];
  const missing = new Set<EdeRefKey>();
  const ref = (k: EdeRefKey) => {
    const v = refs[k];
    if (v == null) missing.add(k);
    return v ?? null;
  };
  const tz = input.timeZone;
  const start = withOffset(input.exportedAt, tz);

  // Claves sustitutas enteras, estables dentro de un archivo.
  let seq = 100_000; // La plantilla del validador ya ocupa identificadores bajos.
  const ids = new Map<string, number>();
  const id = (key: string) => {
    if (!ids.has(key)) ids.set(key, ++seq);
    return ids.get(key)!;
  };

  const tables: Record<string, Row[]> = {};
  const push = (table: string, row: Row) => void (tables[table] ??= []).push(row);
  const documentRow = (docIds: string[]) => {
    const doc = docIds.find((d) => input.documents[d]);
    if (doc && !ids.has(`doc:${doc}`)) push("Document", { documentId: id(`doc:${doc}`), fileScanBase64: input.documents[doc]! });
    return doc ? id(`doc:${doc}`) : null;
  };
  const addressFields = (a: StructuredAddress) => ({ RefCountryId: ref("country.chile"), RefStateId: regionRef(a.comunaCode), City: a.city, RefCountyId: comunaByCode.get(a.comunaCode)?.id ?? null, StreetNumberAndName: a.street.slice(0, 40), ApartmentRoomOrSuiteNumber: a.unit, PostalCode: a.postalCode });
  const personAddress = (a: StructuredAddress) => ({ ...addressFields(a), AddressCountyName: comunaByCode.get(a.comunaCode)?.name ?? null });

  // ── Organizaciones: establecimiento → cursos → asignaturas ──
  const schoolOrg = id("org:school");
  push("Organization", { OrganizationId: schoolOrg, Name: input.school.name, ShortName: input.school.name.slice(0, 30), RefOrganizationTypeId: ref("orgType.school"), RecordStartDateTime: start, RecordEndDateTime: null });
  push("OrganizationIdentifier", { OrganizationIdentifierId: id("orgid:rbd"), OrganizationId: schoolOrg, Identifier: rbdIdentifier(input.school.rbd), RefOrganizationIdentificationSystemId: ref("orgIdSystem.rbd"), RefOrganizationIdentifierTypeId: ref("orgIdentifierType.school"), RecordStartDateTime: start, RecordEndDateTime: null });
  let unknownLevels = 0;
  const jornada = input.school.jornada ?? "Mañana y Tarde";
  if (!input.school.jornada) issues.push({ severity: "aviso", message: "No está registrada la jornada del establecimiento: se informa «Mañana y Tarde»" });
  for (const c of input.courses) {
    const org = id(`org:course:${c.id}`);
    const codes = gradeCodes(c.level);
    let parent = schoolOrg;
    if (codes) {
      // jerarquiasList: establecimiento → modalidad → jornada → nivel → rama → sector → especialidad → tipo de curso → enseñanza → grado → curso.
      const ciclo = "000:Ciclo General";
      const levels: [EdeRefKey, string][] = [
        ["orgType.modalidad", "Regular"], ["orgType.jornada", jornada], ["orgType.nivel", codes.nivel], ["orgType.rama", ciclo], ["orgType.sector", ciclo], ["orgType.especialidad", ciclo],
        ["orgType.tipoCurso", "01:Simple"], ["orgType.codigoEnsenanza", codes.ensenanza], ["orgType.grado", codes.grado],
      ];
      let path = "org:h";
      for (const [type, name] of levels) {
        path += `/${name}`;
        if (!ids.has(path)) {
          push("Organization", { OrganizationId: id(path), Name: name, ShortName: name.slice(0, 30), RefOrganizationTypeId: ref(type), RecordStartDateTime: start, RecordEndDateTime: null });
          push("OrganizationRelationship", { OrganizationRelationshipId: id(`rel:${path}`), OrganizationId: id(path), Parent_OrganizationId: parent, RefOrganizationRelationshipId: ref("orgRelationship.internal"), RecordStartDateTime: start, RecordEndDateTime: null });
        }
        parent = id(path);
      }
    } else unknownLevels++;
    // El validador lee la letra del curso en Organization.Name; el nivel queda en el grado.
    const letter = c.name.trim().split(/\s+/).pop() ?? c.name;
    push("Organization", { OrganizationId: org, Name: codes ? letter : c.name, ShortName: c.name.slice(0, 30), RefOrganizationTypeId: ref("orgType.course"), RecordStartDateTime: start, RecordEndDateTime: null });
    push("Course", { OrganizationId: org, Description: c.name.slice(0, 60), RecordStartDateTime: start, RecordEndDateTime: null });
    push("OrganizationRelationship", { OrganizationRelationshipId: id(`rel:course:${c.id}`), OrganizationId: org, Parent_OrganizationId: parent, RefOrganizationRelationshipId: ref("orgRelationship.internal"), RecordStartDateTime: start, RecordEndDateTime: null });
  }
  if (unknownLevels) issues.push({ severity: "error", message: `${unknownLevels} curso(s) con un nivel que no corresponde a Básica o Media regular: falta su código de enseñanza y grado` });
  const capacityOf = new Map(input.courses.map((c) => [c.id, c.capacity]));
  const withoutCapacity = new Set<string>();
  for (const s of input.subjects) {
    const org = id(`org:section:${s.id}`);
    push("Organization", { OrganizationId: org, Name: s.name, ShortName: s.name.slice(0, 30), RefOrganizationTypeId: ref("orgType.courseSection"), RecordStartDateTime: start, RecordEndDateTime: null });
    // fn9F1: cada asignatura con su curso, capacidad, modalidad presencial e idioma de instrucción.
    const capacity = capacityOf.get(s.courseId);
    if (capacity == null) withoutCapacity.add(s.courseId);
    push("CourseSection", { OrganizationId: org, CourseId: id(`org:course:${s.courseId}`), MaximumCapacity: capacity ?? null, VirtualIndicator: 0, RefInstructionLanguageId: ref("language.spanish"), OrganizationCalendarSessionId: null, RecordStartDateTime: start, RecordEndDateTime: null });
    push("OrganizationRelationship", { OrganizationRelationshipId: id(`rel:section:${s.id}`), OrganizationId: org, Parent_OrganizationId: id(`org:course:${s.courseId}`), RefOrganizationRelationshipId: ref("orgRelationship.internal"), RecordStartDateTime: start, RecordEndDateTime: null });
  }

  // ── Contacto y ubicación del establecimiento (fn3FC, fn3FD, fn3C3) ──
  const { location, email, phone } = input.school;
  if (email) push("OrganizationEmail", { OrganizationEmailId: id("orgmail:school"), OrganizationId: schoolOrg, ElectronicMailAddress: email, RefEmailTypeId: ref("emailType.organizational"), RecordStartDateTime: start, RecordEndDateTime: null });
  if (phone) push("OrganizationTelephone", { OrganizationTelephoneId: id("orgtel:school"), OrganizationId: schoolOrg, TelephoneNumber: phoneNumber(phone), PrimaryTelephoneNumberIndicator: 1, RefInstitutionTelephoneTypeId: ref("institutionPhone.main"), RecordStartDateTime: start, RecordEndDateTime: null });
  if (location) {
    const place = id("location:school");
    push("Location", { LocationId: place, RecordStartDateTime: start, RecordEndDateTime: null });
    push("LocationAddress", { LocationId: place, ...addressFields(location), CountyName: comunaByCode.get(location.comunaCode)?.name ?? null, BuildingSiteNumber: location.building, RecordStartDateTime: start, RecordEndDateTime: null });
    push("Classroom", { LocationId: place, ClassroomIdentifier: location.building.slice(0, 30), RecordStartDateTime: start, RecordEndDateTime: null });
    const orgs = ["org:school", ...input.courses.map((c) => `org:course:${c.id}`), ...input.subjects.map((s) => `org:section:${s.id}`)];
    for (const key of orgs) push("OrganizationLocation", { OrganizationLocationId: id(`orgloc:${key}`), OrganizationId: id(key), LocationId: place, RefOrganizationLocationTypeId: ref("orgLocationType.physical"), RecordStartDateTime: start, RecordEndDateTime: null });
    for (const s of input.subjects) push("CourseSectionLocation", { CourseSectionLocationId: id(`secloc:${s.id}`), OrganizationId: id(`org:section:${s.id}`), LocationId: place, RecordStartDateTime: start, RecordEndDateTime: null });
  }
  if (!location || !email || !phone) issues.push({ severity: "error", message: "Faltan la dirección, el correo o el teléfono del establecimiento: el validador los exige" });

  // ── Personas ──
  // (la capacidad se informa aquí para que el aviso quede junto a los cursos)
  if (withoutCapacity.size) issues.push({ severity: "error", message: `${withoutCapacity.size} curso(s) sin capacidad autorizada registrada: el validador la exige en cada asignatura` });
  const opr = (personKey: string, orgKey: string, role: EdeRefKey, entry?: string, exit?: string) => {
    const key = `opr:${personKey}:${orgKey}`;
    const oprId = id(key);
    push("OrganizationPersonRole", {
      OrganizationPersonRoleId: oprId, PersonId: id(personKey), OrganizationId: id(orgKey), RoleId: ref(role),
      EntryDate: entry ? dayStart(entry, tz) : null, ExitDate: exit ? dayStart(exit, tz) : null, RecordStartDateTime: start, RecordEndDateTime: null,
    });
    return oprId;
  };
  const identifier = (personKey: string, system: EdeRefKey, value: string) =>
    push("PersonIdentifier", { PersonIdentifierId: id(`pid:${personKey}:${system}`), PersonId: id(personKey), Identifier: value, RefPersonIdentificationSystemId: ref(system), RecordStartDateTime: start, RecordEndDateTime: null });

  let noBirth = 0, noSex = 0, noAddress = 0, badRut = 0;
  const sectionsOf = new Map<string, string[]>();
  for (const s of input.subjects) sectionsOf.set(s.courseId, [...(sectionsOf.get(s.courseId) ?? []), s.id]);

  for (const st of input.students) {
    const pk = `person:${st.id}`;
    if (!st.birthDate) noBirth++;
    if (!st.sex) noSex++;
    if (!st.address) noAddress++;
    push("Person", { PersonId: id(pk), ...splitNames(st.firstName, st.lastName), Birthdate: st.birthDate ?? null, RefSexId: st.sex ? ref(st.sex === "F" ? "sex.female" : "sex.male") : null, RecordStartDateTime: start, RecordEndDateTime: null });
    const parsed = parseRut(st.rut);
    if (st.document === "RUN" && !parsed) badRut++;
    identifier(pk, st.document === "IPE" ? "idSystem.ipe" : "idSystem.run", parsed ? `${parsed.body}-${parsed.dv}` : st.rut);
    identifier(pk, "idSystem.listNumber", String(st.listNumber));
    if (st.schoolNumber != null) identifier(pk, "idSystem.schoolNumber", String(st.schoolNumber));
    if (st.address) push("PersonAddress", { PersonAddressId: id(`addr:${st.id}`), PersonId: id(pk), ...(st.location ? personAddress(st.location) : { StreetNumberAndName: st.address.slice(0, 40) }), RefPersonLocationTypeId: ref("personLocation.physical"), RecordStartDateTime: start, RecordEndDateTime: null });
    push("PersonStatus", { PersonStatusId: id(`pstatus:${st.id}:asignado`), PersonId: id(pk), RefPersonStatusTypeId: ref("personStatus.asignadoCurso"), StatusValue: 1, StatusStartDate: st.enrolledOn ?? null, StatusEndDate: null, RecordStartDateTime: start, RecordEndDateTime: null });
    push("PersonStatus", { PersonStatusId: id(`pstatus:${st.id}:definitiva`), PersonId: id(pk), RefPersonStatusTypeId: ref("personStatus.matriculaDefinitiva"), StatusValue: 1, StatusStartDate: st.enrolledOn ?? null, StatusEndDate: st.withdrawnOn ?? null, fileScanBase64: st.enrollmentDocId ? documentRow([st.enrollmentDocId]) : null, RecordStartDateTime: start, RecordEndDateTime: null });
    if (st.withdrawnOn) push("PersonStatus", { PersonStatusId: id(`pstatus:${st.id}:retirado`), PersonId: id(pk), RefPersonStatusTypeId: ref("personStatus.retirado"), StatusValue: 1, StatusStartDate: st.enrolledOn ?? st.withdrawnOn, StatusEndDate: st.withdrawnOn, RecordStartDateTime: start, RecordEndDateTime: null });
    const courseRole = opr(pk, `org:course:${st.courseId}`, "role.estudiante", st.enrolledOn, st.withdrawnOn);
    // fn2FA cuenta solo a los vigentes con estado y fecha de ingreso.
    const current = !st.withdrawnOn && st.enrolledOn;
    push("K12StudentEnrollment", { OrganizationPersonRoleId: courseRole, StudentListNumber: st.listNumber, active: st.withdrawnOn ? 0 : 1, RefEnrollmentStatusId: current ? ref("enrollmentStatus.current") : null, FirstEntryDateIntoUSSchool: current ? st.enrolledOn! : null, RecordStartDateTime: start, RecordEndDateTime: null });
    // fn0FB: el estudiante también está en el establecimiento, y su rol en cada asignatura tiene estado «Enrolled».
    opr(pk, "org:school", "role.estudiante", st.enrolledOn, st.withdrawnOn);
    for (const sec of sectionsOf.get(st.courseId) ?? []) {
      const sectionRole = opr(pk, `org:section:${sec}`, "role.estudiante", st.enrolledOn, st.withdrawnOn);
      push("RoleStatus", { RoleStatusId: id(`rstatus:${st.id}:${sec}`), OrganizationPersonRoleId: sectionRole, RefRoleStatusId: ref("roleStatus.enrolled"), StatusStartDate: st.enrolledOn ?? null, StatusEndDate: st.withdrawnOn ?? null, RecordStartDateTime: start, RecordEndDateTime: null });
    }
  }
  if (noBirth || noSex || noAddress) issues.push({ severity: "aviso", message: `Fichas incompletas: ${noBirth} sin fecha de nacimiento, ${noSex} sin sexo, ${noAddress} sin domicilio` });
  if (badRut) issues.push({ severity: "error", message: `${badRut} estudiante(s) con RUN inválido` });

  const staffById = new Map(input.staff.map((p) => [p.id, p]));
  const studentCourse = new Map(input.students.map((s) => [s.id, s.courseId]));
  const staffPerson = (staffId: string) => {
    const pk = `person:${staffId}`;
    if (!ids.has(pk)) {
      const p = staffById.get(staffId);
      const [first = "", ...rest] = (p?.name ?? staffId).split(/\s+/);
      push("Person", { PersonId: id(pk), ...splitNames(first, rest.join(" ")), RecordStartDateTime: start, RecordEndDateTime: null });
      if (p?.rut && parseRut(p.rut)) identifier(pk, "idSystem.run", `${parseRut(p.rut)!.body}-${parseRut(p.rut)!.dv}`);
      for (const [i, d] of (p?.degrees ?? []).entries()) {
        push("PersonDegreeOrCertificate", {
          PersonDegreeOrCertificateId: id(`degree:${staffId}:${i}`), PersonId: id(pk), DegreeOrCertificateTitleOrSubject: d.title, NameOfInstitution: d.institution,
          AwardDate: d.awardDate ?? null, idoneidadDocente: d.idoneidad ? 1 : 0,
          RefDegreeOrCertificateTypeId: d.degreeType ? ref(`degreeType.${d.degreeType}`) : null, RefHigherEducationInstitutionAccreditationStatusId: d.accredited == null ? null : ref(d.accredited ? "accreditation.national" : "accreditation.none"),
          RefEducationVerificationMethodId: d.verification ? ref(`verification.${d.verification}`) : null, RecordStartDateTime: start, RecordEndDateTime: null,
        });
      }
    }
    return pk;
  };
  let staffWithoutRut = 0;
  for (const c of input.courses) if (c.headTeacherId) opr(staffPerson(c.headTeacherId), `org:course:${c.id}`, "role.profesorJefe");
  for (const s of input.subjects) if (s.teacherId) opr(staffPerson(s.teacherId), `org:section:${s.id}`, "role.docente");
  for (const p of input.staff) if (ids.has(`person:${p.id}`) && !(p.rut && parseRut(p.rut))) staffWithoutRut++;
  const teachersWithoutDegree = new Set(input.subjects.map((s) => s.teacherId).filter((t): t is string => !!t && !staffById.get(t)?.degrees?.length)).size;
  if (teachersWithoutDegree) issues.push({ severity: "error", message: `${teachersWithoutDegree} docente(s) sin título registrado: el validador exige el título o certificado de cada docente` });
  if (staffWithoutRut) issues.push({ severity: "error", message: `${staffWithoutRut} docente(s) sin RUN registrado: el validador los identifica por RUN` });

  // ── Apoderados y personas autorizadas a retirar ──
  // Un mismo adulto (por RUN o, sin RUN, por nombre) es una sola persona por estudiante. fn0FA exige que cada estudiante
  // tenga al menos una persona con RetirarEstudianteIndicador = 1; fn8F3 y fn1F* buscan al apoderado por su relación y rol.
  type AdultKind = "apoderado" | "retira" | "otro";
  const schoolRole = (pk: string) => (ids.has(`opr:${pk}:org:school`) ? id(`opr:${pk}:org:school`) : opr(pk, "org:school", "role.retira"));
  const adultPerson = (a: { studentId: string; name: string; rut?: string; location?: StructuredAddress; phone?: string; email?: string }, courseId: string, kind: AdultKind, opts: { retira?: boolean; until?: string } = {}) => {
    const parsed = a.rut ? parseRut(a.rut) : null;
    const pk = `person:adult:${a.studentId}:${parsed ? parsed.body : a.name.trim().toLowerCase()}`;
    if (!ids.has(pk)) {
      // «Nombre [segundo nombre] Apellido1 Apellido2»: los dos últimos son los apellidos si hay más de dos palabras.
      const words = a.name.trim().split(/\s+/);
      const cut = words.length > 2 ? words.length - 2 : 1;
      push("Person", { PersonId: id(pk), ...splitNames(words.slice(0, cut).join(" "), words.slice(cut).join(" ")), RecordStartDateTime: start, RecordEndDateTime: null });
      if (parsed) identifier(pk, "idSystem.run", `${parsed.body}-${parsed.dv}`);
      if (a.location) push("PersonAddress", { PersonAddressId: id(`addr:${pk}`), PersonId: id(pk), ...personAddress(a.location), RefPersonLocationTypeId: ref("personLocation.physical"), RecordStartDateTime: start, RecordEndDateTime: null });
      if (a.phone) push("PersonTelephone", { PersonTelephoneId: id(`tel:${pk}`), PersonId: id(pk), TelephoneNumber: phoneNumber(a.phone), PrimaryTelephoneNumberIndicator: 1, RefPersonTelephoneNumberTypeId: ref("personPhone.mobile"), RecordStartDateTime: start, RecordEndDateTime: null });
      if (a.email) push("PersonEmailAddress", { PersonEmailAddressId: id(`mail:${pk}`), PersonId: id(pk), EmailAddress: a.email, RefEmailTypeId: ref("emailType.home"), RecordStartDateTime: start, RecordEndDateTime: null });
    }
    if (kind === "otro") return pk;
    const relKey = `prel:${pk}:${kind}`;
    if (!ids.has(relKey) && ids.has(`person:${a.studentId}`)) {
      push("PersonRelationship", {
        PersonRelationshipId: id(relKey), PersonId: id(pk), RelatedPersonId: id(`person:${a.studentId}`), RefPersonRelationshipId: ref(kind === "apoderado" ? "relationship.apoderado" : "relationship.autorizadoRetiro"),
        RetirarEstudianteIndicador: opts.retira ? 1 : null, RecordStartDateTime: start, RecordEndDateTime: opts.until ? `${opts.until}T23:59:59${dayStart(opts.until, tz).slice(19)}` : null,
      });
    }
    if (!ids.has(`opr:${pk}:org:course:${courseId}`)) opr(pk, `org:course:${courseId}`, kind === "apoderado" ? "role.apoderado" : "role.retira");
    return pk;
  };
  let noGuardian = 0;
  for (const st of input.students) {
    if (st.guardian?.name.trim()) adultPerson({ studentId: st.id, ...st.guardian }, st.courseId, "apoderado", { retira: true });
    else noGuardian++;
  }
  for (const p of input.pickups) {
    const courseId = studentCourse.get(p.studentId);
    if (courseId) adultPerson(p, courseId, "retira", { retira: true });
  }
  if (noGuardian) issues.push({ severity: "error", message: `${noGuardian} estudiante(s) sin apoderado en la matrícula: el validador exige al menos una persona autorizada para retirarlo` });

  // ── Asistencia ──
  const statusRef: Record<EdeAttendanceStatus, EdeRefKey> = { present: "attStatus.present", late: "attStatus.tardy", absent: "attStatus.unexcusedAbsence", justified: "attStatus.excusedAbsence" };
  for (const a of input.daily) {
    const courseId = studentCourse.get(a.studentId);
    if (!courseId || !ids.has(`opr:person:${a.studentId}:org:course:${courseId}`)) continue;
    push("RoleAttendanceEvent", {
      RoleAttendanceEventId: id(`att:daily:${a.studentId}:${a.date}`), OrganizationPersonRoleId: id(`opr:person:${a.studentId}:org:course:${courseId}`),
      Date: dayStart(a.date, tz), RefAttendanceEventTypeId: ref("attEvent.daily"),
      // fn5E5 y fn6F0: en el registro diario quien llegó atrasado cuenta como presente; el atraso consta en la asignatura.
      RefAttendanceStatusId: ref(statusRef[a.status === "late" ? "present" : a.status]), VirtualIndicator: 0, digitalRandomKey: a.signatureKey ?? null, digitalRandomKeyDate: a.signedAt ? withOffset(a.signedAt, tz) : null, RecordStartDateTime: start, RecordEndDateTime: null,
    });
  }
  let unsigned = 0, noKey = 0;
  for (const l of input.lessons) {
    if (!l.signedAt) {
      unsigned++;
      continue;
    }
    if (!l.signatureKey) noKey++;
    for (const [studentId, status] of Object.entries(l.attendance)) {
      const key = `opr:person:${studentId}:org:section:${l.subjectId}`;
      if (!ids.has(key)) continue;
      push("RoleAttendanceEvent", {
        RoleAttendanceEventId: id(`att:class:${l.id}:${studentId}`), OrganizationPersonRoleId: id(key),
        Date: withOffset(l.signedAt, tz), RefAttendanceEventTypeId: ref("attEvent.classSection"), RefAttendanceStatusId: ref(statusRef[status]), VirtualIndicator: 0,
        digitalRandomKey: l.signatureKey ?? null, digitalRandomKeyDate: withOffset(l.signedAt, tz), RecordStartDateTime: start, RecordEndDateTime: null,
      });
    }
    const signerRole = `opr:person:${l.signerId}:org:section:${l.subjectId}`;
    if (l.signerId && ids.has(signerRole)) {
      push("RoleAttendanceEvent", {
        RoleAttendanceEventId: id(`att:class:${l.id}:firma`), OrganizationPersonRoleId: id(signerRole), Date: withOffset(l.signedAt, tz), RefAttendanceEventTypeId: ref("attEvent.classSection"),
        RefAttendanceStatusId: ref("attStatus.present"), VirtualIndicator: 0, digitalRandomKey: l.signatureKey ?? null, digitalRandomKeyDate: withOffset(l.signedAt, tz), RecordStartDateTime: start, RecordEndDateTime: null,
      });
    }
  }
  if (unsigned) issues.push({ severity: "aviso", message: `${unsigned} clase(s) sin firmar no se exportan` });
  if (noKey) issues.push({ severity: "error", message: `${noKey} clase(s) firmadas sin el código del verificador: el validador exige la firma en cada registro de asistencia` });

  // ── Salidas o retiros (fn0FB): tres eventos «EarlyDeparture» a la misma hora ──
  // 1) el estudiante en la asignatura en curso, 2) el estudiante en el establecimiento, 3) quien retira, ratificado por el funcionario.
  const staffSchoolRole = (staffId: string) => {
    const pk = staffPerson(staffId);
    return ids.has(`opr:${pk}:org:school`) ? id(`opr:${pk}:org:school`) : opr(pk, "org:school", "role.funcionario");
  };
  let exitUnsigned = 0, exitNoClass = 0, exitNoPickupProof = 0, exitOneOff = 0;
  for (const e of input.exits) {
    if (!ids.has(`opr:person:${e.studentId}:org:course:${e.courseId}`)) continue;
    const when = `${e.date}T${e.exitTime}:00${dayStart(e.date, tz).slice(19)}`;
    const key = e.signatureKey ?? null;
    const keyDate = e.signedAt ? withOffset(e.signedAt, tz) : null;
    if (!key) exitUnsigned++;
    const base = { RefAttendanceStatusId: ref("attStatus.earlyDeparture"), Date: when, VirtualIndicator: 0, observaciones: e.reason, RecordStartDateTime: start, RecordEndDateTime: null };
    const sectionRole = e.subjectId ? `opr:person:${e.studentId}:org:section:${e.subjectId}` : "";
    if (sectionRole && ids.has(sectionRole)) push("RoleAttendanceEvent", { RoleAttendanceEventId: id(`att:exit:class:${e.id}`), OrganizationPersonRoleId: id(sectionRole), RefAttendanceEventTypeId: ref("attEvent.classSection"), ...base, digitalRandomKey: key, digitalRandomKeyDate: keyDate });
    else exitNoClass++;
    push("RoleAttendanceEvent", { RoleAttendanceEventId: id(`att:exit:school:${e.id}`), OrganizationPersonRoleId: id(`opr:person:${e.studentId}:org:school`), RefAttendanceEventTypeId: ref("attEvent.establecimiento"), ...base, digitalRandomKey: key, digitalRandomKeyDate: keyDate });
    // Quien no estaba en el registro de autorizados retira con permiso del apoderado solo por ese día.
    if (!e.pickup.authorized) exitOneOff++;
    const pk = adultPerson({ studentId: e.studentId, name: e.pickup.name, rut: e.pickup.rut }, e.courseId, "retira", { retira: true, until: e.pickup.authorized ? undefined : e.date });
    const proof = documentRow(e.docIds);
    if (proof == null) exitNoPickupProof++;
    push("RoleAttendanceEvent", {
      RoleAttendanceEventId: id(`att:exit:pickup:${e.id}`), OrganizationPersonRoleId: schoolRole(pk), RefAttendanceEventTypeId: ref("attEvent.establecimiento"), ...base,
      oprIdRatificador: staffById.has(e.by) ? staffSchoolRole(e.by) : null, firmaRatificador: key, fechaRatificador: keyDate, fileScanBase64: proof,
    });
  }
  if (exitUnsigned) issues.push({ severity: "error", message: `${exitUnsigned} retiro(s) sin firma con verificador de quien los registró: el validador exige digitalRandomKey y firmaRatificador` });
  if (exitNoClass) issues.push({ severity: "error", message: `${exitNoClass} retiro(s) fuera del horario de clases o de cursos sin horario: falta el evento de la asignatura en curso` });
  if (exitNoPickupProof) issues.push({ severity: "error", message: `${exitNoPickupProof} retiro(s) sin la firma en pantalla de quien retira ni su poder escaneado` });
  if (exitOneOff) issues.push({ severity: "aviso", message: `${exitOneOff} retiro(s) por personas fuera del registro de autorizados: su autorización se exporta solo por ese día, y el validador las rechaza` });

  // ── Horario (CourseSectionSchedule) y una sesión de calendario por día de clase firmada ──
  const DAY = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  for (const h of input.schedule) {
    if (!ids.has(`org:section:${h.subjectId}`)) continue;
    push("CourseSectionSchedule", {
      CourseSectionScheduleId: id(`css:${h.subjectId}:${h.weekday}:${h.period}`), OrganizationId: id(`org:section:${h.subjectId}`),
      ClassMeetingDays: DAY[h.weekday]!, ClassBeginningTime: withSeconds(h.start), ClassEndingTime: withSeconds(h.end), ClassPeriod: `Bloque${String(h.period).padStart(2, "0")}`, RecordStartDateTime: start, RecordEndDateTime: null,
    });
  }
  const scheduled = new Set(input.schedule.map((h) => h.subjectId));
  const signed = input.lessons.filter((l) => l.signedAt);
  const withoutSchedule = new Set(signed.filter((l) => !scheduled.has(l.subjectId)).map((l) => l.subjectId));
  if (withoutSchedule.size) issues.push({ severity: "error", message: `${withoutSchedule.size} asignatura(s) con clases firmadas no tienen horario: el validador comprueba que la firma ocurra dentro del bloque` });
  const outside = signed.filter((l) => scheduled.has(l.subjectId) && l.withinSchedule === false).length;
  if (outside) issues.push({ severity: "aviso", message: `${outside} clase(s) se firmaron fuera del horario del bloque: el validador no las aceptará` });
  const signedLessons = signed;
  // fn5E5: la sesión de un día de clase lleva la hora del bloque en que se firmó.
  const blockOfDay = new Map<string, { start: string; end: string }>();
  for (const l of signedLessons) {
    const weekday = new Date(`${l.date}T12:00:00Z`).getUTCDay();
    const at = withOffset(l.signedAt!, tz).slice(11, 16);
    const blocks = input.schedule.filter((h) => h.subjectId === l.subjectId && h.weekday === weekday);
    const block = blocks.find((h) => h.start <= at && at <= h.end) ?? blocks[0];
    if (block) blockOfDay.set(`${l.subjectId}:${l.date}`, block);
  }

  // ── Evaluaciones y notas ──
  // eslint-disable-next-line prefer-const
  let sessionFor: (subjectId: string, date: string, description: string) => number;
  sessionFor = (subjectId: string, date: string, description: string) => {
    const calKey = `cal:section:${subjectId}`;
    if (!ids.has(calKey)) push("OrganizationCalendar", { OrganizationCalendarId: id(calKey), OrganizationId: id(`org:section:${subjectId}`), CalendarCode: input.school.year, CalendarYear: input.school.year, CalendarDescription: `Clases ${input.school.year}`.slice(0, 60), RecordStartDateTime: start, RecordEndDateTime: null });
    const sessKey = `sess:${subjectId}:${date}`;
    const block = blockOfDay.get(`${subjectId}:${date}`);
    if (!ids.has(sessKey)) push("OrganizationCalendarSession", { OrganizationCalendarSessionId: id(sessKey), OrganizationCalendarId: id(calKey), BeginDate: date, EndDate: date, SessionStartTime: block ? withSeconds(block.start) : null, SessionEndTime: block ? withSeconds(block.end) : null, Description: description, AttendanceTermIndicator: 1, RecordStartDateTime: start, RecordEndDateTime: null });
    return id(sessKey);
  };
  const totalWeight = new Map<string, number>();
  for (const e of input.evaluations) totalWeight.set(e.subjectId, (totalWeight.get(e.subjectId) ?? 0) + e.weight);
  const evaluationById = new Map(input.evaluations.map((e) => [e.id, e]));
  let unsignedEvaluations = 0;
  for (const e of input.evaluations) {
    const section = `org:section:${e.subjectId}`;
    if (!ids.has(section)) continue;
    if (!e.signatureKey) unsignedEvaluations++;
    const a = id(`asmt:${e.id}`), adm = id(`asmtadm:${e.id}`), ses = id(`asmtses:${e.id}`);
    push("Assessment", { AssessmentId: a, Identifier: e.id.slice(0, 40), Title: e.title.slice(0, 60), AssessmentFamilyTitle: e.title.slice(0, 60), ShortName: e.title.slice(0, 30), RefAssessmentTypeId: ref("assessmentType.sumativa"), RefAcademicSubjectId: ref(`academicSubject.${subjectArea(input.subjects.find((s) => s.id === e.subjectId)?.name ?? "")}`), RecordStartDateTime: start, RecordEndDateTime: null });
    push("AssessmentAdministration", { AssessmentAdministrationId: adm, AssessmentId: a, Name: e.title.slice(0, 30), StartDate: e.date, FinishDate: e.date, RecordStartDateTime: start, RecordEndDateTime: null });
    push("Assessment_AssessmentAdministration", { Assessment_AssessmentAdministrationId: id(`aaa:${e.id}`), AssessmentId: a, AssessmentAdministrationId: adm, RecordStartDateTime: start, RecordEndDateTime: null });
    push("AssessmentAdministration_Organization", { AssessmentAdministration_OrganizationId: id(`aao:${e.id}`), AssessmentAdministrationId: adm, OrganizationId: id(section), RecordStartDateTime: start, RecordEndDateTime: null });
    push("AssessmentSession", { AssessmentSessionId: ses, AssessmentAdministrationId: adm, OrganizationId: id(section), School_OrganizationId: schoolOrg, ScheduledStartDateTime: dayStart(e.date, tz), RecordStartDateTime: start, RecordEndDateTime: null });
    sessionFor(e.subjectId, e.date, `Evaluación: ${e.title}`);
  }
  for (const l of signedLessons) sessionFor(l.subjectId, l.date, `Clases del ${l.date}`);
  if (unsignedEvaluations) issues.push({ severity: "error", message: `${unsignedEvaluations} evaluación(es) sin firma del docente: el validador exige el código del verificador en cada nota (LearnerActivity.digitalRandomKey)` });

  let gradesOut = 0;
  for (const g of input.grades) {
    const e = evaluationById.get(g.evaluationId);
    const studentOrg = e && `opr:person:${g.studentId}:org:section:${e.subjectId}`;
    if (!e || !studentOrg || !ids.has(studentOrg)) continue;
    const pk = `person:${g.studentId}`;
    const reg = id(`asmtreg:${e.id}:${g.studentId}`);
    push("AssessmentSessionStaffRole", { AssessmentSessionStaffRoleId: id(`assr:${e.id}:${g.studentId}`), AssessmentSessionId: id(`asmtses:${e.id}`), PersonId: id(pk), RefAssessmentSessionStaffRoleTypeId: ref("assessmentStaffRole.estudiante"), RecordStartDateTime: start, RecordEndDateTime: null });
    push("AssessmentRegistration", { AssessmentRegistrationId: reg, AssessmentAdministrationId: id(`asmtadm:${e.id}`), PersonId: id(pk), CourseSectionOrganizationId: id(`org:section:${e.subjectId}`), SchoolOrganizationId: schoolOrg, OrganizationId: id(`org:section:${e.subjectId}`), CreationDate: dayStart(e.date, tz), RecordStartDateTime: start, RecordEndDateTime: null });
    // El validador quita las comas y mide el largo: la nota va con punto y un decimal («5.5»).
    push("AssessmentResult", { AssessmentResultId: id(`asmtres:${e.id}:${g.studentId}`), AssessmentRegistrationId: reg, ScoreValue: (Math.round(g.value * 10) / 10).toFixed(1), RefScoreMetricTypeId: ref("scoreMetric.nota"), RecordStartDateTime: start, RecordEndDateTime: null });
    const total = totalWeight.get(e.subjectId) || e.weight || 1;
    push("LearnerActivity", {
      LearnerActivityId: id(`la:${e.id}:${g.studentId}`), AssessmentRegistrationId: reg, PersonId: id(pk), CourseSectionId: id(`org:section:${e.subjectId}`), Title: e.title.slice(0, 30), CreationDate: e.date,
      Weight: Math.round((e.weight / total) * 10000) / 100, OrganizationCalendarSessionId: id(`sess:${e.subjectId}:${e.date}`),
      digitalRandomKey: e.signatureKey ?? null, DateDigitalRandomKey: e.signedAt ? withOffset(e.signedAt, tz) : null, personIDDigitalRandomKey: e.signerId && ids.has(`person:${e.signerId}`) ? id(`person:${e.signerId}`) : null,
      RecordStartDateTime: start, RecordEndDateTime: null,
    });
    gradesOut++;
  }
  if (input.grades.length > gradesOut) issues.push({ severity: "aviso", message: `${input.grades.length - gradesOut} nota(s) de estudiantes fuera de la asignatura no se exportan` });

  // ── Anotaciones: un incidente por anotación, con el estudiante y quien la registró ──
  let noTime = 0, negativeWithoutAction = 0, negativeWithoutArticle = 0, unsignedConduct = 0;
  for (const c of input.conduct) {
    const courseId = studentCourse.get(c.studentId);
    if (!courseId) continue;
    const studentRole = `opr:person:${c.studentId}:org:course:${courseId}`;
    if (!ids.has(studentRole)) continue;
    if (!c.time) noTime++;
    const negative = c.kind === "negative";
    const inc = id(`inc:${c.id}`);
    const reporter = staffById.has(c.recordedBy) ? staffPerson(c.recordedBy) : null;
    push("Incident", {
      IncidentId: inc, IncidentIdentifier: c.id.slice(0, 40), IncidentDate: c.date, IncidentTime: c.time ?? null, IncidentDescription: c.description,
      RefIncidentBehaviorId: ref(negative ? "incidentBehavior.negativa" : "incidentBehavior.positiva"), RefIncidentTimeDescriptionCodeId: ref("incidentTime.horaClases"),
      RegulationViolatedDescription: negative ? JSON.stringify({ ArtículoProtocolo: c.article ?? null, Severidad: c.severity ?? null, Procedimiento: c.measures?.length ? c.measures.map((m) => m.type).join(", ") : null }) : null,
      IncidentReporterId: reporter ? id(reporter) : null, RefIncidentReporterTypeId: reporter ? ref("incidentReporterType.docente") : null,
      OrganizationId: id(`org:course:${courseId}`), OrganizationPersonRoleId: id(studentRole), RecordStartDateTime: start, RecordEndDateTime: null,
    });
    push("IncidentPerson", { IncidentId: inc, PersonId: id(`person:${c.studentId}`), Identifier: c.id.slice(0, 40), RefIncidentPersonTypeId: ref("incidentPersonType.estudiante"), RefIncidentPersonRoleTypeId: ref("incidentPersonRole.estudiante"), Date: c.time ? `${c.date}T${c.time}${dayStart(c.date, tz).slice(19)}` : dayStart(c.date, tz), RecordStartDateTime: start, RecordEndDateTime: null });
    // Quien registra firma con su verificador (fn8F2: el docente necesita digitalRandomKey o un documento).
    if (reporter) {
      if (!c.signatureKey) unsignedConduct++;
      push("IncidentPerson", { IncidentId: inc, PersonId: id(reporter), Identifier: `${c.id}:registra`.slice(0, 40), RefIncidentPersonTypeId: ref("incidentPersonType.docente"), RefIncidentPersonRoleTypeId: ref("incidentPersonRole.registra"), Date: c.signedAt ? withOffset(c.signedAt, tz) : dayStart(c.date, tz), digitalRandomKey: c.signatureKey ?? null, RecordStartDateTime: start, RecordEndDateTime: null });
    }
    if (negative) {
      if (!c.article) negativeWithoutArticle++;
      for (const m of c.measures ?? []) {
        push("K12StudentDiscipline", {
          K12StudentDisciplineId: id(`disc:${m.id}`), IncidentId: inc, personId: id(`person:${c.studentId}`), OrganizationPersonRoleId: id(studentRole),
          RefDisciplinaryActionTakenId: ref(`disciplinaryAction.${m.type}`), DisciplinaryActionStartDate: m.from ?? c.date, DisciplinaryActionEndDate: m.to ?? null,
          DurationOfDisciplinaryAction: measureDays(m) ?? null, FullYearExpulsion: m.type === "expulsion" ? 1 : 0, RecordStartDateTime: start, RecordEndDateTime: null,
        });
      }
      if (!c.measures?.length) negativeWithoutAction++;
    }
  }
  if (noTime) issues.push({ severity: "error", message: `${noTime} anotación(es) sin hora: el validador exige IncidentTime. Solo las registradas en INSEDU la tienen` });
  if (negativeWithoutAction) issues.push({ severity: "error", message: `${negativeWithoutAction} anotación(es) negativa(s) sin medida disciplinaria registrada (K12StudentDiscipline)` });
  if (negativeWithoutArticle) issues.push({ severity: "error", message: `${negativeWithoutArticle} anotación(es) negativa(s) sin el artículo del reglamento interno que se infringió` });
  if (unsignedConduct) issues.push({ severity: "error", message: `${unsignedConduct} anotación(es) sin firma de quien la registró: el validador exige el código del verificador del docente` });

  // ── Entrevistas y reuniones con apoderados ──
  // fn8F3: cada una necesita al apoderado (tipo «Apoderado», relación «Apoderado(a)/Tutor(a)», rol «Padre, madre o
  // apoderado») con el acta escaneada en IncidentPerson.fileScanBase64 → Document.documentId.
  let withoutActa = 0, actaWithoutContent = 0, guardiansWithoutRut = 0, meetingsOut = 0;
  for (const m of input.meetings) {
    if (!ids.has(`org:course:${m.courseId}`)) continue;
    const interview = m.kind === "entrevista";
    const inc = id(`inc:meeting:${m.id}`);
    const studentRole = m.studentId ? `opr:person:${m.studentId}:org:course:${m.courseId}` : "";
    const when = `${m.date}T${m.time}:00${dayStart(m.date, tz).slice(19)}`;
    push("Incident", {
      IncidentId: inc, IncidentIdentifier: m.id.slice(0, 40), IncidentDate: m.date, IncidentTime: `${m.time}:00`, IncidentDescription: m.description,
      RefIncidentBehaviorId: ref(interview ? "incidentBehavior.entrevista" : "incidentBehavior.reunion"), RefIncidentTimeDescriptionCodeId: ref("incidentTime.horaClases"),
      RegulationViolatedDescription: null, IncidentReporterId: null, RefIncidentReporterTypeId: null,
      OrganizationId: id(`org:course:${m.courseId}`), OrganizationPersonRoleId: studentRole && ids.has(studentRole) ? id(studentRole) : null, RecordStartDateTime: start, RecordEndDateTime: null,
    });
    if (interview && m.studentId && ids.has(`person:${m.studentId}`)) {
      push("IncidentPerson", { IncidentId: inc, PersonId: id(`person:${m.studentId}`), Identifier: `${m.id}:est`.slice(0, 40), RefIncidentPersonTypeId: ref("incidentPersonType.estudiante"), RefIncidentPersonRoleTypeId: ref("incidentPersonRole.estudiante"), Date: when, RecordStartDateTime: start, RecordEndDateTime: null });
    }
    if (staffById.has(m.by)) {
      push("IncidentPerson", {
        IncidentId: inc, PersonId: id(staffPerson(m.by)), Identifier: `${m.id}:conduce`.slice(0, 40), RefIncidentPersonTypeId: ref(m.byTeacher ? "incidentPersonType.docente" : "incidentPersonType.profesional"),
        RefIncidentPersonRoleTypeId: ref(interview ? "incidentPersonRole.entrevistador" : "incidentPersonRole.dirigeReunion"), Date: withOffset(m.signedAt, tz), digitalRandomKey: m.signatureKey ?? null, RecordStartDateTime: start, RecordEndDateTime: null,
      });
    }
    // Un acta por registro; si se adjuntó más de una, vale la primera con contenido.
    const acta = documentRow(m.actaIds);
    if (!m.actaIds.length) withoutActa++;
    else if (acta == null) actaWithoutContent++;
    for (const [i, a] of m.attendees.entries()) {
      if (!a.rut) guardiansWithoutRut++;
      const pk = adultPerson(a, m.courseId, "apoderado");
      push("IncidentPerson", {
        IncidentId: inc, PersonId: id(pk), Identifier: `${m.id}:a${i + 1}`, RefIncidentPersonTypeId: ref("incidentPersonType.apoderado"),
        RefIncidentPersonRoleTypeId: ref(interview ? "incidentPersonRole.entrevistado" : "incidentPersonRole.asisteReunion"), Date: when, fileScanBase64: acta, RecordStartDateTime: start, RecordEndDateTime: null,
      });
    }
    meetingsOut++;
  }
  if (!meetingsOut) issues.push({ severity: "aviso", message: "No hay entrevistas ni reuniones con apoderados registradas" });
  if (withoutActa) issues.push({ severity: "error", message: `${withoutActa} entrevista(s) o reunión(es) sin el acta firmada escaneada: el validador exige el documento del apoderado` });
  if (actaWithoutContent) issues.push({ severity: "error", message: `${actaWithoutContent} acta(s) adjunta(s) no se pudieron leer, así que no se exportan` });
  if (guardiansWithoutRut) issues.push({ severity: "aviso", message: `${guardiansWithoutRut} asistente(s) a entrevistas o reuniones sin RUN registrado` });

  // ── Entrega de documentación (fn1FA, fn1FC) ──
  // Al estudiante retirado: «Entrega de documentos retiro de un estudiante»; a los demás, «continuidad de estudios».
  const withdrawnIds = new Set(input.students.filter((s) => s.withdrawnOn).map((s) => s.id));
  const deliveredTo = new Set<string>();
  const staffType: Record<"docente" | "profesional" | "administrativo", EdeRefKey> = { docente: "incidentPersonType.docente", profesional: "incidentPersonType.profesional", administrativo: "incidentPersonType.administrativo" };
  let deliveryUnsigned = 0, deliveryNoReceipt = 0, deliveryNotGuardian = 0;
  for (const d of input.deliveries) {
    const studentRole = `opr:person:${d.studentId}:org:course:${d.courseId}`;
    if (!ids.has(studentRole)) continue;
    deliveredTo.add(d.studentId);
    const inc = id(`inc:delivery:${d.id}`);
    const time = d.time ?? "00:00";
    const when = `${d.on}T${time}:00${dayStart(d.on, tz).slice(19)}`;
    const reporter = staffById.has(d.by) ? staffPerson(d.by) : null;
    push("Incident", {
      IncidentId: inc, IncidentIdentifier: d.id.slice(0, 40), IncidentDate: d.on, IncidentTime: `${time}:00`, IncidentDescription: d.documents,
      RefIncidentBehaviorId: ref(withdrawnIds.has(d.studentId) ? "incidentBehavior.entregaRetiro" : "incidentBehavior.entregaContinuidad"), RefIncidentTimeDescriptionCodeId: ref("incidentTime.horaClases"),
      RegulationViolatedDescription: null, IncidentReporterId: reporter ? id(reporter) : null, RefIncidentReporterTypeId: reporter ? ref("incidentReporterType.docente") : null,
      OrganizationId: id(`org:course:${d.courseId}`), OrganizationPersonRoleId: id(studentRole), RecordStartDateTime: start, RecordEndDateTime: null,
    });
    if (reporter) {
      if (!d.signatureKey) deliveryUnsigned++;
      push("IncidentPerson", { IncidentId: inc, PersonId: id(reporter), Identifier: `${d.id}:entrega`.slice(0, 40), RefIncidentPersonTypeId: ref(staffType[d.byKind]), RefIncidentPersonRoleTypeId: ref("incidentPersonRole.entrega"), Date: d.signedAt ? withOffset(d.signedAt, tz) : when, digitalRandomKey: d.signatureKey ?? null, RecordStartDateTime: start, RecordEndDateTime: null });
    }
    const receipt = documentRow(d.docIds);
    if (receipt == null) deliveryNoReceipt++;
    const receiverKey = d.receiver.kind === "estudiante" ? `person:${d.studentId}` : adultPerson({ studentId: d.studentId, name: d.receiver.name, rut: d.receiver.rut }, d.courseId, d.receiver.kind === "apoderado" ? "apoderado" : "otro");
    if (d.receiver.kind !== "apoderado") deliveryNotGuardian++;
    push("IncidentPerson", {
      IncidentId: inc, PersonId: id(receiverKey), Identifier: `${d.id}:recibe`.slice(0, 40),
      RefIncidentPersonTypeId: ref(d.receiver.kind === "apoderado" ? "incidentPersonType.apoderado" : d.receiver.kind === "estudiante" ? "incidentPersonType.estudiante" : "incidentPersonType.otro"),
      RefIncidentPersonRoleTypeId: ref("incidentPersonRole.recibe"), Date: when, fileScanBase64: receipt, RecordStartDateTime: start, RecordEndDateTime: null,
    });
  }
  const withdrawnWithout = [...withdrawnIds].filter((s) => !deliveredTo.has(s)).length;
  if (deliveryUnsigned) issues.push({ severity: "error", message: `${deliveryUnsigned} entrega(s) de documentos sin firma con verificador de quien entregó` });
  if (deliveryNoReceipt) issues.push({ severity: "error", message: `${deliveryNoReceipt} entrega(s) sin firma de recepción en pantalla ni comprobante escaneado: el validador exige el documento` });
  if (deliveryNotGuardian) issues.push({ severity: "aviso", message: `${deliveryNotGuardian} entrega(s) recibidas por alguien que no es el apoderado: el validador busca al apoderado` });
  if (withdrawnWithout) issues.push({ severity: "error", message: `${withdrawnWithout} estudiante(s) retirado(s) sin entrega de documentos registrada` });

  // ── Instrumentos de interés general recibidos por los apoderados (fn1FB) ──
  let instrumentsWithoutFile = 0, instrumentsWithoutAcks = 0;
  for (const d of input.institutional) {
    if (!d.acks.length) {
      instrumentsWithoutAcks++;
      continue;
    }
    const file = documentRow(d.docIds);
    if (file == null) instrumentsWithoutFile++;
    const inc = id(`inc:institutional:${d.id}`);
    const reporter = staffById.has(d.by) ? staffPerson(d.by) : null;
    const published = withOffset(d.publishedAt, tz);
    push("Incident", {
      IncidentId: inc, IncidentIdentifier: d.id.slice(0, 40), IncidentDate: published.slice(0, 10), IncidentTime: published.slice(11, 19), IncidentDescription: d.title,
      RefIncidentBehaviorId: ref("incidentBehavior.interesGeneral"), RefIncidentTimeDescriptionCodeId: ref("incidentTime.horaClases"), RegulationViolatedDescription: null,
      IncidentReporterId: reporter ? id(reporter) : null, RefIncidentReporterTypeId: reporter ? ref("incidentReporterType.docente") : null,
      OrganizationId: schoolOrg, OrganizationPersonRoleId: null, RecordStartDateTime: start, RecordEndDateTime: null,
    });
    for (const [i, a] of d.acks.entries()) {
      const courseId = studentCourse.get(a.studentId);
      if (!courseId) continue;
      const pk = adultPerson({ studentId: a.studentId, name: a.name, rut: a.rut }, courseId, "apoderado");
      push("IncidentPerson", { IncidentId: inc, PersonId: id(pk), Identifier: `${d.id}:a${i + 1}`.slice(0, 40), RefIncidentPersonTypeId: ref("incidentPersonType.apoderado"), RefIncidentPersonRoleTypeId: ref("incidentPersonRole.recibe"), Date: withOffset(a.at, tz), fileScanBase64: file, RecordStartDateTime: start, RecordEndDateTime: null });
    }
  }
  if (instrumentsWithoutFile) issues.push({ severity: "error", message: `${instrumentsWithoutFile} instrumento(s) de interés general sin el archivo adjunto: el validador exige el documento entregado` });
  if (instrumentsWithoutAcks) issues.push({ severity: "aviso", message: `${instrumentsWithoutAcks} instrumento(s) de interés general que ningún apoderado ha confirmado recibir` });

  // ── Programa de Integración Escolar: solo la nómina, sin diagnósticos ──
  for (const p of input.pie) {
    const courseId = studentCourse.get(p.studentId);
    const role = courseId && `opr:person:${p.studentId}:org:course:${courseId}`;
    if (!role || !ids.has(role)) continue;
    push("PersonStatus", { PersonStatusId: id(`pstatus:${p.studentId}:pie:${p.since}`), PersonId: id(`person:${p.studentId}`), RefPersonStatusTypeId: ref("personStatus.pie"), StatusValue: 1, StatusStartDate: p.since, StatusEndDate: p.until ?? null, RecordStartDateTime: start, RecordEndDateTime: null });
  }
  if (input.pie.length) issues.push({ severity: "aviso", message: "El validador oficial no revisa el PIE: se exporta solo la nómina del programa, sin diagnósticos, y su formato no está confirmado" });

  // ── Calendario: año escolar y suspensiones ──
  const calendar = id("cal:year");
  push("OrganizationCalendar", { OrganizationCalendarId: calendar, OrganizationId: schoolOrg, CalendarCode: input.school.year, CalendarYear: input.school.year, CalendarDescription: `Año escolar ${input.school.year}`, RecordStartDateTime: start, RecordEndDateTime: null });
  // fn9F2: cada curso con estudiantes tiene su propio calendario.
  const { firstDay, lastDay } = input.school;
  for (const c of input.courses) {
    push("OrganizationCalendar", { OrganizationCalendarId: id(`cal:course:${c.id}`), OrganizationId: id(`org:course:${c.id}`), CalendarCode: input.school.year, CalendarYear: input.school.year, CalendarDescription: `${c.name} ${input.school.year}`.slice(0, 60), RecordStartDateTime: start, RecordEndDateTime: null });
    // fn6F0: revisa la asistencia de cada día hábil entre la primera y la última fecha de clases.
    if (firstDay && lastDay) push("OrganizationCalendarSession", { OrganizationCalendarSessionId: id(`sess:course:${c.id}`), OrganizationCalendarId: id(`cal:course:${c.id}`), BeginDate: firstDay, EndDate: lastDay, FirstInstructionDate: firstDay, LastInstructionDate: lastDay, Description: `Periodo escolar ${input.school.year}`, AttendanceTermIndicator: 1, RecordStartDateTime: start, RecordEndDateTime: null });
  }
  for (const s of input.suspensions) {
    push("OrganizationCalendarEvent", { OrganizationCalendarEventId: id(`calev:${s.id}`), OrganizationCalendarId: calendar, Name: s.reason.slice(0, 30), EventDate: s.date, RefCalendarEventType: ref("calendarEvent.suspension"), indicadorSinClases: 1, rexNumber: s.rexNumber ?? null, rexDate: s.rexDate ?? null, fileScanBase64: s.rexDocId ? documentRow([s.rexDocId]) : null, RecordStartDateTime: start, RecordEndDateTime: null });
  }

  // fn3F9: IncidentPerson.Date es una fecha corta. La hora del hecho queda en Incident.IncidentTime.
  for (const p of tables.IncidentPerson ?? []) p.Date = String(p.Date).slice(0, 10);

  if (missing.size) issues.unshift({ severity: "error", message: `Faltan ${missing.size} código(s) oficiales del EDE: ${[...missing].join(", ")}. Genere el diccionario desde la base del validador` });

  const groups: Record<string, string[]> = {
    _Organizaciones: ["Organization", "OrganizationIdentifier", "OrganizationRelationship", "OrganizationEmail", "OrganizationTelephone", "OrganizationLocation"],
    _Comunes: ["Document"],
    _Evaluaciones: ["Assessment", "AssessmentAdministration", "Assessment_AssessmentAdministration", "AssessmentAdministration_Organization", "AssessmentSession", "AssessmentSessionStaffRole", "AssessmentRegistration", "AssessmentResult", "LearnerActivity"],
    _Incidentes: ["Incident", "IncidentPerson", "K12StudentDiscipline"],
    _Personas: ["Person", "PersonIdentifier", "PersonAddress", "PersonTelephone", "PersonEmailAddress", "PersonStatus", "PersonRelationship", "PersonDegreeOrCertificate"],
    _ComunidadEducativa: ["OrganizationPersonRole", "RoleStatus", "K12StudentEnrollment", "RoleAttendanceEvent"],
    _Cursos: ["Course", "CourseSection", "CourseSectionSchedule", "Location", "LocationAddress", "Classroom", "CourseSectionLocation"],
    _Calendarios: ["OrganizationCalendar", "OrganizationCalendarSession", "OrganizationCalendarEvent"],
  };
  // El parser oficial recorre cada elemento del grupo buscando la tabla: un solo objeto con todas las tablas del grupo.
  const json: EdeJson = Object.fromEntries(Object.entries(groups).map(([g, ts]) => [g, [Object.fromEntries(ts.filter((t) => tables[t]?.length).map((t) => [t, tables[t]!]))]]));
  const counts = Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length]));
  return { json, issues, counts };
}

/** Código de enseñanza y grado de listValidationData.xlsx para Básica y Media científico-humanista regular. */
/** El validador exige «RBD» seguido de cinco dígitos. */
export function rbdIdentifier(rbd: string): string {
  const digits = rbd.replace(/\D/g, "");
  return `RBD${digits.slice(0, 5).padStart(5, "0")}`;
}

export function gradeCodes(level: string): { nivel: string; ensenanza: string; grado: string } | null {
  const m = level.match(/^\s*(\d)\s*°?\s*(B[aá]sico|Medio)/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (/medio/i.test(m[2]!)) return n >= 1 && n <= 4 ? { nivel: "05:Enseñanza Media Humanístico Científica Jóvenes", ensenanza: "310:Enseñanza Media H-C niños y jóvenes", grado: `310.0${n}:${n}º medio` } : null;
  return n >= 1 && n <= 8 ? { nivel: "02:Enseñanza Básica Niños", ensenanza: "110:Enseñanza Básica", grado: `110.0${n}:${n}º Básico` } : null;
}
