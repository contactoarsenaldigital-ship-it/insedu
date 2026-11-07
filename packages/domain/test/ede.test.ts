import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildEdeJson, gradeCodes, splitNames, withOffset, type EdeInput } from "../src/ede/export";
import { EDE_REF_SOURCES, provisionalRefs, type EdeRefKey, type EdeRefs } from "../src/ede/refs";
import { zipFiles } from "../src/ede/zip";
import NDS from "../src/ede/nds-columns.json";

const allRefs = Object.fromEntries((Object.keys(EDE_REF_SOURCES) as EdeRefKey[]).map((k, i) => [k, i + 100])) as EdeRefs;
const input = (extra: Partial<EdeInput> = {}): EdeInput => ({
  school: { rbd: "12345", name: "Colegio Ficticio", year: "2026" },
  courses: [{ id: "c1", name: "5° Básico A", level: "5° Básico", headTeacherId: "t1", capacity: 35 }],
  subjects: [{ id: "s1", courseId: "c1", name: "Matemática", teacherId: "t1" }],
  students: [{ id: "a", rut: "11111111-1", document: "RUN", firstName: "Ana María", lastName: "Pérez Soto", birthDate: "2015-04-02", sex: "F", address: "Calle 1", courseId: "c1", listNumber: 1, enrolledOn: "2026-03-02", guardian: { name: "María José Soto Rivas", rut: "12345678-5" } }, { id: "b", rut: "33333333-3", document: "RUN", firstName: "Tomás", lastName: "Rojas Vera", courseId: "c1", listNumber: 2, enrolledOn: "2026-03-02", withdrawnOn: "2026-09-30" }],
  pickups: [{ studentId: "a", name: "Pedro Soto Rivas", rut: "11222333-9" }],
  exits: [
    { id: "x1", studentId: "a", courseId: "c1", date: "2026-10-05", exitTime: "09:00", subjectId: "s1", reason: "Control médico", pickup: { name: "Pedro Soto Rivas", rut: "11222333-9", authorized: true }, by: "t1", signedAt: "2026-10-05T12:01:00Z", signatureKey: "777888", docIds: ["sig-x1"] },
    { id: "x2", studentId: "a", courseId: "c1", date: "2026-10-06", exitTime: "17:00", reason: "Trámite familiar", pickup: { name: "Rosa Pérez Lagos", authorized: false }, by: "t1", docIds: [] },
  ],
  deliveries: [
    { id: "r1", studentId: "b", courseId: "c1", on: "2026-10-01", time: "10:00", documents: "Certificado de notas", receiver: { name: "Laura Vera Díaz", kind: "apoderado" }, by: "t1", byKind: "administrativo", signedAt: "2026-10-01T13:00:00Z", signatureKey: "999000", docIds: ["sig-r1"] },
  ],
  pie: [{ studentId: "a", since: "2026-03-10" }],
  staff: [{ id: "t1", rut: "22222222-2", name: "Carolina Fuentes", degrees: [{ title: "Profesora de Educación General Básica", institution: "Universidad de Chile", awardDate: "2010-12-20", idoneidad: false }] }],
  institutional: [
    { id: "i1", title: "Reglamento Interno 2026", publishedAt: "2026-03-01T13:00:00Z", by: "t1", docIds: ["ri"], acks: [{ studentId: "a", name: "María José Soto Rivas", at: "2026-03-05T22:00:00Z" }] },
    { id: "i2", title: "PISE 2026", publishedAt: "2026-03-01T13:00:00Z", by: "t1", docIds: [], acks: [] },
  ],
  daily: [{ studentId: "a", date: "2026-10-05", status: "late" }],
  lessons: [{ id: "l1", subjectId: "s1", date: "2026-10-05", attendance: { a: "present" }, signedAt: "2026-10-05T12:00:00Z", signerId: "t1", signatureKey: "123456" }],
  suspensions: [{ id: "x", date: "2026-09-10", reason: "Corte de agua", authorization: "Oficio 45" }],
  schedule: [{ subjectId: "s1", weekday: 1, period: 2, start: "08:45", end: "09:30" }],
  evaluations: [{ id: "e1", subjectId: "s1", title: "Prueba 1", date: "2026-10-06", weight: 1, signedAt: "2026-10-06T12:00:00Z", signerId: "t1", signatureKey: "654321" }, { id: "e2", subjectId: "s1", title: "Prueba 2", date: "2026-10-20", weight: 3 }],
  grades: [{ evaluationId: "e1", studentId: "a", value: 5.46 }, { evaluationId: "e2", studentId: "a", value: 4 }],
  conduct: [{ id: "k1", studentId: "a", date: "2026-10-07", time: "10:15:00", kind: "negative", severity: "grave", description: "Agresión verbal", recordedBy: "t1", signedAt: "2026-10-07T13:15:00Z", signatureKey: "111222", article: "Art. 42", measures: [{ id: "m1", type: "suspension", from: "2026-10-08", to: "2026-10-09" }] }, { id: "k3", studentId: "a", date: "2026-10-09", time: "11:00:00", kind: "negative", severity: "leve", description: "Atraso reiterado", recordedBy: "t1" }, { id: "k2", studentId: "a", date: "2026-10-08", kind: "positive", description: "Ayuda a un compañero", recordedBy: "t1" }],
  meetings: [
    { id: "m1", kind: "entrevista", courseId: "c1", studentId: "a", date: "2026-10-15", time: "16:30", description: "Rendimiento en Matemática. Acuerdos: reforzamiento", by: "t1", byTeacher: true, signedAt: "2026-10-15T20:00:00Z", signatureKey: "333444", attendees: [{ studentId: "a", name: "María José Soto Rivas", rut: "12345678-5" }], actaIds: ["d1"] },
    { id: "m2", kind: "reunion", courseId: "c1", date: "2026-10-20", time: "19:00", description: "Reunión de octubre", by: "t1", byTeacher: true, signedAt: "2026-10-20T23:00:00Z", signatureKey: "555666", attendees: [{ studentId: "a", name: "María José Soto Rivas", rut: "12345678-5" }], actaIds: [] },
  ],
  documents: { ri: "JVBERi0xLjcK", d1: "JVBERi0xLjQK", "sig-x1": "iVBORw0KGgo=", "sig-r1": "iVBORw0KGgoB" },
  exportedAt: "2026-11-07T15:00:00Z",
  timeZone: "America/Santiago",
  ...extra,
});

