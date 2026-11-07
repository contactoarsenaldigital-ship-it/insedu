import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatRut, parseRut } from "@insedu/domain";
import { SignaturePad } from "@/components/SignaturePad";
import { Attachments } from "@/components/Attachments";
import { courseById, fullName, studentById } from "@/lib/demo";
import { canRegisterExits, canSeeStudentExits, exitsOf, exitsToday, nowTime, pickupsOf, wardsOf } from "@/lib/salidas";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { findPerson } from "@/lib/store";
import { addExit, addPickup, correctExit, registerReturn, revokePickup } from "../actions";

export const metadata = { title: "Salidas del estudiante" };
export const dynamic = "force-dynamic";

const run = (rut?: string) => (rut ? (parseRut(rut) ? formatRut(rut) : rut) : "—");

export default async function StudentExits({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  await readState();
  const { studentId } = await params;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=/salidas/${studentId}`);
  const student = studentById(studentId);
  if (!student) notFound();
  if (!canSeeStudentExits(session, studentId)) redirect("/salidas");
  const sp = await searchParams;
  const write = canRegisterExits(session);
  const isGuardian = wardsOf(session).includes(studentId);
  const managePickups = write || isGuardian;
  const pickups = pickupsOf(studentId);
  const history = exitsOf(studentId);
  const today = exitsToday();
  const now = nowTime();

  return (
    <main className="wrap" style={{ maxWidth: 860 }}>
      <Link href="/salidas" className="muted">← Salidas y retiros</Link>
      <h1 style={{ marginTop: 8 }}>{fullName(student)}</h1>
      <p className="muted">{courseById(student.courseId)?.name}{student.withdrawnOn ? ` · Baja de matrícula el ${student.withdrawnOn}` : ""}</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}

      <section className="section">
        <h2>Personas autorizadas para retirar</h2>
        {pickups.length === 0 ? <p className="notice warn">No hay personas autorizadas. {write && "Si alguien viene a retirar, debe traer una comunicación del apoderado."}</p> : (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Nombre</th><th>RUN</th><th>Relación</th><th>Teléfono</th>{managePickups && <th />}</tr></thead>
              <tbody>
                {pickups.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td><td>{run(p.rut)}</td><td>{p.relation}</td><td>{p.phone ?? "—"}</td>
                    {managePickups && (
                      <td>
                        <form action={revokePickup}>
                          <input type="hidden" name="studentId" value={studentId} />
                          <input type="hidden" name="pickupId" value={p.id} />
                          <button className="btn secondary small">Revocar</button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {managePickups && (
          <details className="card section" open={pickups.length === 0 && isGuardian}>
            <summary><strong>Agregar persona autorizada</strong></summary>
            <form action={addPickup} style={{ marginTop: 12 }}>
              <input type="hidden" name="studentId" value={studentId} />
              <div className="form-grid">
                <div className="field"><label htmlFor="p-name">Nombre y apellido</label><input id="p-name" name="name" required autoComplete="off" /></div>
                <div className="field"><label htmlFor="p-rut">RUN</label><input id="p-rut" name="rut" required autoComplete="off" /></div>
                <div className="field"><label htmlFor="p-rel">Relación con el estudiante</label><input id="p-rel" name="relation" required placeholder="Abuela, tío, transportista…" /></div>
                <div className="field"><label htmlFor="p-phone">Teléfono (opcional)</label><input id="p-phone" name="phone" type="tel" autoComplete="off" /></div>
                {!isGuardian && <div className="field wide"><label htmlFor="p-ev">Dónde consta la autorización del apoderado</label><input id="p-ev" name="evidence" required placeholder="Por ejemplo: poder simple N° 8, archivado en secretaría" /></div>}
              </div>
              <button className="btn primary">Autorizar</button>
            </form>
          </details>
        )}
      </section>

      {write && !student.withdrawnOn && (
        <section className="section">
          <h2>Registrar retiro</h2>
          <form action={addExit} className="card">
            <input type="hidden" name="studentId" value={studentId} />
            <div className="form-grid">
              <div className="field"><label htmlFor="date">Fecha</label><input id="date" name="date" type="date" required max={today} defaultValue={today} /></div>
              <div className="field"><label htmlFor="exitTime">Hora de salida</label><input id="exitTime" name="exitTime" type="time" required defaultValue={now} /></div>
              <div className="field wide">
                <label htmlFor="pickupAuthId">Quién retira</label>
                <select id="pickupAuthId" name="pickupAuthId" defaultValue={pickups[0]?.id ?? ""}>
                  {pickups.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.relation}</option>)}
                  <option value="">Otra persona, no registrada</option>
                </select>
                <span className="muted">Verifique la identidad con su cédula.</span>
              </div>
            </div>
            <fieldset className="field">
              <legend>Solo si es una persona no registrada</legend>
              <div className="form-grid">
                <div className="field"><label htmlFor="pickupName">Nombre y apellido</label><input id="pickupName" name="pickupName" autoComplete="off" /></div>
                <div className="field"><label htmlFor="pickupRut">RUN</label><input id="pickupRut" name="pickupRut" autoComplete="off" /></div>
                <div className="field wide"><label htmlFor="guardianNote">Comunicación del apoderado (fecha, motivo y dónde consta)</label><input id="guardianNote" name="guardianNote" autoComplete="off" /></div>
              </div>
            </fieldset>
            <div className="field"><label htmlFor="reason">Motivo de la salida</label><input id="reason" name="reason" required maxLength={200} /></div>
            <SignaturePad label="Firma de quien retira" />
            <div className="field"><label htmlFor="paperEvidence">O bien, poder simple en papel (dónde consta)</label><input id="paperEvidence" name="paperEvidence" /></div>
            <div className="field"><label htmlFor="observations">Observaciones (opcional)</label><input id="observations" name="observations" maxLength={500} /></div>
            <button className="btn primary">Registrar retiro</button>
          </form>
        </section>
      )}

      <section className="section">
        <h2>Historial de salidas</h2>
        {history.length === 0 ? <p className="muted">Sin salidas registradas.</p> : history.map((e) => (
          <article key={e.id} className="card pie-entry">
            <span className="eyebrow">Folio {e.folio} · {e.date} · salida {e.exitTime}{e.returnTime ? ` · regreso ${e.returnTime}` : " · sin regreso"}</span>
            <span>Retiró <strong>{e.pickupName}</strong> ({run(e.pickupRut)}){!e.pickupAuthId && <> <span className="tag alta">No registrada</span></>}</span>
            <span>Motivo: {e.reason}</span>
            {e.guardianNote && <span className="muted">Comunicación del apoderado: {e.guardianNote}</span>}
            {e.observations && <span className="muted">Observaciones: {e.observations}</span>}
            {e.signature
              ? (write ? <img src={e.signature} alt={`Firma de ${e.pickupName}`} width={240} height={80} className="signature-image" /> : <span className="muted">Con firma registrada</span>)
              : <span className="muted">Poder simple: {e.paperEvidence}</span>}
            {!isGuardian && <span className="muted">Registró {findPerson(e.by)?.name ?? e.by}</span>}
            {write && <Attachments kind="salida" ownerId={e.id} compact hint="Por ejemplo: poder simple escaneado" />}
            {write && !e.returnTime && (
              <form action={registerReturn} className="sign-form">
                <input type="hidden" name="exitId" value={e.id} />
                <input type="hidden" name="studentId" value={studentId} />
                <input type="hidden" name="backTo" value="student" />
                <input name="returnTime" type="time" required defaultValue={now} aria-label="Hora de regreso" />
                <button className="btn secondary small">Regresó</button>
              </form>
            )}
            {write && (
              <details>
                <summary>Corregir (requiere motivo)</summary>
                <form action={correctExit} style={{ marginTop: 8 }}>
                  <input type="hidden" name="studentId" value={studentId} />
                  <input type="hidden" name="exitId" value={e.id} />
                  <div className="form-grid">
                    <div className="field"><label htmlFor={`x-${e.id}`}>Hora de salida</label><input id={`x-${e.id}`} name="exitTime" type="time" required defaultValue={e.exitTime} /></div>
                    <div className="field"><label htmlFor={`y-${e.id}`}>Hora de regreso</label><input id={`y-${e.id}`} name="returnTime" type="time" defaultValue={e.returnTime} /></div>
                    <div className="field wide"><label htmlFor={`o-${e.id}`}>Observaciones</label><input id={`o-${e.id}`} name="observations" maxLength={500} defaultValue={e.observations} /></div>
                    <div className="field wide"><label htmlFor={`r-${e.id}`}>Motivo de la corrección</label><input id={`r-${e.id}`} name="reason" required minLength={10} maxLength={300} /></div>
                  </div>
                  <button className="btn secondary small">Guardar corrección</button>
                </form>
              </details>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
