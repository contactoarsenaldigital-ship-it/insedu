import Link from "next/link";
import { redirect } from "next/navigation";
import { DEPOSIT_ROLES, ROLE_LABEL, protocolById } from "@insedu/domain";
import { DEPOSIT_LABEL, VaultService } from "@insedu/domain/server";
import { school } from "@/lib/demo";
import { fmtDT, studentLabel, who } from "@/lib/format";
import { getSession } from "@/lib/session";
import { allStaff } from "@/lib/store";
import { actorOf, FORMAL_SUBSTITUTE_ID, TITULAR_ID, vault, vaultService } from "@/lib/vault";
import { createCase, endSubstitution, reviewDeposit, setSubstitution } from "./actions";
import { readState } from "@/lib/state";

export const metadata = { title: "Salvaguarda" };
export const dynamic = "force-dynamic";


export default async function SafeguardingHome({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; estudiante?: string }> }) {
  await readState();
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/salvaguarda");
  const v = await vaultService();
  const actor = actorOf(session);
  const holderId = v.holder(actor.tenantId);
  const assignment = vault().store.assignment(actor.tenantId)!;
  const isHolder = holderId === session.person.id;
  const canDeposit = session.person.roles.some((r) => DEPOSIT_ROLES.includes(r));
  const isDirector = session.person.roles.includes("director");

  const header = (
    <>
      <span className="muted">Salvaguarda · {session.person.name}</span>
      <h1>Expediente confidencial</h1>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}
    </>
  );

  if (!isHolder) {
    return (
      <main className="wrap" style={{ maxWidth: 860 }}>
        {header}
        <p className="notice">
          El expediente confidencial es de acceso exclusivo de quien ejerce hoy como Encargado de Salvaguarda:{" "}
          <strong>{who(holderId ?? "")}</strong>{assignment.substitute && holderId === assignment.substitute.userId ? " (suplencia activa)" : ""}.
          Ningún cargo, por jerarquía, puede leerlo.
        </p>
        <div className="grid section">
          {canDeposit && (
            <Link href="/salvaguarda/depositar" className="card">
              <span className="eyebrow">{session.person.roles.map((r) => ROLE_LABEL[r]).join(" · ")}</span>
              <h3>Entregar un antecedente a Salvaguarda</h3>
              <span className="muted">Entrevistas, derivaciones o revelaciones. Se cifran al enviarlas y usted no podrá volver a leerlas.</span>
            </Link>
          )}
          {isDirector && (
            <Link href="/salvaguarda/auditoria" className="card">
              <span className="eyebrow">Dirección</span>
              <h3>Auditoría de accesos y emergencia</h3>
              <span className="muted">Quién accedió, cuándo y con qué motivo, sin ver contenido. Solicitud de acceso de emergencia.</span>
            </Link>
          )}
        </div>
      </main>
    );
  }

  const inbox = v.inbox(actor);
  const now = new Date();
  const fresh = session.lastStrongAuthAt && now.getTime() - new Date(session.lastStrongAuthAt).getTime() < 5 * 60_000;

  return (
    <main className="wrap">
      {header}
      <p className="muted">
        {assignment.substitute && holderId === assignment.substitute.userId ? "Usted ejerce como suplente formal. " : ""}
        Abrir un caso exige verificación en dos pasos y motivo; cada acceso queda registrado.{" "}
        {fresh ? <span className="tag ok">✓ Identidad verificada</span> : <Link href="/verificar?next=/salvaguarda">Verificar identidad ahora</Link>}
      </p>

      <Link href="/salvaguarda/indicadores" className="card section" style={{ display: "block" }}>
        <span className="eyebrow">Tablero de indicadores</span>
        <h3>Estudiantes con puntos de atención</h3>
        <span className="muted">Rendimiento, conducta, asistencia y salud por nivel, curso y estudiante, con su evolución y acciones sugeridas.</span>
      </Link>

      {inbox.protocols.some((p) => !p.completedAt) && (
        <section className="section">
          <h2>Plazos de protocolos</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Estudiante</th><th>Protocolo</th><th>Acción</th><th>Vence</th><th></th></tr></thead>
              <tbody>
                {inbox.protocols.filter((p) => !p.completedAt).map((p) => {
                  const def = protocolById(p.protocolId);
                  const late = VaultService.overdue(p, now);
                  return (
                    <tr key={p.id}>
                      <td>{studentLabel(p.studentId)}</td>
                      <td>{def?.name}</td>
                      <td>{def?.dueAction}</td>
                      <td>{p.dueAt ? <span className={`tag ${late ? "alta" : "media"}`}>{late ? "Vencido · " : ""}{fmtDT(p.dueAt)}</span> : "—"}</td>
                      <td><Link href={`/salvaguarda/caso/${p.caseId}`}>Abrir caso</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="section">
        <h2>Antecedentes recibidos sin revisar ({inbox.pendingDeposits.length})</h2>
        {!inbox.pendingDeposits.length && <p className="muted">No hay antecedentes pendientes.</p>}
        <div className="grid">
          {inbox.pendingDeposits.map((d) => (
            <form key={d.id} action={reviewDeposit} className="card">
              <input type="hidden" name="depositId" value={d.id} />
              <span className="eyebrow">{DEPOSIT_LABEL[d.kind]} · {fmtDT(d.depositedAt)}</span>
              <h3>{studentLabel(d.studentId)}</h3>
              <span className="muted">Entregado por {who(d.depositedBy)} ({ROLE_LABEL[d.depositedRole as keyof typeof ROLE_LABEL] ?? d.depositedRole})</span>
              <button className="btn" style={{ marginTop: 8 }}>Revisar e incorporar al expediente</button>
            </form>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Casos</h2>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Estudiante</th><th>Estado</th><th>Abierto</th><th>Última actualización</th><th></th></tr></thead>
            <tbody>
              {inbox.cases.map((c) => (
                <tr key={c.id}>
                  <td>{studentLabel(c.studentId)}</td>
                  <td><span className={`tag ${c.status === "cerrado" ? "ok" : "media"}`}>{c.status}</span></td>
                  <td>{fmtDT(c.openedAt)}</td>
                  <td>{fmtDT(c.updatedAt)}</td>
                  <td><Link href={`/salvaguarda/caso/${c.id}`}>Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">La bandeja muestra solo metadatos; el contenido se descifra al abrir cada caso.</p>
      </section>

      <section className="section" id="abrir-caso">
        <h2>Abrir un caso</h2>
        <form action={createCase} className="card">
          <div className="grid">
            <div className="field">
              <label htmlFor="studentId">Estudiante</label>
              <select id="studentId" name="studentId" required defaultValue={school().students.some((s) => s.id === sp.estudiante) ? sp.estudiante : ""}>
                <option value="" disabled>Seleccione…</option>
                {school().students.map((s) => <option key={s.id} value={s.id}>{studentLabel(s.id)}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="title">Título</label><input id="title" name="title" required minLength={3} placeholder="Seguimiento de bienestar" /></div>
          </div>
          <div className="field"><label htmlFor="note">Primera nota</label><textarea id="note" name="note" rows={3} /></div>
          <button className="btn primary">Abrir caso</button>
        </form>
      </section>

      <section className="section">
        <h2>Suplencia formal</h2>
        {assignment.substitute ? (
          <form action={endSubstitution} className="card">
            <p style={{ margin: 0 }}>
              Suplencia de <strong>{who(assignment.substitute.userId)}</strong> hasta {fmtDT(assignment.substitute.activeUntil)}.
            </p>
            <button className="btn secondary">Terminar suplencia</button>
          </form>
        ) : (
          <form action={setSubstitution} className="card">
            <p className="muted" style={{ margin: 0 }}>Durante la suplencia solo el suplente accede; usted recupera el acceso al terminarla. Requiere una segunda aprobación.</p>
            <div className="grid">
              <div className="field">
                <label htmlFor="substituteId">Suplente</label>
                <select id="substituteId" name="substituteId" defaultValue={FORMAL_SUBSTITUTE_ID}>
                  {allStaff().filter((p) => p.id !== TITULAR_ID && p.roles.some((r) => ["counselor", "psychologist", "social_worker"].includes(r))).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {p.description}</option>
                  ))}
                </select>
              </div>
              <div className="field"><label htmlFor="until">Hasta</label><input id="until" name="until" type="date" required /></div>
              <div className="field">
                <label htmlFor="approver">Aprueba</label>
                <select id="approver" name="approver">{allStaff().filter((p) => p.roles.includes("director")).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </div>
            </div>
            <button className="btn">Activar suplencia</button>
          </form>
        )}
      </section>
    </main>
  );
}
