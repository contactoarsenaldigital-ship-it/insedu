import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { comunaName, formatRut, missingEnrollmentData, WITHDRAWAL_LABEL, type StructuredAddress, type WithdrawalReason } from "@insedu/domain";
import { courseById, fullName, studentById } from "@/lib/demo";
import { canManageEnrollment, enrollmentOf } from "@/lib/matricula";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { findPerson, logbook } from "@/lib/store";
import { undoWithdrawal, updateEnrollment, withdrawStudent } from "../actions";
import { EnrollmentFields } from "../EnrollmentFields";
import { Attachments } from "@/components/Attachments";

export const metadata = { title: "Ficha de matrícula" };
export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });
const nameOf = (id: string) => findPerson(id)?.name ?? id;
const place = (a: StructuredAddress) => `${a.street}, ${a.unit}, ${comunaName(a.comunaCode)}, ${a.city}, código postal ${a.postalCode}`;

export default async function EnrollmentCard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  await readState();
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=/matricula/${id}`);
  if (!canManageEnrollment(session)) redirect("/matricula");
  const student = studentById(id);
  const record = enrollmentOf(id);
  if (!student || !record) notFound();
  const sp = await searchParams;
  const missing = missingEnrollmentData(record);
  const history = logbook().filter((e) => e.entity === "matricula" && e.recordId === id).slice(-20).reverse();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

  return (
    <main className="wrap" style={{ maxWidth: 860 }}>
      <Link href="/matricula" className="muted">← Registro de matrícula</Link>
      <h1 style={{ marginTop: 8 }}>{fullName(student)}</h1>
      <p className="muted">N° {record.number} de {record.level} · modalidad {record.modality} · {courseById(student.courseId)?.name}</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}
      {!record.withdrawal && missing.length > 0 && <p className="notice warn">Faltan datos mínimos: {missing.join(", ")}.</p>}

      {record.withdrawal && (
        <section className="card section">
          <h2 style={{ fontSize: "1.2rem" }}>Baja registrada el {record.withdrawal.date}</h2>
          <p><strong>{WITHDRAWAL_LABEL[record.withdrawal.reason]}.</strong> {record.withdrawal.detail}</p>
          <p className="muted">Constancia: {record.withdrawal.evidence} · registrada por {nameOf(record.withdrawal.by)} el {when(record.withdrawal.at)}</p>
          <p><Link className="btn" href={`/matricula/${id}/certificado`}>Ver certificado de baja</Link></p>
          <details>
            <summary>Anular la baja (solo si fue un error de registro)</summary>
            <form action={undoWithdrawal} style={{ marginTop: 12 }}>
              <input type="hidden" name="id" value={id} />
              <div className="field"><label htmlFor="reason">Motivo de la anulación</label><input id="reason" name="reason" required minLength={10} maxLength={300} /></div>
              <button className="btn secondary small">Anular baja</button>
            </form>
          </details>
        </section>
      )}

      <form action={updateEnrollment} className="card section">
        <input type="hidden" name="id" value={id} />
        <EnrollmentFields student={student} record={record} />
        <div className="field"><label htmlFor="note">Nueva observación (opcional)</label><textarea id="note" name="note" maxLength={500} placeholder="Por ejemplo: cambio de nombre social." /></div>
        <span className="muted">Los cambios de curso, nombre o apoderado se anotan solos en las observaciones.</span>
        <div style={{ marginTop: 12 }}><button className="btn primary">Guardar cambios</button></div>
      </form>

      {!record.withdrawal && (
        <details className="section card">
          <summary><strong>Registrar baja</strong></summary>
          <form action={withdrawStudent} style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={id} />
            <p className="muted">El estudiante sale de los libros, encuestas y comunicados, pero su ficha e historia se conservan. La entrega de documentos no se puede condicionar a ningún pago.</p>
            <div className="form-grid">
              <div className="field"><label htmlFor="date">Fecha de la baja</label><input id="date" name="date" type="date" required max={today} defaultValue={today} /></div>
              <div className="field">
                <label htmlFor="w-reason">Motivo</label>
                <select id="w-reason" name="reason" required defaultValue="">
                  <option value="" disabled>Seleccione…</option>
                  {(Object.keys(WITHDRAWAL_LABEL) as WithdrawalReason[]).map((k) => <option key={k} value={k}>{WITHDRAWAL_LABEL[k]}</option>)}
                </select>
              </div>
            </div>
            <div className="field"><label htmlFor="detail">Detalle</label><textarea id="detail" name="detail" required minLength={10} maxLength={500} /></div>
            <div className="field">
              <label htmlFor="evidence">Dónde consta la firma o declaración del apoderado</label>
              <input id="evidence" name="evidence" required minLength={5} maxLength={200} placeholder="Por ejemplo: declaración jurada simple N° 12, archivada en secretaría" />
              <span className="muted">En la vía excepcional, indique el informe ratificado por dirección. Por ahora se anota la referencia; aún no se pueden adjuntar documentos.</span>
            </div>
            <label className="check" style={{ marginBottom: 12 }}>
              <input type="checkbox" name="attest" value="1" />
              Solo vía excepcional: se cumplió el procedimiento del reglamento interno, con al menos 40 días hábiles de ausencia, llamado, correo o carta certificada y visita domiciliaria.
            </label>
            <button className="btn primary">Registrar baja</button>
          </form>
        </details>
      )}

      {(record.location || record.guardians[0]?.location || record.enrollmentScan) && (
        <section className="card section">
          <h2 style={{ fontSize: "1.2rem" }}>Datos para el EDE</h2>
          {record.location && <p><strong>Domicilio del estudiante:</strong> {place(record.location)}</p>}
          {record.guardians[0]?.location && <p><strong>Domicilio del apoderado:</strong> {place(record.guardians[0].location)}</p>}
          {record.guardians[0]?.rut && <p><strong>RUN del apoderado:</strong> {formatRut(record.guardians[0].rut)}</p>}
          {record.enrollmentScan && <p><strong>Matrícula definitiva:</strong> documento de respaldo cargado (ejemplo ficticio).</p>}
        </section>
      )}

      <section className="section">
        <h2>Documentos escaneados</h2>
        <p className="muted">Resoluciones, constancias de baja y otros respaldos de la ficha. No se borran: si uno está equivocado, adjunte el correcto.</p>
        <Attachments kind="matricula" ownerId={id} hint="Por ejemplo: constancia de retiro firmada por el apoderado" />
      </section>

      <section className="section">
        <h2>Observaciones</h2>
        {record.notes.length === 0 ? <p className="muted">Sin observaciones.</p> : (
          <ul className="enrollment-notes">{[...record.notes].reverse().map((n) => <li key={n.at + n.text}><span className="muted">{when(n.at)} · {nameOf(n.by)}</span><br />{n.text}</li>)}</ul>
        )}
      </section>

      <section className="section">
        <h2>Historial en la bitácora</h2>
        {history.length === 0 ? <p className="muted">Sin cambios registrados desde que se activó la bitácora.</p> : (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Motivo</th></tr></thead>
              <tbody>{history.map((e) => <tr key={e.id}><td>{when(e.at)}</td><td>{nameOf(e.actor)}</td><td>{e.action}</td><td>{e.reason ?? "—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
