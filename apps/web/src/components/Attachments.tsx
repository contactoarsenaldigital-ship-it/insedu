import type { DocumentOwnerKind } from "@insedu/domain";
import { uploadDocument } from "@/app/documentos/actions";
import { canReadDocument, canUploadDocument, documentsOf } from "@/lib/documentos";
import { getSession } from "@/lib/session";
import { findPerson } from "@/lib/store";

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
const isDemo = () => process.env.INSEDU_DATA_MODE !== "real";

/** Documentos escaneados de un registro: lista con descarga y formulario para adjuntar. */
export async function Attachments({ kind, ownerId, hint, compact = false }: { kind: DocumentOwnerKind; ownerId: string; hint?: string; compact?: boolean }) {
  const session = await getSession();
  if (!session || !canReadDocument(session, kind, ownerId)) return null;
  const docs = documentsOf(kind, ownerId);
  const upload = canUploadDocument(session, kind);
  const fieldId = `doc-${kind}-${ownerId}`;

  const form = upload && (
    <form action={uploadDocument} className="attach-form">
      <input type="hidden" name="ownerKind" value={kind} />
      <input type="hidden" name="ownerId" value={ownerId} />
      <div className="field"><label htmlFor={`${fieldId}-label`}>Qué documento es</label><input id={`${fieldId}-label`} name="label" required minLength={3} maxLength={120} placeholder={hint} /></div>
      <div className="field"><label htmlFor={`${fieldId}-file`}>Archivo PDF, JPG o PNG (hasta 4 MB)</label><input id={`${fieldId}-file`} name="file" type="file" required accept="application/pdf,image/jpeg,image/png" /></div>
      {isDemo() && <p className="muted">Demostración: no suba documentos reales.</p>}
      <button className="btn secondary small">Adjuntar</button>
    </form>
  );

  return (
    <div className="attachments">
      {docs.length > 0 && (
        <ul className="attach-list">
          {docs.map((d) => (
            <li key={d.id}>
              <a href={`/api/documentos/${d.id}`} download>{d.label}</a>
              <span className="muted"> · {d.fileName} · {size(d.size)}{compact ? "" : ` · ${findPerson(d.by)?.name ?? d.by}, ${d.at.slice(0, 10)}`}</span>
            </li>
          ))}
        </ul>
      )}
      {!compact && docs.length === 0 && <p className="muted">Sin documentos adjuntos.</p>}
      {form && (compact || docs.length > 0 ? <details><summary>Adjuntar documento</summary>{form}</details> : form)}
    </div>
  );
}
