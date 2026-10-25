/**
 * Planillas descargables (Excel y CSV) a partir de una descripción común.
 * El dominio define columnas y filas; la aplicación decide quién puede descargar cada una.
 * CSV con convenciones chilenas para que Excel lo abra bien: separador ";", coma decimal y
 * fechas dd-mm-aaaa.
 */
import { roundTenth } from "./gradebook";

/** Las fechas van como "YYYY-MM-DD"; los porcentajes, como proporción 0..1. */
export type CellValue = string | number | null | undefined;

export type ColumnFormat = "text" | "integer" | "decimal" | "grade" | "percent" | "date";

export type SheetColumn = { header: string; format?: ColumnFormat; width?: number };

export type Sheet = {
  /** Nombre de la hoja en Excel (máx. 31 caracteres). */
  name: string;
  /** Título que encabeza la hoja en Excel. */
  title: string;
  columns: SheetColumn[];
  rows: CellValue[][];
};

const dec = (n: number, digits = 1) => n.toFixed(digits).replace(".", ",");

/** Valor de una celda tal como se escribe en el CSV. */
export function formatCell(v: CellValue, format: ColumnFormat = "text"): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    if (format === "grade") return dec(roundTenth(v)); // misma aproximación que el libro: 0,05 sube
    if (format === "decimal") return dec(v);
    if (format === "percent") return dec(v * 100);
    if (format === "integer") return String(Math.round(v));
    return String(v).replace(".", ",");
  }
  if (format === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("-");
  return v;
}

const escapeCsv = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function sheetToCsv(sheet: Sheet): string {
  const head = sheet.columns.map((c) => escapeCsv(c.format === "percent" ? `${c.header} (%)` : c.header));
  const body = sheet.rows.map((row) => sheet.columns.map((c, i) => escapeCsv(formatCell(row[i], c.format))));
  return [head, ...body].map((r) => r.join(";")).join("\r\n") + "\r\n";
}

/** Nombre de archivo sin tildes ni espacios: "notas-matematica-5-basico-a". */
export const fileSlug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
