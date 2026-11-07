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
 * Pendiente: evaluaciones, anotaciones, PIE, salidas, entregas y documentos.
 */
import { parseRut } from "../rut";
import type { EdeRefKey, EdeRefs } from "./refs";

export type EdeAttendanceStatus = "present" | "late" | "absent" | "justified";

export type EdeInput = {
  school: { rbd: string; name: string; year: string };
  courses: { id: string; name: string; headTeacherId?: string }[];
  subjects: { id: string; courseId: string; name: string; teacherId?: string }[];
  students: {
    id: string; rut: string; document: "RUN" | "IPE"; firstName: string; lastName: string; birthDate?: string; sex?: "F" | "M";
    address?: string; courseId: string; listNumber: number; schoolNumber?: number; enrolledOn?: string; withdrawnOn?: string;
  }[];
  staff: { id: string; rut?: string; name: string }[];
  daily: { studentId: string; date: string; status: EdeAttendanceStatus }[];
  lessons: { id: string; subjectId: string; date: string; attendance: Record<string, EdeAttendanceStatus>; signedAt?: string; signerId?: string; signatureKey?: string; withinSchedule?: boolean }[];
  /** Horario: una fila por asignatura, día y hora de la jornada. */
  schedule: { subjectId: string; weekday: 1 | 2 | 3 | 4 | 5; period: number; start: string; end: string }[];
  suspensions: { id: string; date: string; reason: string; authorization: string }[];
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

/** «Pérez Soto» → apellido paterno y materno; «Ana María» → nombre y segundo nombre. */
export function splitNames(firstName: string, lastName: string) {
  const [first = "", ...middle] = firstName.trim().split(/\s+/);
  const [last = "", ...second] = lastName.trim().split(/\s+/);
  return { FirstName: first, MiddleName: middle.join(" "), LastName: last, SecondLastName: second.join(" ") };
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
  let seq = 0;
  const ids = new Map<string, number>();
  const id = (key: string) => {
    if (!ids.has(key)) ids.set(key, ++seq);
    return ids.get(key)!;
  };

  const tables: Record<string, Row[]> = {};
  const push = (table: string, row: Row) => void (tables[table] ??= []).push(row);

  // ── Organizaciones: establecimiento → cursos → asignaturas ──
  const schoolOrg = id("org:school");
  push("Organization", { OrganizationId: schoolOrg, Name: input.school.name, ShortName: input.school.name.slice(0, 30), RefOrganizationTypeId: ref("orgType.school"), RecordStartDateTime: start, RecordEndDateTime: null });
  push("OrganizationIdentifier", { OrganizationIdentifierId: id("orgid:rbd"), OrganizationId: schoolOrg, Identifier: input.school.rbd, RefOrganizationIdentificationSystemId: ref("orgIdSystem.rbd"), RecordStartDateTime: start, RecordEndDateTime: null });
  for (const c of input.courses) {
    const org = id(`org:course:${c.id}`);
    push("Organization", { OrganizationId: org, Name: c.name, ShortName: c.name.slice(0, 30), RefOrganizationTypeId: ref("orgType.course"), RecordStartDateTime: start, RecordEndDateTime: null });
    push("OrganizationRelationship", { OrganizationRelationshipId: id(`rel:course:${c.id}`), OrganizationId: org, Parent_OrganizationId: schoolOrg, RecordStartDateTime: start, RecordEndDateTime: null });
  }
  for (const s of input.subjects) {
    const org = id(`org:section:${s.id}`);
    push("Organization", { OrganizationId: org, Name: s.name, ShortName: s.name.slice(0, 30), RefOrganizationTypeId: ref("orgType.courseSection"), RecordStartDateTime: start, RecordEndDateTime: null });
    push("OrganizationRelationship", { OrganizationRelationshipId: id(`rel:section:${s.id}`), OrganizationId: org, Parent_OrganizationId: id(`org:course:${s.courseId}`), RecordStartDateTime: start, RecordEndDateTime: null });
  }

  // ── Personas ──
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
    if (st.address) push("PersonAddress", { PersonAddressId: id(`addr:${st.id}`), PersonId: id(pk), StreetNumberAndName: st.address.slice(0, 40), RecordStartDateTime: start, RecordEndDateTime: null });
    push("PersonStatus", { PersonStatusId: id(`pstatus:${st.id}:asignado`), PersonId: id(pk), RefPersonStatusTypeId: ref("personStatus.asignadoCurso"), StatusValue: 1, StatusStartDate: st.enrolledOn ?? null, StatusEndDate: st.withdrawnOn ?? null, RecordStartDateTime: start, RecordEndDateTime: null });
    push("PersonStatus", { PersonStatusId: id(`pstatus:${st.id}:definitiva`), PersonId: id(pk), RefPersonStatusTypeId: ref("personStatus.matriculaDefinitiva"), StatusValue: 1, StatusStartDate: st.enrolledOn ?? null, StatusEndDate: st.withdrawnOn ?? null, RecordStartDateTime: start, RecordEndDateTime: null });
    const courseRole = opr(pk, `org:course:${st.courseId}`, "role.estudiante", st.enrolledOn, st.withdrawnOn);
    push("K12StudentEnrollment", { OrganizationPersonRoleId: courseRole, StudentListNumber: st.listNumber, active: st.withdrawnOn ? 0 : 1, RecordStartDateTime: start, RecordEndDateTime: null });
    for (const sec of sectionsOf.get(st.courseId) ?? []) opr(pk, `org:section:${sec}`, "role.estudiante", st.enrolledOn, st.withdrawnOn);
  }
  if (noBirth || noSex || noAddress) issues.push({ severity: "aviso", message: `Fichas incompletas: ${noBirth} sin fecha de nacimiento, ${noSex} sin sexo, ${noAddress} sin domicilio` });
  if (badRut) issues.push({ severity: "error", message: `${badRut} estudiante(s) con RUN inválido` });

  const staffById = new Map(input.staff.map((p) => [p.id, p]));
  const staffPerson = (staffId: string) => {
    const pk = `person:${staffId}`;
    if (!ids.has(pk)) {
      const p = staffById.get(staffId);
      const [first = "", ...rest] = (p?.name ?? staffId).split(/\s+/);
      push("Person", { PersonId: id(pk), ...splitNames(first, rest.join(" ")), RecordStartDateTime: start, RecordEndDateTime: null });
      if (p?.rut && parseRut(p.rut)) identifier(pk, "idSystem.run", `${parseRut(p.rut)!.body}-${parseRut(p.rut)!.dv}`);
    }
    return pk;
  };
  let staffWithoutRut = 0;
  for (const c of input.courses) if (c.headTeacherId) opr(staffPerson(c.headTeacherId), `org:course:${c.id}`, "role.profesorJefe");
  for (const s of input.subjects) if (s.teacherId) opr(staffPerson(s.teacherId), `org:section:${s.id}`, "role.docente");
  for (const p of input.staff) if (ids.has(`person:${p.id}`) && !(p.rut && parseRut(p.rut))) staffWithoutRut++;
  if (staffWithoutRut) issues.push({ severity: "error", message: `${staffWithoutRut} docente(s) sin RUN registrado: el validador los identifica por RUN` });

  // ── Asistencia ──
  const statusRef: Record<EdeAttendanceStatus, EdeRefKey> = { present: "attStatus.present", late: "attStatus.tardy", absent: "attStatus.unexcusedAbsence", justified: "attStatus.excusedAbsence" };
  const studentCourse = new Map(input.students.map((s) => [s.id, s.courseId]));
  for (const a of input.daily) {
    const courseId = studentCourse.get(a.studentId);
    if (!courseId || !ids.has(`opr:person:${a.studentId}:org:course:${courseId}`)) continue;
    push("RoleAttendanceEvent", {
      RoleAttendanceEventId: id(`att:daily:${a.studentId}:${a.date}`), OrganizationPersonRoleId: id(`opr:person:${a.studentId}:org:course:${courseId}`),
      Date: dayStart(a.date, tz), RefAttendanceEventTypeId: ref("attEvent.daily"), RefAttendanceStatusId: ref(statusRef[a.status]), VirtualIndicator: 0, RecordStartDateTime: start, RecordEndDateTime: null,
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
  }
  if (unsigned) issues.push({ severity: "aviso", message: `${unsigned} clase(s) sin firmar no se exportan` });
  if (noKey) issues.push({ severity: "error", message: `${noKey} clase(s) firmadas sin el código del verificador: el validador exige la firma en cada registro de asistencia` });

  // ── Horario (CourseSectionSchedule) y una sesión de calendario por día de clase firmada ──
  const DAY = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  for (const h of input.schedule) {
    if (!ids.has(`org:section:${h.subjectId}`)) continue;
    push("CourseSectionSchedule", {
      CourseSectionScheduleId: id(`css:${h.subjectId}:${h.weekday}:${h.period}`), OrganizationId: id(`org:section:${h.subjectId}`),
      ClassMeetingDays: DAY[h.weekday]!, ClassBeginningTime: h.start, ClassEndingTime: h.end, ClassPeriod: `Hora ${String(h.period).padStart(2, "0")}`, RecordStartDateTime: start, RecordEndDateTime: null,
    });
  }
  const scheduled = new Set(input.schedule.map((h) => h.subjectId));
  const signed = input.lessons.filter((l) => l.signedAt);
  const withoutSchedule = new Set(signed.filter((l) => !scheduled.has(l.subjectId)).map((l) => l.subjectId));
  if (withoutSchedule.size) issues.push({ severity: "error", message: `${withoutSchedule.size} asignatura(s) con clases firmadas no tienen horario: el validador comprueba que la firma ocurra dentro del bloque` });
  const outside = signed.filter((l) => scheduled.has(l.subjectId) && l.withinSchedule === false).length;
  if (outside) issues.push({ severity: "aviso", message: `${outside} clase(s) se firmaron fuera del horario del bloque: el validador no las aceptará` });
  for (const l of signed) {
    const calKey = `cal:section:${l.subjectId}`;
    if (!ids.has(calKey)) push("OrganizationCalendar", { OrganizationCalendarId: id(calKey), OrganizationId: id(`org:section:${l.subjectId}`), CalendarCode: input.school.year, CalendarYear: input.school.year, CalendarDescription: `Clases ${input.school.year}`.slice(0, 60), RecordStartDateTime: start, RecordEndDateTime: null });
    const sessKey = `sess:${l.subjectId}:${l.date}`;
    if (!ids.has(sessKey)) push("OrganizationCalendarSession", { OrganizationCalendarSessionId: id(sessKey), OrganizationCalendarId: id(calKey), BeginDate: l.date, EndDate: l.date, Description: `Clases del ${l.date}`, AttendanceTermIndicator: 1, RecordStartDateTime: start, RecordEndDateTime: null });
  }

  // ── Calendario: año escolar y suspensiones ──
  const calendar = id("cal:year");
  push("OrganizationCalendar", { OrganizationCalendarId: calendar, OrganizationId: schoolOrg, CalendarCode: input.school.year, CalendarYear: input.school.year, CalendarDescription: `Año escolar ${input.school.year}`, RecordStartDateTime: start, RecordEndDateTime: null });
  for (const s of input.suspensions) {
    push("OrganizationCalendarEvent", { OrganizationCalendarEventId: id(`calev:${s.id}`), OrganizationCalendarId: calendar, Name: s.reason.slice(0, 30), EventDate: s.date, RefCalendarEventType: ref("calendarEvent.suspension"), indicadorSinClases: 1, RecordStartDateTime: start, RecordEndDateTime: null });
  }

  if (missing.size) issues.unshift({ severity: "error", message: `Faltan ${missing.size} código(s) oficiales del EDE: ${[...missing].join(", ")}. Genere el diccionario desde la base del validador` });

  const groups: Record<string, string[]> = {
    _Organizaciones: ["Organization", "OrganizationIdentifier", "OrganizationRelationship"],
    _Personas: ["Person", "PersonIdentifier", "PersonAddress", "PersonStatus"],
    _ComunidadEducativa: ["OrganizationPersonRole", "K12StudentEnrollment", "RoleAttendanceEvent"],
    _Cursos: ["CourseSectionSchedule"],
    _Calendarios: ["OrganizationCalendar", "OrganizationCalendarSession", "OrganizationCalendarEvent"],
  };
  const json: EdeJson = Object.fromEntries(Object.entries(groups).map(([g, ts]) => [g, ts.filter((t) => tables[t]?.length).map((t) => ({ [t]: tables[t]! }))]));
  const counts = Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length]));
  return { json, issues, counts };
}
