/**
 * Pruebas de aislamiento y permisos sobre las migraciones reales, ejecutadas en PGlite
 * (PostgreSQL embebido). Simulan el rol "authenticated" de Supabase y el contexto
 * app.tenant_id / app.user_id que fija el backend.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const MAIN = readFileSync(resolve(root, "supabase/main/migrations/20261015000100_core.sql"), "utf8");
const VAULT = readFileSync(resolve(root, "supabase/vault/migrations/20261015000100_vault.sql"), "utf8");

const T1 = "11111111-1111-7111-8111-111111111111";
const T2 = "22222222-2222-7222-8222-222222222222";
const ids = {
  // auth users
  uTeacher: "a0000000-0000-7000-8000-000000000001",
  uOtherTeacher: "a0000000-0000-7000-8000-000000000002",
  uGuardian: "a0000000-0000-7000-8000-000000000003",
  uGate: "a0000000-0000-7000-8000-000000000004",
  uT2Director: "a0000000-0000-7000-8000-000000000005",
  // people
  pTeacher: "b0000000-0000-7000-8000-000000000001",
  pOtherTeacher: "b0000000-0000-7000-8000-000000000002",
  pGuardian: "b0000000-0000-7000-8000-000000000003",
  pGate: "b0000000-0000-7000-8000-000000000004",
  pT2Director: "b0000000-0000-7000-8000-000000000005",
  pStudentA: "c0000000-0000-7000-8000-000000000001",
  pStudentB: "c0000000-0000-7000-8000-000000000002",
  cA: "d0000000-0000-7000-8000-000000000001",
  cB: "d0000000-0000-7000-8000-000000000002",
};

let db: PGlite;

async function as<T = Record<string, unknown>>(tenant: string, user: string, sql: string, params: unknown[] = []) {
  await db.exec("reset role");
  await db.query(`select set_config('app.tenant_id', $1, false), set_config('app.user_id', $2, false)`, [tenant, user]);
  await db.exec("set role authenticated");
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin;`);
  await db.exec(MAIN);
  await db.exec(`
    insert into app.tenants(id, name, rbd) values ('${T1}', 'Colegio Uno', '00001'), ('${T2}', 'Colegio Dos', '00002');
    insert into app.people(id, tenant_id, auth_user_id, rut, first_name, last_name) values
      ('${ids.pTeacher}', '${T1}', '${ids.uTeacher}', '111111111', 'Ana', 'Docente'),
      ('${ids.pOtherTeacher}', '${T1}', '${ids.uOtherTeacher}', '123456785', 'Luis', 'Docente'),
      ('${ids.pGuardian}', '${T1}', '${ids.uGuardian}', '100000137', 'Rosa', 'Apoderada'),
      ('${ids.pGate}', '${T1}', '${ids.uGate}', '220000006', 'Pedro', 'Portero'),
      ('${ids.pT2Director}', '${T2}', '${ids.uT2Director}', '230000002', 'Eva', 'Directora'),
      ('${ids.pStudentA}', '${T1}', null, '700000001', 'Sofía', 'Estudiante'),
      ('${ids.pStudentB}', '${T1}', null, '700000002', 'Tomás', 'Estudiante');
    insert into app.memberships values
      ('${T1}', '${ids.pTeacher}', 'head_teacher', true), ('${T1}', '${ids.pTeacher}', 'teacher', true),
      ('${T1}', '${ids.pOtherTeacher}', 'teacher', true), ('${T1}', '${ids.pOtherTeacher}', 'head_teacher', true),
      ('${T1}', '${ids.pGuardian}', 'guardian_academic', true),
      ('${T1}', '${ids.pGate}', 'gatekeeper', true),
      ('${T2}', '${ids.pT2Director}', 'director', true),
      ('${T1}', '${ids.pStudentA}', 'student', true), ('${T1}', '${ids.pStudentB}', 'student', true);
    insert into app.courses(id, tenant_id, year, name, level, head_teacher_id) values
      ('${ids.cA}', '${T1}', 2026, '7° Básico A', '7° Básico', '${ids.pTeacher}'),
      ('${ids.cB}', '${T1}', 2026, '7° Básico B', '7° Básico', '${ids.pOtherTeacher}');
    insert into app.enrollments values ('${T1}', '${ids.pStudentA}', '${ids.cA}', true), ('${T1}', '${ids.pStudentB}', '${ids.cB}', true);
    insert into app.guardianships values ('${T1}', '${ids.pGuardian}', '${ids.pStudentA}', 'academic');
    insert into app.attendance_daily(tenant_id, student_id, date, status, source, recorded_by) values
      ('${T1}', '${ids.pStudentA}', '2026-10-15', 'present', 'credential_scan', '${ids.pGate}'),
      ('${T1}', '${ids.pStudentB}', '2026-10-15', 'late', 'credential_scan', '${ids.pGate}');
    insert into app.alerts(tenant_id, student_id, dimension, code, severity, reason) values
      ('${T1}', '${ids.pStudentA}', 'asistencia', 'LOW_ATTENDANCE', 'media', 'Asistencia 80 %');
  `);
});

afterAll(async () => {
  await db?.close();
});

describe("aislamiento multi-tenant", () => {
  it("la directora del colegio 2 no ve asistencia del colegio 1", async () => {
    const rows = await as(T2, ids.uT2Director, "select * from app.attendance_daily");
    expect(rows).toHaveLength(0);
  });

  it("aunque falsee el tenant en la consulta, RLS filtra por contexto", async () => {
    const rows = await as(T2, ids.uT2Director, `select * from app.people where tenant_id = '${T1}'`);
    expect(rows).toHaveLength(0);
  });
});

describe("vínculo funcional", () => {
  it("el profesor jefe ve solo a los estudiantes de su curso", async () => {
    const rows = await as<{ student_id: string }>(T1, ids.uTeacher, "select student_id from app.attendance_daily");
    expect(rows.map((r) => r.student_id)).toEqual([ids.pStudentA]);
  });

  it("el apoderado ve solo a su pupilo y no ve alertas", async () => {
    const att = await as<{ student_id: string }>(T1, ids.uGuardian, "select student_id from app.attendance_daily");
    expect(att.map((r) => r.student_id)).toEqual([ids.pStudentA]);
    expect(await as(T1, ids.uGuardian, "select * from app.alerts")).toHaveLength(0);
  });

  it("el profesor jefe ve las alertas de su curso", async () => {
    expect(await as(T1, ids.uTeacher, "select * from app.alerts")).toHaveLength(1);
    expect(await as(T1, ids.uOtherTeacher, "select * from app.alerts")).toHaveLength(0);
  });
});

describe("registro oficial", () => {
  it("portería puede registrar escaneos a su nombre, un apoderado no", async () => {
    await as(T1, ids.uGate,
      `insert into app.attendance_scans(client_id, tenant_id, raw_code, student_id, scanned_at, scanned_by, device_id, access_point, outcome)
       values (gen_random_uuid(), $1, '700000001', $2, now(), $3, 'tel-1', 'Acceso principal', 'recorded')`,
      [T1, ids.pStudentA, ids.pGate]);
    await expect(
      as(T1, ids.uGuardian,
        `insert into app.attendance_scans(client_id, tenant_id, raw_code, scanned_at, scanned_by, device_id, access_point, outcome)
         values (gen_random_uuid(), $1, 'x', now(), $2, 'tel-2', 'Acceso', 'invalid_code')`,
        [T1, ids.pGuardian]),
    ).rejects.toThrow();
  });

  it("una corrección sin motivo es rechazada y con motivo queda trazada", async () => {
    await db.exec("reset role");
    await expect(
      db.exec(`update app.attendance_daily set status = 'absent' where student_id = '${ids.pStudentA}'`),
    ).rejects.toThrow(/motivo/);
    await db.exec(`
      begin;
      select set_config('app.correction_reason', 'Error de digitación en portería', true);
      update app.attendance_daily set status = 'late' where student_id = '${ids.pStudentA}';
      commit;`);
    const rows = await db.query<{ reason: string }>("select reason from app.corrections");
    expect(rows.rows[0]!.reason).toBe("Error de digitación en portería");
  });

  it("el log de auditoría es inmutable", async () => {
    await db.exec(`insert into app.audit_log(tenant_id, action) values ('${T1}', 'test')`);
    await expect(db.exec("delete from app.audit_log")).rejects.toThrow(/inmutable/);
  });

  it("las notas fuera de escala son rechazadas por la base", async () => {
    await db.exec(`
      insert into app.subjects(id, tenant_id, course_id, name, teacher_id) values ('e0000000-0000-7000-8000-000000000001', '${T1}', '${ids.cA}', 'Matemática', '${ids.pTeacher}');
      insert into app.evaluations(id, tenant_id, subject_id, title, date) values ('f0000000-0000-7000-8000-000000000001', '${T1}', 'e0000000-0000-7000-8000-000000000001', 'Prueba 1', '2026-10-15');`);
    await expect(
      db.exec(`insert into app.grades(tenant_id, evaluation_id, student_id, value, recorded_by) values ('${T1}', 'f0000000-0000-7000-8000-000000000001', '${ids.pStudentA}', 7.5, '${ids.pTeacher}')`),
    ).rejects.toThrow();
  });
});

describe("bóveda de Salvaguarda (proyecto separado)", () => {
  let vault: PGlite;
  beforeAll(async () => {
    vault = new PGlite();
    await vault.exec(`create role anon nologin; create role authenticated nologin;`);
    await vault.exec(VAULT);
    await vault.exec(`insert into vault.cases(tenant_id, student_id, sealed) values ('${T1}', '${ids.pStudentA}', '{"v":1}'::jsonb)`);
  });
  afterAll(async () => vault?.close());

  it("ningún cliente autenticado puede leer casos", async () => {
    await vault.exec("set role authenticated");
    await expect(vault.query("select * from vault.cases")).rejects.toThrow();
    await vault.exec("reset role");
  });

  it("el break-glass no puede durar más de 4 horas", async () => {
    await expect(
      vault.exec(`insert into vault.break_glass_grants(tenant_id, granted_to, student_id, reason, justification, approved_by, expires_at)
        values ('${T1}', gen_random_uuid(), gen_random_uuid(), 'riesgo_inminente', 'Justificación suficientemente extensa', array[gen_random_uuid()], now() + interval '1 day')`),
    ).rejects.toThrow();
  });

  it("el log de accesos es inmutable", async () => {
    await vault.exec(`insert into vault.access_log(tenant_id, actor_id, action) values ('${T1}', gen_random_uuid(), 'open')`);
    await expect(vault.exec("update vault.access_log set action = 'export'")).rejects.toThrow(/inmutable/);
  });
});
