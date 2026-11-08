/**
 * Biblioteca del establecimiento: catálogo, ejemplares y préstamos.
 * - Un título (libro, revista, video u otro) tiene uno o más ejemplares numerados.
 * - El código de barras identifica al título; el préstamo se hace de un ejemplar.
 * - La disponibilidad se calcula siempre desde los ejemplares y los préstamos abiertos, así el stock no se descuadra.
 */

export type LibraryKind = "libro" | "revista" | "video" | "audio" | "otro";

export const LIBRARY_KIND_LABEL: Record<LibraryKind, string> = {
  libro: "Libro",
  revista: "Revista",
  video: "Video",
  audio: "Audio",
  otro: "Otro material",
};

export type LibraryMedium = "fisico" | "digital";

export const LIBRARY_MEDIUM_LABEL: Record<LibraryMedium, string> = { fisico: "Físico", digital: "Archivo digital" };

export type LibraryItem = {
  id: string;
  kind: LibraryKind;
  medium: LibraryMedium;
  title: string;
  author?: string;
  /** Código escaneado, normalizado: ISBN-13, ISSN u otro código propio. */
  code?: string;
  publisher?: string;
  year?: number;
  category?: string;
  /** Estante, sala o carpeta donde está. */
  location?: string;
  /** Enlace https a un archivo digital. */
  link?: string;
  notes?: string;
  by: string;
  at: string;
};

/** Estado físico del ejemplar. «Prestado» no se guarda: se deduce de los préstamos abiertos. */
export type CopyCondition = "activo" | "reparacion" | "perdido" | "baja";

export const COPY_CONDITION_LABEL: Record<CopyCondition, string> = {
  activo: "En uso",
  reparacion: "En reparación",
  perdido: "Perdido",
  baja: "Dado de baja",
};

export type LibraryCopy = { id: string; itemId: string; number: number; condition: CopyCondition; note?: string; by: string; at: string };

export type LibraryLoan = {
  id: string;
  itemId: string;
  copyId: string;
  borrowerId: string;
  borrowerKind: "estudiante" | "funcionario";
  loanedOn: string;
  dueOn: string;
  renewals: number;
  by: string;
  at: string;
  returnedOn?: string;
  returnedBy?: string;
  returnNote?: string;
};

export type CopyState = "disponible" | "prestado" | "reparacion" | "perdido" | "baja";

export const COPY_STATE_LABEL: Record<CopyState, string> = {
  disponible: "Disponible",
  prestado: "Prestado",
  reparacion: "En reparación",
  perdido: "Perdido",
  baja: "Dado de baja",
};

export type LoanState = "devuelto" | "vigente" | "por_vencer" | "atrasado";

export const LOAN_STATE_LABEL: Record<LoanState, string> = { devuelto: "Devuelto", vigente: "Vigente", por_vencer: "Vence pronto", atrasado: "Atrasado" };

export const MAX_STUDENT_LOANS = 3;
export const MAX_RENEWALS = 2;
export const MAX_LOAN_DAYS = 90;
export const MAX_NEW_COPIES = 200;
const DAY_MS = 86_400_000;
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

// ───────────── Códigos de barras ─────────────

export function isValidIsbn13(code: string): boolean {
  if (!/^97[89]\d{10}$/.test(code)) return false;
  const sum = [...code].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return sum % 10 === 0;
}

export function isValidIsbn10(code: string): boolean {
  if (!/^\d{9}[\dX]$/.test(code)) return false;
  const sum = [...code].reduce((s, c, i) => s + (c === "X" ? 10 : Number(c)) * (10 - i), 0);
  return sum % 11 === 0;
}

