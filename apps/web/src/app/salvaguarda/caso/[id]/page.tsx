import Link from "next/link";
import { redirect } from "next/navigation";
import { PROTOCOLS, ROLE_LABEL, STRONG_AUTH_WINDOW_MS, formatRut, protocolById, type Role } from "@insedu/domain";
import { isVaultDenied, VaultService } from "@insedu/domain/server";
import { studentById } from "@/lib/demo";
import { fmtDT, studentLabel, who } from "@/lib/format";
import { issuedFor } from "@/lib/instructions";
import { getSession } from "@/lib/session";
import { actorOf, vault, vaultService } from "@/lib/vault";
import { activateProtocol, addCaseNote, completeProtocol, issueInstruction, setCaseStatus } from "../../actions";
import { readState, saveState } from "@/lib/state";

export const metadata = { title: "Caso confidencial" };
export const dynamic = "force-dynamic";

const REASONS = ["Seguimiento del caso", "Activación de protocolo", "Coordinación con la red de apoyo", "Revisión de antecedentes recibidos", "Requerimiento de autoridad competente"];
const TARGET_ROLES: Role[] = ["head_teacher", "teacher", "inspector", "nurse", "counselor"];

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ motivo?: string; ok?: string; error?: string }> }) {
  await readState();
  const { id } = await params;
  const sp = await searchParams;
  const here = `/salvaguarda/caso/${id}`;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=${encodeURIComponent(here)}`);
  const fresh = session.lastStrongAuthAt && Date.now() - new Date(session.lastStrongAuthAt).getTime() <= STRONG_AUTH_WINDOW_MS;
  if (!fresh) redirect(`/verificar?next=${encodeURIComponent(here + (sp.motivo ? `?motivo=${encodeURIComponent(sp.motivo)}` : ""))}`);

  if (!sp.motivo) {
    return (
      <main className="wrap" style={{ maxWidth: 560 }}>
        <Link href="/salvaguarda" className="muted">← Salvaguarda</Link>
        <h1>Motivo de la consulta</h1>
        <p>Cada apertura del expediente queda registrada con su motivo en el log de accesos.</p>
        <form method="get" className="card">
          <div className="field">
            <label htmlFor="motivo">Motivo</label>
            <select id="motivo" name="motivo">{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          </div>
          <button className="btn primary">Abrir expediente</button>
        </form>
      </main>
    );
  }

  const v = await vaultService();
  const actor = actorOf(session);
  let data;
  try {
    data = await v.readCase(actor, id, sp.motivo);
    await saveState(); // el acceso queda en el log persistente
  } catch (e) {
    if (!isVaultDenied(e)) throw e;
    await saveState(); // también el intento denegado
    return (
      <main className="wrap" style={{ maxWidth: 640 }}>
        <h1>Acceso denegado</h1>
        <p className="notice warn">{e.reason}. El intento quedó registrado en la auditoría.</p>
        <Link className="btn" href="/salvaguarda">Volver</Link>
      </main>
    );
  }

  const { meta, content, basis } = data;
  const emergency = basis.startsWith("break_glass");
  const student = studentById(meta.studentId);
  const activations = vault().store.protocols(actor.tenantId).filter((p) => p.caseId === id);
  const instructions = issuedFor(meta.studentId);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const in14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);

  return (
    <main className="wrap" style={{ maxWidth: 960 }}>
      <Link href="/salvaguarda" className="muted">← Salvaguarda</Link>
      <span className="eyebrow" style={{ display: "block", marginTop: 8 }}>Confidencial · motivo: {sp.motivo}</span>
      <h1>{content.title}</h1>
      <p className="muted">
        {studentLabel(meta.studentId)}{student && ` · ${formatRut(student.rut)}`} · abierto {fmtDT(meta.openedAt)} · estado: {meta.status}
      </p>
      {emergency && <p className="notice warn">Acceso de emergencia: solo lectura, sin exportación, revisión posterior obligatoria.</p>}
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}

      <section className="section">
        <h2>Registro del caso</h2>
        <ol className="timeline">
          {content.entries.map((e, i) => (
            <li key={i}>
              <span className="eyebrow">{fmtDT(e.at)} · {who(e.by)}{e.kind === "deposito" ? " · antecedente entregado" : e.kind === "sistema" ? " · sistema" : ""}</span>
              <p style={{ margin: 0 }}>{e.text}</p>
            </li>
          ))}
          {!content.entries.length && <li className="muted">Sin registros.</li>}
        </ol>
        {!emergency && (
          <form action={addCaseNote} className="card">
            <input type="hidden" name="caseId" value={id} />
            <div className="field"><label htmlFor="text">Nueva nota</label><textarea id="text" name="text" rows={3} required minLength={5} /></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn">Agregar nota</button>
            </div>
          </form>
        )}
      </section>

      {!emergency && (
        <>
          <section className="section">
            <h2>Protocolos</h2>
            {activations.map((p) => {
              const def = protocolById(p.protocolId);
              const late = VaultService.overdue(p, new Date());
              return (
                <div key={p.id} className="card" style={{ marginBottom: 12 }}>
                  <span className="eyebrow">{def?.legalBasis} · activado {fmtDT(p.activatedAt)}</span>
                  <h3>{def?.name}</h3>
                  {p.completedAt ? (
                    <span className="tag ok">✓ {def?.dueAction}: {p.completedTo}{p.reference ? ` · ${p.reference}` : ""} · {fmtDT(p.completedAt)}</span>
                  ) : (
                    <>
                      <span className={`tag ${late ? "alta" : "media"}`}>{def?.dueAction} · {late ? "vencido" : "vence"} {p.dueAt ? fmtDT(p.dueAt) : ""}</span>
                      <form action={completeProtocol} className="inline-form" style={{ marginTop: 8 }}>
                        <input type="hidden" name="caseId" value={id} />
                        <input type="hidden" name="activationId" value={p.id} />
                        <select name="to" aria-label="Organismo">{(def?.reportTo ?? ["Otro"]).map((o) => <option key={o}>{o}</option>)}</select>
                        <input name="reference" placeholder="Folio o número de causa (opcional)" aria-label="Folio" />
                        <button className="btn small">Registrar cumplimiento</button>
                      </form>
                    </>
                  )}
                </div>
              );
            })}
            <form action={activateProtocol} className="inline-form card">
              <input type="hidden" name="caseId" value={id} />
              <select name="protocolId" aria-label="Protocolo">
                {PROTOCOLS.map((p) => <option key={p.id} value={p.id}>{p.name}{p.dueHours ? ` (${p.dueHours} h)` : ""}</option>)}
              </select>
              <button className="btn primary small">Activar protocolo</button>
            </form>
            <p className="muted">Plazos por defecto ajustables al Reglamento Interno. El deber de denuncia de delitos es de 24 horas (CPP arts. 175 y 176).</p>
          </section>

          <section className="section">
            <h2>Instrucción mínima de protección</h2>
            <p className="muted">El destinatario verá solo la acción, la vigencia y el canal de retorno: nunca diagnóstico ni relato.</p>
            {instructions.map((i) => (
              <div key={i.id} className="card" style={{ marginBottom: 8 }}>
                <span className="eyebrow">Para {ROLE_LABEL[i.targetRole]} · hasta {i.validUntil}</span>
                <span>{i.action}</span>
                <span className={`tag ${i.acknowledgedAt ? "ok" : "media"}`}>{i.acknowledgedAt ? `Recibida por ${who(i.acknowledgedBy!)} · ${fmtDT(i.acknowledgedAt)}` : "Pendiente de acuse"}</span>
              </div>
            ))}
            <form action={issueInstruction} className="card">
              <input type="hidden" name="caseId" value={id} />
              <input type="hidden" name="studentId" value={meta.studentId} />
              <div className="field">
                <label htmlFor="action">Acción a realizar</label>
                <input id="action" name="action" required minLength={10} maxLength={280} placeholder="Permitir salida de sala sin pedir explicación y avisar a inspectoría" />
              </div>
              <div className="grid">
                <div className="field">
                  <label htmlFor="targetRole">Destinatario</label>
                  <select id="targetRole" name="targetRole">{TARGET_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
                </div>
                <div className="field"><label htmlFor="validUntil">Vigente hasta</label><input id="validUntil" name="validUntil" type="date" min={today} defaultValue={in14} required /></div>
                <div className="field"><label htmlFor="returnChannel">Canal de retorno</label><input id="returnChannel" name="returnChannel" defaultValue="Mensaje interno a Salvaguarda" required /></div>
              </div>
              <button className="btn">Emitir instrucción</button>
            </form>
          </section>

          <section className="section">
            <h2>Estado del caso</h2>
            <form action={setCaseStatus} className="inline-form card">
              <input type="hidden" name="caseId" value={id} />
              <select name="status" defaultValue={meta.status} aria-label="Estado">
                <option value="abierto">Abierto</option><option value="seguimiento">Seguimiento</option><option value="cerrado">Cerrado</option>
              </select>
              <button className="btn secondary small">Actualizar estado</button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
