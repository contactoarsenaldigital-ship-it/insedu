import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildEdeJson, splitNames, withOffset, type EdeInput } from "../src/ede/export";
import { EDE_REF_SOURCES, provisionalRefs, type EdeRefKey, type EdeRefs } from "../src/ede/refs";
import { zipFiles } from "../src/ede/zip";
import NDS from "../src/ede/nds-columns.json";

const allRefs = Object.fromEntries((Object.keys(EDE_REF_SOURCES) as EdeRefKey[]).map((k, i) => [k, i + 100])) as EdeRefs;
const input = (extra: Partial<EdeInput> = {}): EdeInput => ({
  school: { rbd: "12345", name: "Colegio Ficticio", year: "2026" },
  courses: [{ id: "c1", name: "5° Básico A", headTeacherId: "t1" }],
  subjects: [{ id: "s1", courseId: "c1", name: "Matemática", teacherId: "t1" }],
  students: [{ id: "a", rut: "11111111-1", document: "RUN", firstName: "Ana María", lastName: "Pérez Soto", birthDate: "2015-04-02", sex: "F", address: "Calle 1", courseId: "c1", listNumber: 1, enrolledOn: "2026-03-02" }],
  staff: [{ id: "t1", rut: "22222222-2", name: "Carolina Fuentes" }],
  daily: [{ studentId: "a", date: "2026-10-05", status: "late" }],
  lessons: [{ id: "l1", subjectId: "s1", date: "2026-10-05", attendance: { a: "present" }, signedAt: "2026-10-05T12:00:00Z", signerId: "t1", signatureKey: "123456" }],
  suspensions: [{ id: "x", date: "2026-09-10", reason: "Corte de agua", authorization: "Oficio 45" }],
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
    expect(Object.keys(json)).toEqual(["_Organizaciones", "_Personas", "_ComunidadEducativa", "_Calendarios"]);
    expect(counts.Organization).toBe(3);
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
    const { issues, json } = buildEdeJson(input({ lessons: [{ id: "l1", subjectId: "s1", date: "2026-10-05", attendance: { a: "present" }, signedAt: "2026-10-05T12:00:00Z" }], staff: [{ id: "t1", name: "Carolina Fuentes" }] }), provisionalRefs());
    const text = issues.map((i) => i.message).join(" | ");
    expect(text).toContain("código(s) oficiales");
    expect(text).toContain("sin el código del verificador");
    expect(text).toContain("sin RUN");
    expect(text).toContain("CourseSectionSchedule");
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
