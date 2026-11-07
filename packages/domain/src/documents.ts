/**
 * Documentos escaneados que la Circular de registros pide cargar en el sistema: resoluciones y
 * constancias de matrícula, poderes de retiro, justificativos de asistencia. Solo PDF, JPG o PNG.
 * Los documentos no se borran: son respaldo ante fiscalización. Uno equivocado se reemplaza subiendo otro.
 */

export type DocumentOwnerKind = "matricula" | "salida" | "subvencion";

export type StoredDocument = {
  id: string;
  ownerKind: DocumentOwnerKind;
  ownerId: string;
  courseId?: string;
  /** Qué documento es, escrito por quien lo sube. */
  label: string;
  fileName: string;
  mime: DocumentMime;
  size: number;
  sha256: string;
  by: string;
  at: string;
};

export type DocumentMime = "application/pdf" | "image/jpeg" | "image/png";

/** Vercel acepta solicitudes de hasta 4,5 MB: el archivo no puede superar 4 MB. */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

/** Reconoce el tipo por los primeros bytes, no por el nombre ni por lo que declara el navegador. */
export function sniffDocument(bytes: Uint8Array): DocumentMime | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  return null;
}

export const DOCUMENT_EXTENSION: Record<DocumentMime, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

/** Nombre seguro para descargar: sin rutas ni caracteres de control, con la extensión del tipo real. */
export function safeFileName(name: string, mime: DocumentMime): string {
  const base = (name.split(/[\\/]/).pop() ?? "").replace(/\.[^.]*$/, "").replace(/^\.+/, "").normalize("NFC").replace(/[^\p{L}\p{N} ._-]+/gu, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "documento";
  return `${base}.${DOCUMENT_EXTENSION[mime]}`;
}

export function documentIssues(d: { label: string; size: number; mime: DocumentMime | null }): string[] {
  const issues: string[] = [];
  if (d.label.trim().length < 3) issues.push("Indique qué documento es");
  if (d.size === 0) issues.push("Seleccione un archivo");
  else if (d.size > MAX_DOCUMENT_BYTES) issues.push("El archivo supera 4 MB: escanee en menor resolución o en blanco y negro");
  else if (!d.mime) issues.push("Solo se aceptan archivos PDF, JPG o PNG");
  return issues;
}
