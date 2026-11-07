"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { documentIssues, safeFileName, sniffDocument, uuidv7, type DocumentOwnerKind } from "@insedu/domain";
import { canUploadDocument, DocumentStoreError, ownerOf, putBlob, sha256 } from "@/lib/documentos";
import { getSession } from "@/lib/session";
import { withState } from "@/lib/state";
import { documentsState, logEvent } from "@/lib/store";

const KINDS: DocumentOwnerKind[] = ["matricula", "salida", "subvencion"];

/** Vuelve a la página del registro; los mensajes nunca llevan nombres ni RUN. */
function back(path: string, msg: { ok?: string; error?: string }): never {
  revalidatePath(path.split("?")[0]!);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(msg as Record<string, string>)}`);
}

async function uploadImpl(f: FormData) {
  const kind = String(f.get("ownerKind") ?? "") as DocumentOwnerKind;
  const ownerId = String(f.get("ownerId") ?? "");
  const session = await getSession();
  if (!session) redirect("/ingresar");
  const owner = KINDS.includes(kind) ? ownerOf(kind, ownerId) : null;
  if (!owner) redirect("/");
  if (!canUploadDocument(session, kind)) back(owner.back, { error: "Su perfil no puede adjuntar documentos a este registro." });

  const file = f.get("file");
  const label = String(f.get("label") ?? "").trim().slice(0, 120);
  const bytes = file instanceof File && file.size > 0 ? Buffer.from(await file.arrayBuffer()) : Buffer.alloc(0);
  const mime = bytes.length ? sniffDocument(bytes) : null;
  const issues = documentIssues({ label, size: bytes.length, mime });
  if (issues.length || !mime) back(owner.back, { error: issues.join(". ") });

  const id = uuidv7();
  try {
    await putBlob(id, bytes);
  } catch (e) {
    if (e instanceof DocumentStoreError) back(owner.back, { error: e.message });
    console.error("[documentos] no se pudo guardar", e);
    back(owner.back, { error: "No se pudo guardar el documento. Intente nuevamente." });
  }
  const record = { id, ownerKind: kind, ownerId, courseId: owner.courseId, label, fileName: safeFileName(file instanceof File ? file.name : "", mime), mime, size: bytes.length, sha256: sha256(bytes), by: session.person.id, at: new Date().toISOString() };
  documentsState().push(record);
  logEvent({ actor: session.person.id, action: "crear", entity: "documento", recordId: id, courseId: owner.courseId, after: { ownerKind: kind, ownerId, label, fileName: record.fileName, size: record.size, sha256: record.sha256 } });
  back(owner.back, { ok: "Documento adjuntado." });
}

export async function uploadDocument(f: FormData) {
  return withState(() => uploadImpl(f));
}
