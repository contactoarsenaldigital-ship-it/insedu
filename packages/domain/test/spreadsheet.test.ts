import { describe, expect, it } from "vitest";
import { fileSlug, formatCell, sheetToCsv, type Sheet } from "../src/spreadsheet";

describe("planillas descargables", () => {
  it("formatea celdas con convenciones chilenas", () => {
    expect(formatCell(4.55, "grade")).toBe("4,6");
    expect(formatCell(3.95, "grade")).toBe("4,0");
    expect(formatCell(6, "grade")).toBe("6,0");
    expect(formatCell(0.875, "percent")).toBe("87,5");
    expect(formatCell(12.4, "integer")).toBe("12");
    expect(formatCell("2026-10-20", "date")).toBe("20-10-2026");
    expect(formatCell(null, "grade")).toBe("");
    expect(formatCell("texto")).toBe("texto");
  });

  it("genera CSV con punto y coma, encabezados y comillas cuando hace falta", () => {
    const sheet: Sheet = {
      name: "Notas",
      title: "Calificaciones",
      columns: [{ header: "Estudiante" }, { header: "Nota", format: "grade" }, { header: "Asistencia", format: "percent" }],
      rows: [
        ["Pérez; Ana", 3.9, 0.9],
        ['Soto "Pancho"', null, 1],
      ],
    };
    expect(sheetToCsv(sheet)).toBe('Estudiante;Nota;Asistencia (%)\r\n"Pérez; Ana";3,9;90,0\r\n"Soto ""Pancho""";;100,0\r\n');
  });

  it("arma nombres de archivo sin tildes ni espacios", () => {
    expect(fileSlug("Notas · Matemática · 5° Básico A")).toBe("notas-matematica-5-basico-a");
  });
});
