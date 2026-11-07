import { NextResponse } from "next/server";
import { canReadDocument, DocumentStoreError, getBlob, sha256 } from "@/lib/documentos";
import { getSession } from "@/lib/session";
import { readState, saveState } from "@/lib/state";
import { documentsState, logEvent } from "@/lib/store";

/** Descarga de un documento adjunto. Cada descarga queda en la bitácora. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await readState();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Ingrese para descargar." }, { status: 401 });
  const { id } = await params;
  const doc = documentsState().find((d) => d.id === id);
  if (!doc || !canReadDocument(session, doc.ownerKind)) return NextResponse.json({ error: "No se encontró el documento." }, { status: 404 });

  let content: Buffer | null;
  try {
    content = await getBlob(id);
  } catch (e) {
    if (e instanceof DocumentStoreError) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("[documentos] no se pudo leer", e);
    return NextResponse.json({ error: "No se pudo leer el documento." }, { status: 500 });
  }
  if (!content) return NextResponse.json({ error: "El contenido del documento no está disponible." }, { status: 404 });
  if (sha256(content) !== doc.sha256) return NextResponse.json({ error: "El documento no coincide con su huella: puede haber sido alterado." }, { status: 409 });

  logEvent({ actor: session.person.id, action: "exportar", entity: "documento", recordId: id, courseId: doc.courseId });
  await saveState();
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "content-type": doc.mime,
      "content-disposition": `attachment; filename="${encodeURIComponent(doc.fileName)}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
