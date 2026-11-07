import Link from "next/link";
import { redirect } from "next/navigation";
import { daysWaiting, DELIVERY_DOC_LABEL, INSTITUTIONAL_LABEL, missingInstitutional, REQUEST_STATUS_LABEL, REQUESTER_LABEL, requestStatus } from "@insedu/domain";
import { Attachments } from "@/components/Attachments";
import { DownloadLinks } from "@/components/DownloadLinks";
import { activeStudents, courseById, fullName, school, studentById } from "@/lib/demo";
import { canManageDeliveries, canManageInstitutional, deliveriesToday, institutionalDocs, ownStudents } from "@/lib/entregas";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { deliveriesState } from "@/lib/store";
import { addRequest, publishInstitutional } from "./actions";

export const metadata = { title: "Documentos y certificados" };
export const dynamic = "force-dynamic";

const studentName = (id: string) => {
  const st = studentById(id);
  return st ? fullName(st) : id;
};

function DocumentChoices() {
  return (
    <fieldset className="field">
      <legend>Documentos</legend>
      {Object.entries(DELIVERY_DOC_LABEL).map(([k, v]) => <label key={k} className="check"><input type="checkbox" name="documents" value={k} /> {v}</label>)}
      <div className="field"><label htmlFor="other">Si es otro, cuál</label><input id="other" name="other" maxLength={120} /></div>
    </fieldset>
  );
}

