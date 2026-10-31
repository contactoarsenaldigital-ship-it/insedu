import { computeDv, isValidRut, normalizeRut } from "./rut";
import type { Role } from "./types";

/**
 * Carga masiva inicial (CSV, TXT o Excel convertido a tabla): lectura del archivo, columnas
 * esperadas y validación de cada fila. Las comprobaciones contra los datos del establecimiento
 * (cursos, matrícula, cuentas existentes) se hacen en la aplicación.
 */

export type ImportKind = "estudiantes" | "funcionarios" | "apoderados";

export type ImportColumn = { key: string; label: string; required: boolean; help: string; aliases: string[]; example: [string, string] };

const col = (key: string, label: string, required: boolean, help: string, aliases: string[], example: [string, string]): ImportColumn => ({ key, label, required, help, aliases, example });

export const IMPORT_COLUMNS: Record<ImportKind, ImportColumn[]> = {
  estudiantes: [
    col("run", "RUN", true, "Con o sin puntos y guion", ["rut", "run estudiante", "rut estudiante"], ["23.456.789-6", "24.123.456-8"]),
    col("nombres", "Nombres", true, "", ["nombre", "nombres estudiante"], ["Martina Paz", "Tomás"]),
    col("apellidos", "Apellidos", true, "", ["apellido", "apellido paterno y materno"], ["González Rojas", "Pérez Soto"]),
    col("curso", "Curso", true, "Por ejemplo 7° Básico A o 1 Medio B", ["curso estudiante", "nivel y letra"], ["7° Básico A", "1° Medio B"]),
    col("fecha_nacimiento", "Fecha de nacimiento", false, "DD-MM-AAAA o AAAA-MM-DD", ["fecha nacimiento", "nacimiento", "fecha de nacimiento"], ["14-05-2013", "2010-11-02"]),
    col("sexo", "Sexo registral", false, "F o M", ["genero", "sexo registral"], ["F", "M"]),
  ],
  funcionarios: [
    col("run", "RUN", true, "Con o sin puntos y guion", ["rut"], ["12.345.678-5", "13.579.246-2"]),
    col("nombres", "Nombres", true, "", ["nombre"], ["Carolina", "Jorge Andrés"]),
    col("apellidos", "Apellidos", true, "", ["apellido"], ["Fuentes Mora", "Valenzuela Díaz"]),
    col("correo", "Correo", true, "Preferentemente institucional", ["email", "correo electronico", "e-mail", "mail"], ["cfuentes@colegio.cl", "jvalenzuela@colegio.cl"]),
    col("perfil", "Perfil", true, "Docente, Inspectoría, Portería, Orientación, Psicología, Trabajo social, Enfermería, Salvaguarda, Dirección o Administración. Varios separados por coma", ["cargo", "rol", "funcion"], ["Docente", "Dirección"]),
    col("telefono", "Teléfono", false, "", ["fono", "celular", "telefono movil"], ["+56 9 1234 5678", ""]),
    col("jefatura", "Jefatura", false, "Curso donde es profesor/a jefe", ["profesor jefe", "curso jefatura"], ["7° Básico A", ""]),
    col("asignaturas", "Asignaturas", false, "Curso: asignatura, separadas por |", ["asignatura", "cursos y asignaturas"], ["7° Básico A: Matemática | 8° Básico A: Matemática", ""]),
  ],
  apoderados: [
    col("run", "RUN", true, "RUN del apoderado/a", ["rut", "run apoderado", "rut apoderado"], ["15.678.901-1", "15.678.901-1"]),
    col("nombres", "Nombres", true, "", ["nombre"], ["Paula Andrea", "Paula Andrea"]),
    col("apellidos", "Apellidos", true, "", ["apellido"], ["Rojas Vidal", "Rojas Vidal"]),
    col("correo", "Correo", true, "", ["email", "correo electronico", "e-mail", "mail"], ["paula.rojas@correo.cl", "paula.rojas@correo.cl"]),
    col("telefono", "Teléfono", false, "", ["fono", "celular"], ["+56 9 8765 4321", "+56 9 8765 4321"]),
    col("run_estudiante", "RUN del estudiante", true, "Una fila por cada pupilo", ["rut estudiante", "run alumno", "rut alumno", "run pupilo", "rut pupilo"], ["23.456.789-6", "24.123.456-8"]),
  ],
};

