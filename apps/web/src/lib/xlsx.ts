import "server-only";
import ExcelJS from "exceljs";
import { roundTenth, type ColumnFormat, type Sheet } from "@insedu/domain";

/**
 * Escribe planillas del dominio como libro de Excel: título, fila de encabezado fija con filtros,
 * formatos numéricos reales (Excel los muestra con coma según la configuración regional) y notas
 * bajo 4,0 en rojo, como en el libro de clases.
 */
const NUM_FMT: Partial<Record<ColumnFormat, string>> = {
  integer: "0",
  decimal: "0.0",
  grade: "0.0",
  percent: "0.0%",
  date: "dd-mm-yyyy",
};

const HEADER_ROW = 4;

function cellValue(v: unknown, format: ColumnFormat = "text"): ExcelJS.CellValue {
  if (v == null || v === "") return null;
  if (format === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!));
  }
  if (format === "grade" && typeof v === "number") return roundTenth(v);
  return v as ExcelJS.CellValue;
}

/** Excel no admite \ / ? * [ ] : en el nombre de la hoja y lo limita a 31 caracteres. */
const sheetName = (s: string) => s.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);

export async function sheetsToXlsx(sheets: Sheet[], subtitle: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "INSEDU";
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheetName(sheet.name), {
      views: [{ state: "frozen", ySplit: HEADER_ROW, xSplit: Math.min(2, sheet.columns.length) }],
      pageSetup: { orientation: sheet.columns.length > 8 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.getCell("A1").value = sheet.title;
    ws.getCell("A1").font = { bold: true, size: 14 };
    ws.getCell("A2").value = subtitle;
    ws.getCell("A2").font = { color: { argb: "FF666666" }, size: 9 };

    const header = ws.getRow(HEADER_ROW);
    header.height = 32; // dos líneas: "Evaluación 1 (06-08, ×1)" no se corta a la mitad
    sheet.columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } };
      cell.alignment = { vertical: "middle", wrapText: true };
      const col = ws.getColumn(i + 1);
      col.width = c.width ?? Math.min(Math.max(c.header.length + 2, c.format === "text" || !c.format ? 14 : 9), 40);
      if (c.format && NUM_FMT[c.format]) col.numFmt = NUM_FMT[c.format]!;
    });

    sheet.rows.forEach((row, r) => {
      const xr = ws.getRow(HEADER_ROW + 1 + r);
      sheet.columns.forEach((c, i) => {
        const cell = xr.getCell(i + 1);
        cell.value = cellValue(row[i], c.format);
        if (c.format === "grade" && typeof row[i] === "number" && roundTenth(row[i] as number) < 4) {
          cell.font = { color: { argb: "FFC00000" }, bold: true };
        }
      });
    });

    if (sheet.columns.length) {
      ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW + sheet.rows.length, column: sheet.columns.length } };
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
