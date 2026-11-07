import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { daysWaiting, DELIVERY_DOC_LABEL, formatRut, parseRut, REQUEST_STATUS_LABEL, REQUESTER_LABEL, requestStatus } from "@insedu/domain";
import { Attachments } from "@/components/Attachments";
import { SignaturePad } from "@/components/SignaturePad";
import { courseById, fullName, studentById } from "@/lib/demo";
import { canManageDeliveries, canSeeRequest, deliveriesToday, ownStudents, requestById } from "@/lib/entregas";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { findPerson } from "@/lib/store";
import { confirmReception, deliver, withdrawRequest } from "../actions";

export const metadata = { title: "Solicitud de documentos" };
export const dynamic = "force-dynamic";

const nameOf = (id?: string) => (id ? findPerson(id)?.name ?? id : "");
const run = (rut?: string) => (rut ? (parseRut(rut) ? formatRut(rut) : rut) : "");

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  await readState();
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=/entregas/${id}`);
  const r = requestById(id);
  if (!r) notFound();
  if (!canSeeRequest(session, r)) redirect("/entregas");
  const sp = await searchParams;
  const staff = canManageDeliveries(session);
  const isOwn = ownStudents(session).includes(r.studentId);
  const status = requestStatus(r);
  const st = studentById(r.studentId);
  const today = deliveriesToday();
  const d = r.delivery;

  return (
    <main className="wrap" style={{ maxWidth: 820 }}>
      <Link href="/entregas" className="muted">← Documentos y certificados</Link>
      <h1 style={{ marginTop: 8 }}>Solicitud N° {r.folio}</h1>
      <p className="muted">{st ? fullName(st) : ""} · {courseById(r.courseId)?.name}</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}

      <section className="card section">
        <span className={`tag ${status === "entregada" ? "ok" : status === "desistida" ? "" : "media"}`}>{REQUEST_STATUS_LABEL[status]}</span>
        <p><strong>Documentos:</strong> {r.documents.map((x) => (x === "otro" && r.other ? r.other : DELIVERY_DOC_LABEL[x])).join("; ")}</p>
        <p>Solicitada el {r.requestedOn} por {REQUESTER_LABEL[r.requester.kind].toLowerCase()} {r.requester.name}{staff && r.requester.rut ? ` (${run(r.requester.rut)})` : ""}{status === "pendiente" ? ` · ${daysWaiting(r, today)} día(s) de espera` : ""}</p>
        {r.note && <p className="muted">{r.note}</p>}
        {d && (
          <p>
            Entregada el {d.on} {d.medium === "papel" ? `en papel a ${d.receivedBy}${staff && d.receivedRut ? ` (${run(d.receivedRut)})` : ""}` : "en forma electrónica"} · registró {nameOf(d.by)}.
            {d.medium === "electronico" && (d.confirmedAt ? ` Recepción conforme de ${nameOf(d.confirmedBy)} el ${d.confirmedAt.slice(0, 10)}.` : " Falta la recepción conforme.")}
          </p>
        )}
        {d?.signature && staff && <img src={d.signature} alt={`Firma de ${d.receivedBy}`} width={240} height={80} className="signature-image" />}
        {d?.paperEvidence && <p className="muted">Recepción firmada en papel: {d.paperEvidence}</p>}
        {r.withdrawn && <p className="muted">Desistida el {r.withdrawn.at.slice(0, 10)}: {r.withdrawn.reason}</p>}
      </section>

      <section className="section">
        <h2>Documentos entregados</h2>
        <p className="muted">{staff ? "Adjunte aquí los documentos para la entrega electrónica, o la copia de lo entregado en papel." : "Descargue los documentos y confirme que los recibió."}</p>
        <Attachments kind="entrega" ownerId={r.id} hint="Por ejemplo: certificado de promoción 2026" />
      </section>

      {isOwn && status === "por_confirmar" && (
        <form action={confirmReception} className="card section">
          <input type="hidden" name="requestId" value={r.id} />
          <p>Al confirmar, declara haber recibido conforme los documentos de esta solicitud. Quedará registrado con su cuenta, fecha y hora.</p>
          <button className="btn primary">Confirmo la recepción conforme</button>
        </form>
      )}

      {staff && status === "pendiente" && (
        <section className="section">
          <h2>Registrar entrega</h2>
          <form action={deliver} className="card">
            <input type="hidden" name="requestId" value={r.id} />
            <div className="form-grid">
              <div className="field"><label htmlFor="on">Fecha de entrega</label><input id="on" name="on" type="date" required min={r.requestedOn} max={today} defaultValue={today} /></div>
              <div className="field"><label htmlFor="medium">Medio</label><select id="medium" name="medium"><option value="papel">En papel, en persona</option><option value="electronico">Electrónica, con los documentos adjuntos</option></select></div>
            </div>
            <fieldset className="field">
              <legend>Solo si es en papel</legend>
              <div className="form-grid">
                <div className="field"><label htmlFor="receivedBy">Nombre y apellido de quien recibe</label><input id="receivedBy" name="receivedBy" autoComplete="off" /></div>
                <div className="field"><label htmlFor="receivedRut">RUN (opcional)</label><input id="receivedRut" name="receivedRut" autoComplete="off" /></div>
              </div>
              <SignaturePad label="Firma de recepción conforme" />
              <div className="field"><label htmlFor="paperEvidence">O bien, recepción firmada en papel (dónde consta)</label><input id="paperEvidence" name="paperEvidence" /></div>
            </fieldset>
            <button className="btn primary">Registrar entrega</button>
          </form>
        </section>
      )}

      {(staff || isOwn) && status === "pendiente" && (
        <details className="card section">
          <summary>Desistir de la solicitud</summary>
          <form action={withdrawRequest} style={{ marginTop: 8 }}>
            <input type="hidden" name="requestId" value={r.id} />
            <p className="muted">Solo a pedido de quien la hizo. La documentación no se puede negar ni retener.</p>
            <div className="field"><label htmlFor="reason">Motivo</label><input id="reason" name="reason" required minLength={10} maxLength={300} /></div>
            <button className="btn secondary small">Registrar desistimiento</button>
          </form>
        </details>
      )}
    </main>
  );
}