export const KIND_LABEL: Record<ImportKind, string> = { estudiantes: "Estudiantes", funcionarios: "Funcionarios y docentes", apoderados: "Apoderados" };

export const MAX_IMPORT_ROWS = 5000;

/** Perfiles que se pueden escribir en la columna «perfil». */
export const STAFF_ROLE_ALIASES: Record<string, Role> = {
  docente: "teacher", profesor: "teacher", profesora: "teacher",
  inspectoria: "inspector", inspector: "inspector", inspectora: "inspector",
  porteria: "gatekeeper", portero: "gatekeeper",
  orientacion: "counselor", orientador: "counselor", orientadora: "counselor",
  psicologia: "psychologist", psicologo: "psychologist", psicologa: "psychologist",
  "trabajo social": "social_worker", "trabajador social": "social_worker", "trabajadora social": "social_worker",
  enfermeria: "nurse", enfermero: "nurse", enfermera: "nurse", tens: "nurse",
  salvaguarda: "safeguarding_lead", "encargado de convivencia": "safeguarding_lead", "encargada de convivencia": "safeguarding_lead",
  direccion: "director", director: "director", directora: "director",
  administracion: "school_admin", administrativo: "school_admin", administrativa: "school_admin",
};

/** Minúsculas, sin tildes, sin «°» y con espacios simples. */
export const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[°º]/g, " ").replace(/[_\s]+/g, " ").trim().toLowerCase();

// ───────────────────────── Lectura del archivo ─────────────────────────

/** Separa un texto delimitado (detecta «;», «,», tabulación o «|»; respeta comillas). */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const first = clean.split("\n").find((l) => l.trim()) ?? "";
  const delim = [";", "\t", ",", "|"].map((d) => ({ d, n: first.split(d).length })).sort((a, b) => b.n - a.n)[0]!.d;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") { quoted = true; cell = ""; }
    else if (ch === delim) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n") { row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** Curso escrito de cualquier forma («7 basico a», «7°B A», «1° Medio B») → nombre y nivel. */
