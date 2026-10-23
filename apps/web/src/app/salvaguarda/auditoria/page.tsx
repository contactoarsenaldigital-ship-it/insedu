import Link from "next/link";
import { redirect } from "next/navigation";
import { ROLE_LABEL, protocolById } from "@insedu/domain";
import { isVaultDenied } from "@insedu/domain/server";
import { school } from "@/lib/demo";
import { fmtDT, studentLabel, who } from "@/lib/format";
import { getSession } from "@/lib/session";
import { STAFF } from "@/lib/store";
import { actorOf, vault, vaultService } from "@/lib/vault";
import { requestBreakGlass } from "../actions";
import { readState } from "@/lib/state";

export const metadata = { title: "Auditoría de Salvaguarda" };
export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  open: "Apertura",
  export: "Exportación",
  deposit: "Antecedente entregado",
  break_glass: "Acceso de emergencia",
  designation: "Designación o suplencia",
  denied: "Intento denegado",
  protocol: "Protocolo activado",
  instruction: "Instrucción emitida",
};

function basisLabel(basis?: string): string | undefined {
  if (!basis) return undefined;
  if (basis === "titular") return "Titular";
  if (basis === "suplencia_activa") return "Suplente en ejercicio";
  if (basis === "deposito_sin_lectura") return "Depósito sin lectura";
  if (basis === "revision_deposito") return "Revisión de antecedente";
  if (basis === "fin_suplencia") return "Fin de suplencia";
  if (basis.startsWith("break_glass") || basis.startsWith("grant:")) return "Autorización de emergencia";
  if (basis.startsWith("suplencia:")) return `Suplencia de ${who(basis.slice(10))}`;
  if (protocolById(basis)) return protocolById(basis)!.name;
  if (basis in ROLE_LABEL) return `Para ${ROLE_LABEL[basis as keyof typeof ROLE_LABEL]}`;
  return basis;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await readState();
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/salvaguarda/auditoria");
  const v = await vaultService();
  const actor = actorOf(session);
  let log;
  try {
    log = v.audit(actor);
  } catch (e) {
    if (!isVaultDenied(e)) throw e;
    return <main className="wrap"><h1>Sin acceso</h1><p className="notice warn">La auditoría es para dirección y para el Encargado de Salvaguarda.</p></main>;
  }
  const isDirector = session.person.roles.includes("director");
  const raw = v.rawView(actor.tenantId).slice(0, 3);
  const now = Date.now();
  const grants = vault().store.grants(actor.tenantId).filter((g) => g.grantedTo === session.person.id && new Date(g.expiresAt).getTime() > now);
  const cases = vault().store.cases(actor.tenantId).map(({ sealed: _s, ...m }) => m);

  return (
    <main className="wrap">
      <Link href="/salvaguarda" className="muted">← Salvaguarda</Link>
      <h1>Auditoría de accesos</h1>
      <p>Muestra quién accedió, cuándo, con qué fundamento y motivo. Nunca muestra el contenido del expediente. El registro no se puede modificar.</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}

      <div className="table-scroll section">
        <table className="data">
          <thead><tr><th>Fecha</th><th>Persona</th><th>Acción</th><th>Estudiante</th><th>Fundamento / motivo</th></tr></thead>
          <tbody>
            {log.map((e) => (
              <tr key={e.id}>
                <td>{fmtDT(e.at)}</td>
                <td>{who(e.actorId)}</td>
                <td><span className={`tag ${e.action === "denied" || e.action === "break_glass" ? "alta" : "media"}`}>{ACTION_LABEL[e.action] ?? e.action}</span></td>
                <td>{e.studentId ? studentLabel(e.studentId) : "—"}</td>
                <td className="muted">{[basisLabel(e.basis), e.reason].filter(Boolean).join(" · ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="section">
        <h2>Así ve el expediente un administrador técnico</h2>
        <p className="muted">Quien opera la base de datos solo ve contenido cifrado (AES-256-GCM, llave por establecimiento).</p>
        {raw.map((r) => (
          <pre key={r.id} className="cipher">{`caso ${r.id.slice(0, 8)}… · llave: ${r.keyProvider}\n${r.ciphertext.slice(0, 180)}…`}</pre>
        ))}
      </section>

      {isDirector && (
        <section className="section">
          <h2>Acceso de emergencia</h2>
          {grants.map((g) => (
            <div key={g.id} className="card" style={{ marginBottom: 8 }}>
              <span className="eyebrow">Vigente hasta {fmtDT(g.expiresAt)}</span>
              <strong>{studentLabel(g.studentId)}</strong>
              {cases.filter((c) => c.studentId === g.studentId).map((c) => (
                <Link key={c.id} href={`/salvaguarda/caso/${c.id}`}>Abrir caso (solo lectura)</Link>
              ))}
              {!cases.some((c) => c.studentId === g.studentId) && <span className="muted">El estudiante no tiene casos en el expediente.</span>}
            </div>
          ))}
          <p className="notice warn">
            Solo ante riesgo inminente para la vida o integridad de un estudiante, u obligación legal, y cuando el Encargado de
            Salvaguarda no esté disponible. Un estudiante, máximo 4 horas, solo lectura, con alerta y revisión posterior.
          </p>
          <form action={requestBreakGlass} className="card">
            <div className="grid">
              <div className="field">
                <label htmlFor="studentId">Estudiante</label>
                <select id="studentId" name="studentId" required defaultValue="">
                  <option value="" disabled>Seleccione…</option>
                  {school().students.map((s) => <option key={s.id} value={s.id}>{studentLabel(s.id)}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="reason">Fundamento</label>
                <select id="reason" name="reason"><option value="riesgo_inminente">Riesgo inminente</option><option value="obligacion_legal">Obligación legal</option></select>
              </div>
              <div className="field">
                <label htmlFor="hours">Duración</label>
                <select id="hours" name="hours"><option value="1">1 hora</option><option value="2">2 horas</option><option value="4">4 horas</option></select>
              </div>
              <div className="field">
                <label htmlFor="approver">Segunda aprobación</label>
                <select id="approver" name="approver">{STAFF.filter((p) => p.id !== session.person.id && (p.roles.includes("school_admin") || p.roles.includes("inspector"))).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.description}</option>)}</select>
              </div>
            </div>
            <div className="field"><label htmlFor="justification">Justificación</label><textarea id="justification" name="justification" rows={3} required minLength={20} /></div>
            <button className="btn primary">Solicitar acceso de emergencia</button>
          </form>
        </section>
      )}
    </main>
  );
}
