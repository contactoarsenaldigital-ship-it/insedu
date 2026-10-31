import "server-only";
import ExcelJS from "exceljs";
import {
  fold, IMPORT_COLUMNS, isSensitive, KIND_LABEL, normalizeRut, parseCourseName, parseDate, parseDelimited, parseSubjects,
  readTable, rolesFromProfile, ROLE_LABEL, sexFrom, uuidv7, type ImportKind, type Role,
} from "@insedu/domain";
import { accountByEmail, accountsState, audit, type Account, type ImportPlanRow, type PendingImport } from "./accounts";
import { createAccount, type Proposal } from "./admin";
import { school } from "./demo";
import { profile } from "./health";
import { addCourseSubjects, repo } from "./store";

/**
 * Carga masiva inicial: archivo → tabla → plan por fila (crear, actualizar, omitir, error) →
 * confirmación. Al confirmar se vuelve a planificar con los datos del momento.
 */

// Vercel acepta hasta 4,5 MB por solicitud; 1.000 estudiantes en CSV pesan ≈ 60 KB.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

// ───────────────────────── Lectura ─────────────────────────

/** CSV o TXT (UTF-8 o Windows-1252, como guarda Excel en español) o Excel (.xlsx). */
export async function tableFromFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".xls")) throw new Error("El formato .xls antiguo no se puede leer. En Excel use «Guardar como» → Libro de Excel (.xlsx) o CSV.");
  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
    if (!ws) return [];
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= Math.max(ws.actualColumnCount, row.cellCount); c++) cells.push(cellText(row.getCell(c).value));
      rows.push(cells);
    });
    return rows.filter((r) => r.some((c) => c.trim()));
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return parseDelimited(text);
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    return "";
  }
  return String(v).trim();
}

// ───────────────────────── Búsquedas ─────────────────────────

const courseByName = (raw: string) => {
  const parsed = parseCourseName(raw);
  return parsed ? school().courses.find((c) => fold(c.name) === fold(parsed.name)) : undefined;
};
const studentByRun = (run: string) => school().students.find((s) => s.rut === normalizeRut(run));
const accountByRun = (run: string) => accountsState().users.find((a) => a.rut === normalizeRut(run));
const fullName = (v: Record<string, string>) => `${v.nombres} ${v.apellidos}`.replace(/\s+/g, " ").trim();

/** «7° Básico A: Matemática» → asignatura del libro (acepta nombres parecidos: «Lenguaje y Comunicación»). */
function subjectFor(course: string, subject: string) {
  const c = courseByName(course);
  if (!c) return undefined;
  const s = fold(subject);
  return repo.subjects().find((x) => x.courseId === c.id && (fold(x.name) === s || s.startsWith(fold(x.name)) || fold(x.name).startsWith(s)));
}

// ───────────────────────── Plan ─────────────────────────

export type PlanResult = { rows: ImportPlanRow[]; newCourses: string[]; missing: string[]; ignored: string[] };