export function parseCourseName(raw: string): { name: string; level: string } | null {
  const m = fold(raw).replace(/\s+/g, " ").match(/^(\d{1,2})\s*(?:o\s*)?(basico|basica|b|medio|media|m)\s*([a-z])?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const media = m[2]!.startsWith("m");
  if (n < 1 || n > (media ? 4 : 8)) return null;
  const level = `${n}° ${media ? "Medio" : "Básico"}`;
  return { level, name: `${level} ${(m[3] ?? "a").toUpperCase()}` };
}

/** Fecha en DD-MM-AAAA, DD/MM/AAAA o AAAA-MM-DD → AAAA-MM-DD. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, mo: number, d: number;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || y < 1930 || y > 2030) return null;
  return date.toISOString().slice(0, 10);
}

/** «7° Básico A: Matemática | 8° Básico A: Lenguaje» → pares curso/asignatura. */
export function parseSubjects(raw: string): { course: string; subject: string }[] {
  return raw.split(/[|\n]/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const i = p.indexOf(":");
    return i < 0 ? { course: "", subject: p } : { course: p.slice(0, i).trim(), subject: p.slice(i + 1).trim() };
  });
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ───────────────────────── Validación ─────────────────────────

export type ImportRow = { line: number; values: Record<string, string>; issues: string[] };
export type ImportTable = { rows: ImportRow[]; missing: string[]; ignored: string[] };

/** Asigna las columnas del archivo a las esperadas y valida el formato de cada fila. */
export function readTable(kind: ImportKind, table: string[][]): ImportTable {
  const cols = IMPORT_COLUMNS[kind];
  const header = (table[0] ?? []).map(fold);
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    const c = cols.find((c) => fold(c.key) === h || fold(c.label) === h || c.aliases.some((a) => fold(a) === h));
    if (c && !index.has(c.key)) index.set(c.key, i);
  });
  const missing = cols.filter((c) => c.required && !index.has(c.key)).map((c) => c.label);
  const ignored = (table[0] ?? []).filter((_, i) => ![...index.values()].includes(i) && table[0]![i]);
  if (missing.length) return { rows: [], missing, ignored };

  const seen = new Map<string, number>();
  const rows: ImportRow[] = table.slice(1, MAX_IMPORT_ROWS + 1).map((cells, i) => {
    const values: Record<string, string> = {};
    for (const c of cols) values[c.key] = String(cells[index.get(c.key) ?? -1] ?? "").trim();
    const issues: string[] = [];
    for (const c of cols) if (c.required && !values[c.key]) issues.push(`Falta ${c.label.toLowerCase()}`);
    if (values.run && !isValidRut(values.run)) issues.push("RUN no válido");
    if (values.run_estudiante && !isValidRut(values.run_estudiante)) issues.push("RUN del estudiante no válido");
    if (values.correo && !EMAIL_PATTERN.test(values.correo)) issues.push("Correo no válido");
    if (values.curso && !parseCourseName(values.curso)) issues.push("Curso no reconocido (ejemplo: 7° Básico A)");
    if (values.jefatura && !parseCourseName(values.jefatura)) issues.push("Curso de jefatura no reconocido");
    if (values.fecha_nacimiento && !parseDate(values.fecha_nacimiento)) issues.push("Fecha de nacimiento no válida");
    if (values.sexo && !sexFrom(values.sexo)) issues.push("Sexo: use F o M");
    if (values.perfil) {
      const unknown = values.perfil.split(/[,/;]/).map((p) => p.trim()).filter((p) => p && !(fold(p) in STAFF_ROLE_ALIASES));
      if (unknown.length) issues.push(`Perfil no reconocido: ${unknown.join(", ")}`);
    }
    // Repetidos dentro del mismo archivo (los apoderados repiten RUN: una fila por pupilo).
    const key = kind === "apoderados" ? `${normalizeRut(values.run ?? "")}|${normalizeRut(values.run_estudiante ?? "")}` : normalizeRut(values.run ?? "");
    if (values.run) {
      const prev = seen.get(key);
      if (prev) issues.push(`Repetido en el archivo (línea ${prev})`);
      else seen.set(key, i + 2);
    }
    return { line: i + 2, values, issues };
  });
  return { rows, missing, ignored };
}

export const rolesFromProfile = (raw: string): Role[] =>
  [...new Set(raw.split(/[,/;]/).map((p) => STAFF_ROLE_ALIASES[fold(p)]).filter((r): r is Role => !!r))];

export const sexFrom = (raw: string): "F" | "M" | undefined => {
  const c = raw.trim().slice(0, 1).toUpperCase();
  return c === "F" || c === "M" ? c : undefined;
};

/** Plantilla CSV con encabezados y dos filas de ejemplo (separador «;», como Excel en Chile). */
export function templateCsv(kind: ImportKind): string {
  const cols = IMPORT_COLUMNS[kind];
  const q = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [cols.map((c) => c.label), cols.map((c) => c.example[0]), cols.map((c) => c.example[1])];
  return "﻿" + lines.map((l) => l.map(q).join(";")).join("\r\n") + "\r\n";
}

/** RUN de ejemplo válido (para plantillas y pruebas). */
export const exampleRut = (body: number) => `${body}-${computeDv(body)}`;
