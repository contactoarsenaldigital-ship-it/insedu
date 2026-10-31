import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { IMPORT_COLUMNS, KIND_LABEL, templateCsv, type ImportKind } from "@insedu/domain";

/**
 * Plantillas para la carga masiva (CSV o Excel). No contienen datos personales: solo
 * encabezados y dos filas de ejemplo, así que no exigen sesión.
 */
export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const kind = (["estudiantes", "funcionarios", "apoderados"] as ImportKind[]).find((k) => k === tipo);
  if (!kind) return NextResponse.json({ error: "Plantilla no reconocida" }, { status: 404 });
  const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

  if (new URL(req.url).searchParams.get("formato") === "csv") {
    return new NextResponse(templateCsv(kind), {
      headers: { ...headers, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="plantilla-${kind}.csv"` },
    });
  }

  const cols = IMPORT_COLUMNS[kind];
  const wb = new ExcelJS.Workbook();
  wb.creator = "INSEDU";
  const ws = wb.addWorksheet("Datos");
  ws.columns = cols.map((c) => ({ header: c.label, key: c.key, width: Math.max(16, c.label.length + 4, c.example[0].length + 2) }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const i of [0, 1] as const) ws.addRow(Object.fromEntries(cols.map((c) => [c.key, c.example[i]])));
  // Texto para RUN y fechas: Excel no debe convertirlos en números ni fechas.
  cols.forEach((_, i) => (ws.getColumn(i + 1).numFmt = "@"));

  const help = wb.addWorksheet("Instrucciones");
  help.columns = [{ header: "Columna", width: 24 }, { header: "Obligatoria", width: 12 }, { header: "Cómo completarla", width: 90 }];
  help.getRow(1).font = { bold: true };
  for (const c of cols) help.addRow([c.label, c.required ? "Sí" : "No", c.help]);
  help.addRow([]);
  help.addRow([`Reemplace las filas de ejemplo de la hoja «Datos» con ${KIND_LABEL[kind].toLowerCase()}. Una persona por fila${kind === "apoderados" ? " (o una fila por pupilo)" : ""}.`]);

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      ...headers,
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="plantilla-${kind}.xlsx"`,
    },
  });
}