export function planImport(kind: ImportKind, table: string[][], options: PendingImport["options"]): PlanResult {
  const t = readTable(kind, table);
  if (t.missing.length) return { rows: [], newCourses: [], missing: t.missing, ignored: t.ignored };
  const newCourses = new Set<string>();
  const firstOfGuardian = new Map<string, Record<string, string>>();

  const rows = t.rows.map(({ line, values: v, issues }): ImportPlanRow => {
    const row = (action: ImportPlanRow["action"], note: string): ImportPlanRow => ({ line, values: v, action, note });
    if (issues.length) return row("error", issues.join(" · "));

    if (kind === "estudiantes") {
      const parsed = parseCourseName(v.curso!)!;
      const course = courseByName(v.curso!);
      if (!course) {
        if (!options.createCourses) return row("error", `El curso ${parsed.name} no existe. Marque «crear los cursos que falten» o créelo antes.`);
        newCourses.add(parsed.name);
      }
      const existing = studentByRun(v.run!);
      if (!existing) return row("crear", course ? course.name : `${parsed.name} (curso nuevo)`);
      const changes: string[] = [];
      if (existing.courseId !== course?.id) changes.push(`curso: ${repo.course(existing.courseId)?.name ?? "—"} → ${parsed.name}`);
      if (fold(`${existing.firstName} ${existing.lastName}`) !== fold(fullName(v))) changes.push("nombre");
      return changes.length ? row("actualizar", `Ya matriculado; cambia ${changes.join(" y ")}`) : row("omitir", "Ya matriculado, sin cambios");
    }

    if (kind === "funcionarios") {
      const existing = accountByEmail(v.correo!) ?? accountByRun(v.run!);
      if (existing) return row("omitir", `Ya tiene cuenta (${existing.email})`);
      const pendingReq = accountsState().requests.find((r) => r.status === "esperando_direccion" && (r.email === v.correo!.toLowerCase() || r.rut === normalizeRut(v.run!)));
      if (pendingReq) return row("omitir", "Ya hay una propuesta esperando a dirección");
      let roles = rolesFromProfile(v.perfil!);
      const notes: string[] = [];
      if (v.jefatura && !courseByName(v.jefatura)) return row("error", `El curso de jefatura ${v.jefatura} no existe. Cargue primero los estudiantes.`);
      const pairs = v.asignaturas ? parseSubjects(v.asignaturas) : [];
      const missingSubjects = pairs.filter((p) => !subjectFor(p.course || v.jefatura || "", p.subject)).map((p) => `${p.course || "?"}: ${p.subject}`);
      if (missingSubjects.length) notes.push(`No se encontró: ${missingSubjects.join(", ")}`);
      if ((v.jefatura || pairs.length) && !roles.includes("teacher")) {
        roles = ["teacher", ...roles];
        notes.push("se agrega el perfil Docente");
      }
      const label = roles.map((r) => ROLE_LABEL[r]).join(", ");
      if (isSensitive(roles)) return row("direccion", [`${label}: perfil sensible, queda esperando aprobación de dirección`, ...notes].join(" · "));
      return row("crear", [label + (v.jefatura ? ` · jefatura ${parseCourseName(v.jefatura)!.name}` : ""), ...notes].join(" · "));
    }

    // Apoderados: una fila por pupilo; las filas del mismo RUN forman una sola cuenta.
    const student = studentByRun(v.run_estudiante!);
    if (!student) return row("error", "El estudiante no está en la matrícula. Cargue primero los estudiantes.");
    const key = normalizeRut(v.run!);
    const first = firstOfGuardian.get(key);
    if (first && first.correo!.toLowerCase() !== v.correo!.toLowerCase()) return row("error", `El mismo RUN tiene otro correo en la línea anterior (${first.correo})`);
    firstOfGuardian.set(key, first ?? v);
    const existing = accountByRun(v.run!) ?? accountByEmail(v.correo!);
    const ward = `${student.firstName} ${student.lastName}`;
    if (existing) {
      if (!existing.roles.includes("guardian_academic")) return row("error", `El RUN o correo ya pertenece a otra cuenta (${existing.email})`);
      const wards = existing.scope.wardIds ?? (existing.scope.studentId ? [existing.scope.studentId] : []);
      return wards.includes(student.id) ? row("omitir", `Ya es apoderado/a de ${ward}`) : row("actualizar", `Se agrega ${ward} a su cuenta`);
    }
    return row("crear", first ? `Pupilo adicional: ${ward}` : `Apoderado/a de ${ward}`);
  });

  return { rows, newCourses: [...newCourses], missing: [], ignored: t.ignored };
}

/** Rehace la tabla desde las filas guardadas (para volver a planificar al confirmar). */
const tableOf = (kind: ImportKind, rows: ImportPlanRow[]) => {
  const keys = IMPORT_COLUMNS[kind].map((c) => c.key);
  return [keys, ...rows.map((r) => keys.map((k) => r.values[k] ?? ""))];
};

export function savePending(kind: ImportKind, fileName: string, plan: PlanResult, options: PendingImport["options"], by: string): PendingImport {
  const st = accountsState();
  st.imports ??= [];
  // Una sola revisión abierta por persona: la anterior se descarta.
  for (const p of st.imports) if (p.status === "revision" && p.createdBy === by) p.status = "descartada";
  const pending: PendingImport = { id: uuidv7(), kind, fileName, createdAt: new Date().toISOString(), createdBy: by, options, rows: plan.rows, newCourses: plan.newCourses, status: "revision" };
  st.imports.push(pending);
  return pending;
}

// ───────────────────────── Aplicar ─────────────────────────