export default async function Deliveries({ searchParams }: { searchParams: Promise<{ curso?: string; ok?: string; error?: string }> }) {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/entregas");
  const sp = await searchParams;
  const today = deliveriesToday();
  const staff = canManageDeliveries(session);
  const own = ownStudents(session);
  const { requests } = deliveriesState();
  const visible = requests.filter((r) => staff || own.includes(r.studentId)).sort((a, b) => b.requestedOn.localeCompare(a.requestedOn) || b.folio - a.folio);
  const open = visible.filter((r) => requestStatus(r) === "pendiente" || requestStatus(r) === "por_confirmar");
  const closed = visible.filter((r) => !open.includes(r)).slice(0, 30);
  const instruments = institutionalDocs();
  const missing = missingInstitutional(deliveriesState().institutional);
  const course = staff && sp.curso ? courseById(sp.curso) : undefined;

  const list = (items: typeof visible) => (
    <div className="table-scroll">
      <table className="data">
        <thead><tr><th>Folio</th><th>Solicitud</th>{staff && <th>Estudiante</th>}<th>Documentos</th><th>Estado</th>{staff && <th>Espera</th>}</tr></thead>
        <tbody>
          {items.map((r) => {
            const status = requestStatus(r);
            const wait = daysWaiting(r, today);
            return (
              <tr key={r.id}>
                <td><Link href={`/entregas/${r.id}`}>{r.folio}</Link></td>
                <td>{r.requestedOn}</td>
                {staff && <td>{studentName(r.studentId)}</td>}
                <td>{r.documents.map((d) => (d === "otro" && r.other ? r.other : DELIVERY_DOC_LABEL[d])).join("; ")}</td>
                <td><span className={`tag ${status === "entregada" ? "ok" : status === "desistida" ? "" : "media"}`}>{REQUEST_STATUS_LABEL[status]}</span></td>
                {staff && <td>{status === "pendiente" ? <span className={wait > 5 ? "tag alta" : undefined}>{wait} día(s)</span> : "—"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <main className="wrap" style={{ maxWidth: 1000 }}>
      <h1>Documentos y certificados</h1>
      <p>Solicitud y entrega de documentos para la continuidad de estudios, e instrumentos del establecimiento a disposición de la comunidad.</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}

      {(staff || own.length > 0) && (
        <section className="section">
          <h2>Solicitudes en curso</h2>
          <p className="notice">La documentación académica nunca se retiene por deudas u otros compromisos impagos (Ley General de Educación, art. 11). Entregar tarde es una infracción.</p>
          {open.length === 0 ? <p className="muted">No hay solicitudes en curso.</p> : list(open)}
          {staff && <DownloadLinks tipo="entregas" caption="Registro de entregas" />}
        </section>
      )}

      {own.length > 0 && (
        <section className="section">
          <h2>Pedir documentos</h2>
          <form action={addRequest} className="card" style={{ maxWidth: 560 }}>
            <div className="field">
              <label htmlFor="studentId">Estudiante</label>
              <select id="studentId" name="studentId">{own.map((id) => <option key={id} value={id}>{studentName(id)}</option>)}</select>
            </div>
            <DocumentChoices />
            <div className="field"><label htmlFor="note">Para qué los necesita (opcional)</label><input id="note" name="note" maxLength={500} /></div>
            <button className="btn primary">Enviar solicitud</button>
          </form>
        </section>
      )}

      {staff && (
        <section className="section">
          <h2>Registrar una solicitud presencial</h2>
          <form method="get" className="req-actions" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="curso">Curso</label>
              <select id="curso" name="curso" defaultValue={course?.id ?? ""}>
                <option value="" disabled>Elija un curso</option>
                {school().courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button className="btn secondary">Ver estudiantes</button>
          </form>
          {course && (
            <form action={addRequest} className="card section" style={{ maxWidth: 560 }}>
              <div className="field"><label htmlFor="s-student">Estudiante de {course.name}</label><select id="s-student" name="studentId">{activeStudents().filter((x) => x.courseId === course.id).sort((a, b) => a.lastName.localeCompare(b.lastName, "es")).map((x) => <option key={x.id} value={x.id}>{x.lastName}, {x.firstName}</option>)}</select></div>
              <div className="form-grid">
                <div className="field"><label htmlFor="requesterKind">Quién solicita</label><select id="requesterKind" name="requesterKind">{Object.entries(REQUESTER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div className="field"><label htmlFor="requesterName">Nombre y apellido</label><input id="requesterName" name="requesterName" required autoComplete="off" /></div>
                <div className="field"><label htmlFor="requesterRut">RUN (opcional)</label><input id="requesterRut" name="requesterRut" autoComplete="off" /></div>
                <div className="field"><label htmlFor="requestedOn">Fecha de la solicitud</label><input id="requestedOn" name="requestedOn" type="date" required max={today} defaultValue={today} /></div>
              </div>
              <DocumentChoices />
              <div className="field"><label htmlFor="s-note">Observación (opcional)</label><input id="s-note" name="note" maxLength={500} /></div>
              <button className="btn primary">Registrar solicitud</button>
            </form>
          )}
        </section>
      )}

      {closed.length > 0 && (
        <section className="section">
          <h2>Solicitudes cerradas</h2>
          {list(closed)}
        </section>
      )}

      <section className="section">
        <h2>Instrumentos del establecimiento</h2>
        {canManageInstitutional(session) && missing.length > 0 && <p className="notice warn">Falta publicar: {missing.map((k) => INSTITUTIONAL_LABEL[k]).join(", ")}.</p>}
        {instruments.length === 0 ? <p className="muted">Aún no hay instrumentos publicados.</p> : instruments.map((d) => (
          <article key={d.id} className="card pie-entry">
            <span className="eyebrow">{INSTITUTIONAL_LABEL[d.kind]} · versión {d.version}</span>
            <strong>{d.title}</strong>
            {d.where && (/^https:\/\//.test(d.where) ? <a href={d.where} rel="noopener noreferrer" target="_blank">{d.where}</a> : <span className="muted">Se consulta en: {d.where}</span>)}
            <Attachments kind="institucional" ownerId={d.id} compact hint="Archivo del instrumento" />
          </article>
        ))}
        {canManageInstitutional(session) && (
          <form action={publishInstitutional} className="card section" style={{ maxWidth: 560 }}>
            <h3>Publicar o actualizar un instrumento</h3>
            <p className="muted">Una nueva versión reemplaza a la anterior del mismo tipo, que se conserva en el registro.</p>
            <div className="field"><label htmlFor="kind">Tipo</label><select id="kind" name="kind">{Object.entries(INSTITUTIONAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field"><label htmlFor="title">Título</label><input id="title" name="title" required maxLength={120} /></div>
            <div className="field"><label htmlFor="version">Fecha de la versión vigente</label><input id="version" name="version" type="date" required max={today} /></div>
            <div className="field"><label htmlFor="where">Dirección web (https://) o lugar donde se consulta (opcional)</label><input id="where" name="where" maxLength={300} /></div>
            <button className="btn">Publicar</button>
          </form>
        )}
      </section>
    </main>
  );
}
