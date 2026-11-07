import { describe, expect, it } from "vitest";
import { documentIssues, MAX_DOCUMENT_BYTES, safeFileName, sniffDocument } from "../src/documents";

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0]);

describe("documentos", () => {
  it("reconoce el tipo por su contenido", () => {
    expect(sniffDocument(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("application/pdf");
    expect(sniffDocument(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffDocument(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffDocument(new TextEncoder().encode("<html><script>"))).toBeNull();
  });

  it("limpia el nombre y usa la extensión del tipo real", () => {
    expect(safeFileName("../../poder simple.exe", "application/pdf")).toBe("poder simple.pdf");
    expect(safeFileName("C:\\escaneos\\.oculto.jpg", "image/jpeg")).toBe("oculto.jpg");
    expect(safeFileName("Resolución N°12.PNG", "image/png")).toBe("Resolución N_12.png");
    expect(safeFileName("", "image/jpeg")).toBe("documento.jpg");
  });

  it("valida tamaño, tipo y descripción", () => {
    expect(documentIssues({ label: "Poder simple", size: 1000, mime: "application/pdf" })).toEqual([]);
    expect(documentIssues({ label: "", size: 0, mime: null })).toHaveLength(2);
    expect(documentIssues({ label: "Poder", size: MAX_DOCUMENT_BYTES + 1, mime: "application/pdf" })).toHaveLength(1);
    expect(documentIssues({ label: "Poder", size: 10, mime: null })).toEqual(["Solo se aceptan archivos PDF, JPG o PNG"]);
  });
});