export function applyImport(p: PendingImport, by: string, origin: string): string {
  const plan = planImport(p.kind, tableOf(p.kind, p.rows), p.options);
  const lines = p.rows.map((r) => r.line);
  plan.rows.forEach((r, i) => (r.line = lines[i] ?? r.line));
  const count = { crear: 0, actualizar: 0, direccion: 0, omitir: 0, error: 0 };
  const s = school();

  if (p.kind === "estudiantes") {
    for (const name of plan.newCourses) {
      const parsed = parseCourseName(name)!;
      const id = `course-${crypto.randomUUID().slice(0, 8)}`;
      s.courses.push({ id, tenantId: s.tenantId, name: parsed.name, level: parsed.level, headTeacherId: "", startTime: "08:00" });
      addCourseSubjects(id);
    }
  }

  const guardians = new Map<string, { v: Record<string, string>; wards: string[] }>();
  for (const r of plan.rows) {
    count[r.action]++;
    const v = r.values;
    if (r.action === "omitir" || r.action === "error") continue;

    if (p.kind === "estudiantes") {
      const courseId = courseByName(v.curso!)!.id;
      const existing = studentByRun(v.run!);
      if (existing) Object.assign(existing, { firstName: v.nombres!, lastName: v.apellidos!, courseId });
      else {
        const id = `est-${crypto.randomUUID().slice(0, 12)}`;
        s.students.push({ id, tenantId: s.tenantId, rut: normalizeRut(v.run!), firstName: v.nombres!, lastName: v.apellidos!, courseId });
        const hp = profile(id); // ficha en blanco; solo los datos que vienen en el archivo
        if (v.fecha_nacimiento) hp.birthDate = parseDate(v.fecha_nacimiento)!;
        if (v.sexo) hp.sex = sexFrom(v.sexo);
      }
      continue;
    }

    if (p.kind === "funcionarios") {
      let roles: Role[] = rolesFromProfile(v.perfil!);
      const pairs = v.asignaturas ? parseSubjects(v.asignaturas) : [];
      if ((v.jefatura || pairs.length) && !roles.includes("teacher")) roles = ["teacher", ...roles];
      const subjectIds = pairs.map((x) => subjectFor(x.course || v.jefatura || "", x.subject)?.id).filter((id): id is string => !!id);
      const proposal: Proposal = {
        roles,
        scope: { ...(subjectIds.length ? { subjectIds } : {}), ...(v.jefatura ? { headOfCourseId: courseByName(v.jefatura)!.id } : {}) },
        mfa: isSensitive(roles) ? "app" : "correo",
      };
      const data = { name: fullName(v), rut: v.run!, email: v.correo!, phone: v.telefono || undefined };
      if (r.action === "direccion") {
        const now = new Date().toISOString();
        accountsState().requests.push({ id: uuidv7(), ...data, rut: normalizeRut(v.run!), email: v.correo!.toLowerCase(), relationship: "Carga inicial", status: "esperando_direccion", createdAt: now, proposal: { ...proposal, by, at: now } });
      } else createAccount(data, proposal, by, origin, p.options.sendInvites);
      continue;
    }

    const student = studentByRun(v.run_estudiante!)!;
    const existing = accountByRun(v.run!) ?? accountByEmail(v.correo!);
    if (existing) addWard(existing, student.id);
    else {
      const g = guardians.get(normalizeRut(v.run!)) ?? { v, wards: [] };
      g.wards.push(student.id);
      guardians.set(normalizeRut(v.run!), g);
    }
  }

  for (const { v, wards } of guardians.values()) {
    createAccount(
      { name: fullName(v), rut: v.run!, email: v.correo!, phone: v.telefono || undefined },
      { roles: ["guardian_academic"], scope: { studentId: wards[0], wardIds: wards }, mfa: "correo" },
      by, origin, p.options.sendInvites,
    );
  }

  const parts = [
    count.crear && `${count.crear} ${p.kind === "apoderados" ? "filas creadas" : "creados"}`,
    count.actualizar && `${count.actualizar} actualizados`,
    count.direccion && `${count.direccion} esperan aprobación de dirección`,
    count.omitir && `${count.omitir} sin cambios`,
    count.error && `${count.error} con errores (no se cargaron)`,
    plan.newCourses.length && `${plan.newCourses.length} cursos nuevos`,
  ].filter(Boolean);
  const result = parts.join(" · ") || "Sin cambios";
  p.rows = plan.rows;
  p.status = "aplicada";
  p.appliedAt = new Date().toISOString();
  p.result = result;
  audit(by, `Carga masiva de ${KIND_LABEL[p.kind].toLowerCase()}`, `${p.fileName}: ${result}${p.options.sendInvites || p.kind === "estudiantes" ? "" : " · sin enviar invitaciones"}`);
  return result;
}

function addWard(a: Account, studentId: string) {
  const wards = a.scope.wardIds ?? (a.scope.studentId ? [a.scope.studentId] : []);
  if (!wards.includes(studentId)) wards.push(studentId);
  a.scope.wardIds = wards;
  a.scope.studentId ??= studentId;
}