function isbn10To13(code: string): string {
  const body = `978${code.slice(0, 9)}`;
  const sum = [...body].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

export type LibraryCodeType = "isbn" | "issn" | "otro";

/** Limpia lo leído o tecleado. Un ISBN-10 se convierte a ISBN-13, para encontrar el libro con cualquiera de los dos. */
export function readLibraryCode(raw: string): { code: string; type: LibraryCodeType } | null {
  const clean = raw.trim().toUpperCase().replace(/^ISBN[:\s]*/, "").replace(/[\s-]/g, "");
  if (!clean || clean.length > 40 || !/^[0-9A-Z.$/+%]+$/.test(clean)) return null;
  if (isValidIsbn13(clean)) return { code: clean, type: "isbn" };
  if (isValidIsbn10(clean)) return { code: isbn10To13(clean), type: "isbn" };
  if (/^977\d{10}$/.test(clean)) return { code: clean, type: "issn" };
  return { code: clean, type: "otro" };
}

/** El lugar de los guiones de un ISBN depende de la editorial: se muestra el número completo, sin separar. */
export const formatLibraryCode = (code?: string) => code ?? "";

// ───────────── Disponibilidad ─────────────

export const isOpenLoan = (l: LibraryLoan) => !l.returnedOn;

export function copyState(copy: LibraryCopy, loans: LibraryLoan[]): CopyState {
  if (copy.condition !== "activo") return copy.condition;
  return loans.some((l) => l.copyId === copy.id && isOpenLoan(l)) ? "prestado" : "disponible";
}

export type Availability = { total: number; available: number; onLoan: number; unavailable: number };

/** total: ejemplares que siguen en la colección (sin perdidos ni dados de baja). */
export function availabilityOf(copies: LibraryCopy[], loans: LibraryLoan[]): Availability {
  const states = copies.map((c) => copyState(c, loans));
  const count = (s: CopyState) => states.filter((x) => x === s).length;
  return { total: states.length - count("perdido") - count("baja"), available: count("disponible"), onLoan: count("prestado"), unavailable: count("reparacion") };
}

export function loanState(loan: LibraryLoan, today: string): LoanState {
  if (loan.returnedOn) return "devuelto";
  if (loan.dueOn < today) return "atrasado";
  return (Date.parse(loan.dueOn) - Date.parse(today)) / DAY_MS <= 2 ? "por_vencer" : "vigente";
}

export const daysLate = (loan: LibraryLoan, today: string) => (loan.returnedOn || loan.dueOn >= today ? 0 : Math.round((Date.parse(today) - Date.parse(loan.dueOn)) / DAY_MS));

/** Plazo habitual: dos semanas para libros y una para el resto. Si cae en fin de semana, pasa al lunes. */
export function defaultDueDate(from: string, kind: LibraryKind): string {
  const d = new Date(`${from}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (kind === "libro" ? 14 : 7));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ───────────── Búsqueda ─────────────

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca por título, autor o código. Todas las palabras deben aparecer, sin importar tildes ni mayúsculas. */
export function searchLibrary(items: LibraryItem[], query: string, kind?: LibraryKind): LibraryItem[] {
  const code = readLibraryCode(query)?.code;
  const words = fold(query).split(/\s+/).filter(Boolean);
  return items
    .filter((i) => !kind || i.kind === kind)
    .filter((i) => {
      if (!words.length) return true;
      if (code && i.code === code) return true;
      const text = fold(`${i.title} ${i.author ?? ""}`);
      if (words.every((w) => text.includes(w))) return true;
      const digits = query.replace(/[\s-]/g, "");
      return digits.length >= 4 && !!i.code?.includes(digits.toUpperCase());
    })
    .sort((a, b) => a.title.localeCompare(b.title, "es"));
}

// ───────────── Validaciones ─────────────

export type LibraryItemDraft = { kind: string; medium: string; title: string; author?: string; code?: string; year?: string; link?: string; copies?: string };

export function libraryItemIssues(d: LibraryItemDraft, ctx: { thisYear: number; codeTaken: boolean; requireCopies: boolean }): string[] {
  const issues: string[] = [];
  if (!(d.kind in LIBRARY_KIND_LABEL)) issues.push("Indique el tipo de material");
  if (!(d.medium in LIBRARY_MEDIUM_LABEL)) issues.push("Indique si es físico o digital");
  if (d.title.trim().length < 2) issues.push("Escriba el título");
  if (d.code && !readLibraryCode(d.code)) issues.push("El código no es válido");
  if (ctx.codeTaken) issues.push("Ya existe un título con ese código: agregue ejemplares en su ficha");
  if (d.year && (!/^\d{4}$/.test(d.year) || Number(d.year) < 1400 || Number(d.year) > ctx.thisYear + 1)) issues.push("El año no es válido");
  if (d.link && !/^https:\/\/[^\s]+$/i.test(d.link)) issues.push("El enlace debe comenzar con https://");
  if (ctx.requireCopies) issues.push(...copiesIssues(d.copies ?? ""));
  return issues;
}

export function copiesIssues(value: string): string[] {
  return /^\d{1,3}$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= MAX_NEW_COPIES ? [] : [`Indique cuántos ejemplares son (1 a ${MAX_NEW_COPIES})`];
}

export function loanIssues(
  d: { dueOn: string; today: string; borrowerKnown: boolean; borrowerKind: LibraryLoan["borrowerKind"]; activeLoans: number; copyAvailable: boolean },
): string[] {
  const issues: string[] = [];
  if (!d.copyAvailable) issues.push("Ese ejemplar no está disponible");
  if (!d.borrowerKnown) issues.push("Elija a quién se presta");
  if (!isDate(d.dueOn) || d.dueOn <= d.today) issues.push("La fecha de devolución debe ser posterior a hoy");
  else if ((Date.parse(d.dueOn) - Date.parse(d.today)) / DAY_MS > MAX_LOAN_DAYS) issues.push(`El plazo no puede superar ${MAX_LOAN_DAYS} días`);
  if (d.borrowerKind === "estudiante" && d.activeLoans >= MAX_STUDENT_LOANS) issues.push(`El estudiante ya tiene ${MAX_STUDENT_LOANS} préstamos abiertos`);
  return issues;
}

export function renewalIssues(loan: LibraryLoan, newDue: string, today: string): string[] {
  const issues: string[] = [];
  if (loan.returnedOn) issues.push("Ese préstamo ya fue devuelto");
  if (loan.renewals >= MAX_RENEWALS) issues.push(`Se alcanzó el máximo de ${MAX_RENEWALS} renovaciones`);
  if (!isDate(newDue) || newDue <= today) issues.push("La nueva fecha debe ser posterior a hoy");
  else if (newDue <= loan.dueOn) issues.push("La nueva fecha debe ser posterior a la actual");
  else if ((Date.parse(newDue) - Date.parse(today)) / DAY_MS > MAX_LOAN_DAYS) issues.push(`El plazo no puede superar ${MAX_LOAN_DAYS} días`);
  return issues;
}

/** Un ejemplar prestado no cambia de estado: primero debe devolverse. */
export function copyConditionIssues(copy: LibraryCopy, loans: LibraryLoan[], next: string): string[] {
  if (!(next in COPY_CONDITION_LABEL)) return ["Estado no reconocido"];
  return copyState(copy, loans) === "prestado" && next !== "perdido" ? ["Ese ejemplar está prestado: registre primero su devolución"] : [];
}
