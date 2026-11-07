import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildEdeJson, gradeCodes, splitNames, withOffset, type EdeInput } from "../src/ede/export";
import { EDE_REF_SOURCES, provisionalRefs, type EdeRefKey, type EdeRefs } from "../src/ede/refs";
import { zipFiles } from "../src/ede/zip";
import NDS from "../src/ede/nds-columns.json";

const allRefs = Object.fromEntries((Object.keys(EDE_REF_SOURCES) as EdeRefKey[]).map((k, i) => [k, i + 100])) as EdeRefs;
const input = (extra: Partial<EdeInput> = {}): EdeInput => ({
  school: { rbd: "12345", name: "Colegio Ficticio", year: "2026" },
  courses: [{ id: "c1", name: "5° Básico A", level: "5° Básico", headTeacherId: "t1" }],
  subjects: [{ id: "s1", courseId: "c1", name: "Matemática", teacherId: "t1" }],
  students: [{ id: "a", rut: "11111111-1", document: "RUN", firstName: "Ana María", lastName: "Pérez Soto", birthDate: "2015-04-02", sex: "F", address: "Calle 1", courseId: "c1", listNumber: 1, enrolledOn: "2026-03-02" }],
  staff: [{ id: "t1", rut: "22222222-2", name: "Carolina Fuentes" }],
  daily: [{ studentId: "a", date: "2026-10-05", status: "late" }],
  lessons: [{ id: "l1", subjectId: "s1", date: "2026-10-05", attendance: { a: "present" }, signedAt: "2026-10-05T12:00:00Z", signerId: "t1", signatureKey: "123456" }],
  suspensions: [{ id: "x", date: "2026-09-10", reason: "Corte de agua", authorization: "Oficio 45" }],
  schedule: [{ subjectId: "s1", weekday: 1, period: 2, start: "08:45", end: "09:30" }],
  evaluations: [{ id: "e1", subjectId: "s1", title: "Prueba 1", date: "2026-10-06", weight: 1, signedAt: "2026-10-06T12:00:00Z", signerId: "t1", signatureKey: "654321" }, { id: "e2", subjectId: "s1", title: "Prueba 2", date: "2026-10-20", weight: 3 }],
  grades: [{ evaluationId: "e1", studentId: "a", value: 5.46 }, { evaluationId: "e2", studentId: "a", value: 4 }],
  conduct: [{ id: "k1", studentId: "a", date: "2026-10-07", time: "10:15:00", kind: "negative", severity: "grave", description: "Agresión verbal", recordedBy: "t1", article: "Art. 42", measures: [{ id: "m1", type: "suspension", from: "2026-10-08", to: "2026-10-09" }] }, { id: "k3", studentId: "a", date: "2026-10-09", time: "11:00:00", kind: "negative", severity: "leve", description: "Atraso reiterado", recordedBy: "t1" }, { id: "k2", studentId: "a", date: "2026-10-08", kind: "positive", description: "Ayuda a un compañero", recordedBy: "t1" }],
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
    expect(Object.keys(json)).toEqual(["_Organizaciones", "_Evaluaciones", "_Incidentes", "_Personas", "_ComunidadEducativa", "_Cursos", "_Calendarios"]);
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
    expect(inc).toHaveLength(3);
    expect(inc[0]).toMatchObject({ IncidentTime: "10:15:00", RefIncidentBehaviorId: allRefs["incidentBehavior.negativa"] });
    expect(JSON.parse(String(inc[0]!.RegulationViolatedDescription))).toMatchObject({ ArtículoProtocolo: "Art. 42", Severidad: "grave", Procedimiento: "suspension" });
    expect(inc[2]!.RegulationViolatedDescription).toBeNull();
    expect(table(json, "_Incidentes", "K12StudentDiscipline")).toEqual([expect.objectContaining({ RefDisciplinaryActionTakenId: allRefs["disciplinaryAction.suspension"], DisciplinaryActionStartDate: "2026-10-08", DisciplinaryActionEndDate: "2026-10-09", DurationOfDisciplinaryAction: 2 })]);
    expect(issues.map((i) => i.message).join(" | ")).toContain("1 anotación(es) negativa(s) sin el artículo");
    const text = issues.map((i) => i.message).join(" | ");
    expect(text).toContain("1 anotación(es) sin hora");
    expect(text).toContain("sin medida disciplinaria");
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