const table = (json: ReturnType<typeof buildEdeJson>["json"], group: string, name: string) => json[group]!.find((t) => t[name])?.[name] ?? [];

describe("EDE", () => {
  it("escribe fechas con el desfase de Chile", () => {
    expect(withOffset("2026-10-05T12:00:00Z", "America/Santiago")).toBe("2026-10-05T09:00:00-03:00");
    expect(withOffset("2026-07-01T12:00:00Z", "America/Santiago")).toBe("2026-07-01T08:00:00-04:00");
  });

  it("separa nombres y apellidos", () => {
    expect(splitNames("Ana María", "Pérez Soto")).toEqual({ FirstName: "Ana", MiddleName: "María", LastName: "Pérez", SecondLastName: "Soto" });
  });

  it("agrupa las tablas como espera el contenedor oficial", () => {
    const { json, counts } = buildEdeJson(input(), allRefs);
    expect(Object.keys(json)).toEqual(["_Organizaciones", "_Comunes", "_Evaluaciones", "_Incidentes", "_Personas", "_Intervenciones", "_ComunidadEducativa", "_Cursos", "_Calendarios"]);
    expect(table(json, "_Cursos", "CourseSectionSchedule")[0]).toMatchObject({ ClassMeetingDays: "Lunes", ClassBeginningTime: "08:45", ClassEndingTime: "09:30", ClassPeriod: "Hora 02" });
    expect(table(json, "_Calendarios", "OrganizationCalendarSession").find((r) => r.BeginDate === "2026-10-05")).toMatchObject({ EndDate: "2026-10-05", AttendanceTermIndicator: 1, Description: "Clases del 2026-10-05" });
    expect(counts.Organization).toBe(5);
    const orgs = table(json, "_Organizaciones", "Organization").map((r) => r.Name);
    expect(orgs).toEqual(expect.arrayContaining(["110:Enseñanza Básica", "110.05:5º Básico", "A", "Matemática"]));
    const persons = table(json, "_Personas", "Person");
    expect(persons[0]).toMatchObject({ FirstName: "Ana", SecondLastName: "Soto", RefSexId: allRefs["sex.female"] });
    expect(table(json, "_Personas", "PersonIdentifier").map((r) => r.Identifier)).toContain("11111111-1");
    expect(table(json, "_ComunidadEducativa", "K12StudentEnrollment")[0]).toMatchObject({ StudentListNumber: 1, active: 1 });
  });

  it("enlaza claves entre tablas", () => {
    const { json } = buildEdeJson(input(), allRefs);
    const oprs = table(json, "_ComunidadEducativa", "OrganizationPersonRole");
    const oprIds = new Set(oprs.map((r) => r.OrganizationPersonRoleId));
    const orgIds = new Set(table(json, "_Organizaciones", "Organization").map((r) => r.OrganizationId));
    const personIds = new Set(table(json, "_Personas", "Person").map((r) => r.PersonId));
    expect(oprs.every((r) => orgIds.has(r.OrganizationId!) && personIds.has(r.PersonId!))).toBe(true);
    expect(table(json, "_ComunidadEducativa", "RoleAttendanceEvent").every((r) => oprIds.has(r.OrganizationPersonRoleId!))).toBe(true);
  });

  it("exporta la asistencia por clase con la firma del verificador", () => {
    const { json } = buildEdeJson(input(), allRefs);
    const events = table(json, "_ComunidadEducativa", "RoleAttendanceEvent");
    expect(events.find((e) => e.RefAttendanceEventTypeId === allRefs["attEvent.classSection"])).toMatchObject({ digitalRandomKey: "123456", Date: "2026-10-05T09:00:00-03:00", RefAttendanceStatusId: allRefs["attStatus.present"] });
    expect(events.find((e) => e.RefAttendanceEventTypeId === allRefs["attEvent.daily"])).toMatchObject({ RefAttendanceStatusId: allRefs["attStatus.tardy"], Date: "2026-10-05T00:00:00-03:00" });
  });

  it("informa lo que falta en vez de inventarlo", () => {
    const { issues, json } = buildEdeJson(input({ schedule: [], lessons: [{ id: "l1", subjectId: "s1", date: "2026-10-05", attendance: { a: "present" }, signedAt: "2026-10-05T12:00:00Z" }], staff: [{ id: "t1", name: "Carolina Fuentes" }] }), provisionalRefs());
    const text = issues.map((i) => i.message).join(" | ");
    expect(text).toContain("código(s) oficiales");
    expect(text).toContain("sin el código del verificador");
    expect(text).toContain("sin RUN");
    expect(text).toContain("no tienen horario");
    expect(table(json, "_Organizaciones", "Organization")[0]!.RefOrganizationTypeId).toBeNull();
  });

  it("usa solo grupos, tablas y columnas de la planilla oficial NDS-Reference-v7_1", () => {
    const { json } = buildEdeJson(input(), allRefs);
    const unknown: string[] = [];
    for (const [group, list] of Object.entries(json)) {
      for (const entry of list) {
        for (const [name, rows] of Object.entries(entry)) {
          const cols = (NDS as Record<string, Record<string, string[]>>)[group]?.[name];
          if (!cols) unknown.push(`${group}.${name}`);
          else for (const r of rows) for (const c of Object.keys(r)) if (!cols.includes(c)) unknown.push(`${name}.${c}`);
        }
      }
    }
    expect([...new Set(unknown)]).toEqual([]);
  });

  it("exporta notas con punto decimal, ponderación en porcentaje y firma", () => {
    const { json, issues } = buildEdeJson(input(), allRefs);
    expect(table(json, "_Evaluaciones", "AssessmentResult").map((r) => r.ScoreValue)).toEqual(["5.5", "4.0"]);
    const la = table(json, "_Evaluaciones", "LearnerActivity");
    expect(la.map((r) => r.Weight)).toEqual([25, 75]);
    expect(la[0]).toMatchObject({ digitalRandomKey: "654321", DateDigitalRandomKey: "2026-10-06T09:00:00-03:00" });
    const sessions = new Set(table(json, "_Calendarios", "OrganizationCalendarSession").map((r) => r.OrganizationCalendarSessionId));
    expect(la.every((r) => sessions.has(r.OrganizationCalendarSessionId!))).toBe(true);
    expect(table(json, "_Evaluaciones", "Assessment")[0]).toMatchObject({ RefAssessmentTypeId: allRefs["assessmentType.sumativa"] });
    expect(issues.map((i) => i.message).join(" ")).toContain("1 evaluación(es) sin firma");
  });

  it("exporta anotaciones como incidentes e informa lo que falta", () => {
    const { json, issues } = buildEdeJson(input(), allRefs);
    const inc = table(json, "_Incidentes", "Incident");
    expect(inc.filter((r) => r.RefIncidentBehaviorId === allRefs["incidentBehavior.negativa"] || r.RefIncidentBehaviorId === allRefs["incidentBehavior.positiva"])).toHaveLength(3);
    expect(inc[0]).toMatchObject({ IncidentTime: "10:15:00", RefIncidentBehaviorId: allRefs["incidentBehavior.negativa"] });
    expect(JSON.parse(String(inc[0]!.RegulationViolatedDescription))).toMatchObject({ ArtículoProtocolo: "Art. 42", Severidad: "grave", Procedimiento: "suspension" });
    expect(inc[2]!.RegulationViolatedDescription).toBeNull();
    expect(table(json, "_Incidentes", "K12StudentDiscipline")).toEqual([expect.objectContaining({ RefDisciplinaryActionTakenId: allRefs["disciplinaryAction.suspension"], DisciplinaryActionStartDate: "2026-10-08", DisciplinaryActionEndDate: "2026-10-09", DurationOfDisciplinaryAction: 2 })]);
    expect(issues.map((i) => i.message).join(" | ")).toContain("1 anotación(es) negativa(s) sin el artículo");
    const text = issues.map((i) => i.message).join(" | ");
    expect(text).toContain("1 anotación(es) sin hora");
    expect(text).toContain("sin medida disciplinaria");
    expect(text).toContain("2 anotación(es) sin firma");
    const reporter = table(json, "_Incidentes", "IncidentPerson").find((p) => p.Identifier === "k1:registra");
    expect(reporter).toMatchObject({ digitalRandomKey: "111222", RefIncidentPersonTypeId: allRefs["incidentPersonType.docente"], Date: "2026-10-07T10:15:00-03:00" });
  });

  it("exporta entrevistas y reuniones con el apoderado, su relación y el acta", () => {
    const { json, issues } = buildEdeJson(input(), allRefs);
    const inc = table(json, "_Incidentes", "Incident").filter((r) => r.RefIncidentBehaviorId === allRefs["incidentBehavior.entrevista"] || r.RefIncidentBehaviorId === allRefs["incidentBehavior.reunion"]);
    expect(inc).toHaveLength(2);
    expect(inc[0]).toMatchObject({ IncidentTime: "16:30:00", IncidentReporterId: null, RegulationViolatedDescription: null });
    const people = table(json, "_Incidentes", "IncidentPerson").filter((p) => p.IncidentId === inc[0]!.IncidentId);
    const guardian = people.find((p) => p.RefIncidentPersonTypeId === allRefs["incidentPersonType.apoderado"])!;
    expect(guardian).toMatchObject({ RefIncidentPersonRoleTypeId: allRefs["incidentPersonRole.entrevistado"], Date: "2026-10-15T16:30:00-03:00" });
    const doc = table(json, "_Comunes", "Document");
    expect(doc.find((d) => d.documentId === guardian.fileScanBase64)).toEqual({ documentId: guardian.fileScanBase64, fileScanBase64: "JVBERi0xLjQK" });
    expect(people.find((p) => p.RefIncidentPersonRoleTypeId === allRefs["incidentPersonRole.entrevistador"])).toMatchObject({ digitalRandomKey: "333444" });
    // Una sola persona para el apoderado aunque asista a la entrevista y a la reunión.
    const persons = table(json, "_Personas", "Person").filter((p) => p.PersonId === guardian.PersonId);
    expect(persons).toEqual([expect.objectContaining({ FirstName: "María", MiddleName: "José", LastName: "Soto", SecondLastName: "Rivas" })]);
    // El apoderado de la matrícula y el de la entrevista son la misma persona (mismo RUN).
    expect(table(json, "_Personas", "PersonRelationship").filter((r) => r.PersonId === guardian.PersonId)).toEqual([expect.objectContaining({ RefPersonRelationshipId: allRefs["relationship.apoderado"], RetirarEstudianteIndicador: 1 })]);
    expect(table(json, "_ComunidadEducativa", "OrganizationPersonRole").filter((r) => r.PersonId === guardian.PersonId)).toEqual([expect.objectContaining({ RoleId: allRefs["role.apoderado"] })]);
    expect(issues.map((i) => i.message).join(" | ")).toContain("1 entrevista(s) o reunión(es) sin el acta firmada");
  });

  it("exporta los retiros con los tres eventos que exige el validador", () => {
    const { json, issues } = buildEdeJson(input(), allRefs);
    const events = table(json, "_ComunidadEducativa", "RoleAttendanceEvent").filter((e) => e.RefAttendanceStatusId === allRefs["attStatus.earlyDeparture"]);
    const first = events.filter((e) => e.Date === "2026-10-05T09:00:00-03:00");
    expect(first.map((e) => e.RefAttendanceEventTypeId)).toEqual([allRefs["attEvent.classSection"], allRefs["attEvent.establecimiento"], allRefs["attEvent.establecimiento"]]);
    expect(first[0]).toMatchObject({ digitalRandomKey: "777888", observaciones: "Control médico" });
    const pickup = first[2]!;
    expect(pickup).toMatchObject({ firmaRatificador: "777888", fechaRatificador: "2026-10-05T09:01:00-03:00" });
    expect(pickup.oprIdRatificador).not.toBeNull();
    expect(table(json, "_Comunes", "Document").find((d) => d.documentId === pickup.fileScanBase64)).toMatchObject({ fileScanBase64: "iVBORw0KGgo=" });
    const oprs = table(json, "_ComunidadEducativa", "OrganizationPersonRole");
    expect(oprs.find((o) => o.OrganizationPersonRoleId === pickup.OrganizationPersonRoleId)).toMatchObject({ RoleId: allRefs["role.retira"] });
    // Todos los estudiantes tienen a alguien autorizado a retirarlos, y el estudiante está en el establecimiento.
    const rel = table(json, "_Personas", "PersonRelationship");
    expect(rel.filter((r) => r.RetirarEstudianteIndicador === 1 && r.RecordEndDateTime === null)).toHaveLength(2);
    expect(rel.find((r) => r.RecordEndDateTime === "2026-10-06T23:59:59-03:00")).toBeTruthy();
    expect(table(json, "_ComunidadEducativa", "RoleStatus")[0]).toMatchObject({ RefRoleStatusId: allRefs["roleStatus.enrolled"], StatusStartDate: "2026-03-02" });
    const text = issues.map((i) => i.message).join(" | ");
    expect(text).toContain("1 retiro(s) sin firma con verificador");
    expect(text).toContain("1 retiro(s) fuera del horario");
    expect(text).toContain("1 retiro(s) sin la firma en pantalla");
    expect(text).toContain("1 retiro(s) por personas fuera del registro");
    expect(text).toContain("1 estudiante(s) sin apoderado");
  });

  it("exporta la entrega de documentos al estudiante retirado y la nómina PIE", () => {
    const { json, issues } = buildEdeJson(input(), allRefs);
    const inc = table(json, "_Incidentes", "Incident").find((r) => r.IncidentIdentifier === "r1")!;
    expect(inc).toMatchObject({ RefIncidentBehaviorId: allRefs["incidentBehavior.entregaRetiro"], IncidentTime: "10:00:00", RegulationViolatedDescription: null });
    const people = table(json, "_Incidentes", "IncidentPerson").filter((p) => p.IncidentId === inc.IncidentId);
    expect(people.find((p) => p.Identifier === "r1:entrega")).toMatchObject({ digitalRandomKey: "999000", RefIncidentPersonTypeId: allRefs["incidentPersonType.administrativo"] });
    const receiver = people.find((p) => p.Identifier === "r1:recibe")!;
    expect(receiver).toMatchObject({ RefIncidentPersonTypeId: allRefs["incidentPersonType.apoderado"] });
    expect(table(json, "_Comunes", "Document").find((d) => d.documentId === receiver.fileScanBase64)).toMatchObject({ fileScanBase64: "iVBORw0KGgoB" });
    expect(table(json, "_Personas", "PersonStatus").find((s) => s.RefPersonStatusTypeId === allRefs["personStatus.retirado"])).toMatchObject({ StatusStartDate: "2026-09-30" });
    expect(table(json, "_Intervenciones", "PersonProgramParticipation")).toEqual([expect.objectContaining({ ParticipationStatus: "Activo", RefParticipationTypeId: allRefs["participation.pie"] })]);
    const text = issues.map((i) => i.message).join(" | ");
    expect(text).not.toContain("retirado(s) sin entrega");
    expect(text).toContain("no revisa el PIE");
  });

  it("exporta asignaturas con capacidad e idioma, títulos de docentes e instrumentos recibidos", () => {
    const { json, issues } = buildEdeJson(input(), allRefs);
    expect(table(json, "_Cursos", "CourseSection")[0]).toMatchObject({ MaximumCapacity: 35, VirtualIndicator: 0, RefInstructionLanguageId: allRefs["language.spanish"] });
    const course = table(json, "_Organizaciones", "Organization").find((o) => o.ShortName === "5° Básico A")!;
    expect(table(json, "_Cursos", "CourseSection")[0]!.CourseId).toBe(course.OrganizationId);
    expect(table(json, "_Personas", "PersonDegreeOrCertificate")).toEqual([expect.objectContaining({ DegreeOrCertificateTitleOrSubject: "Profesora de Educación General Básica", idoneidadDocente: 0, AwardDate: "2010-12-20" })]);
    const inc = table(json, "_Incidentes", "Incident").find((r) => r.RefIncidentBehaviorId === allRefs["incidentBehavior.interesGeneral"])!;
    expect(inc).toMatchObject({ IncidentDate: "2026-03-01", IncidentTime: "10:00:00", IncidentDescription: "Reglamento Interno 2026" });
    const person = table(json, "_Incidentes", "IncidentPerson").find((p) => p.IncidentId === inc.IncidentId)!;
    expect(table(json, "_Comunes", "Document").find((d) => d.documentId === person.fileScanBase64)).toMatchObject({ fileScanBase64: "JVBERi0xLjcK" });
    // El apoderado que confirma es el mismo de la matrícula.
    expect(table(json, "_Personas", "Person").filter((p) => p.PersonId === person.PersonId)).toHaveLength(1);
    const text = issues.map((i) => i.message).join(" | ");
    expect(text).not.toContain("sin título");
    expect(text).not.toContain("sin capacidad");
    expect(text).toContain("1 instrumento(s) de interés general que ningún apoderado");
    const missing = buildEdeJson(input({ courses: [{ id: "c1", name: "5° Básico A", level: "5° Básico", headTeacherId: "t1" }], staff: [{ id: "t1", rut: "22222222-2", name: "Carolina Fuentes" }] }), allRefs).issues.map((i) => i.message).join(" | ");
    expect(missing).toContain("1 curso(s) sin capacidad autorizada");
    expect(missing).toContain("1 docente(s) sin título registrado");
  });

  it("traduce el nivel al código de enseñanza y grado oficiales", () => {
    expect(gradeCodes("5° Básico")).toEqual({ ensenanza: "110:Enseñanza Básica", grado: "110.05:5º Básico" });
    expect(gradeCodes("1° Medio")).toEqual({ ensenanza: "310:Enseñanza Media H-C niños y jóvenes", grado: "310.01:1º medio" });
    expect(gradeCodes("Kínder")).toBeNull();
  });

  it("empaqueta un zip legible", () => {
    const content = Buffer.from(JSON.stringify({ hola: "ñandú" }));
    const zip = zipFiles([{ name: "ede.json", content }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const nameLen = zip.readUInt16LE(26);
    const size = zip.readUInt32LE(18);
    const data = zip.subarray(30 + nameLen, 30 + nameLen + size);
    expect(inflateRawSync(data).toString()).toBe(content.toString());
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  });
});
