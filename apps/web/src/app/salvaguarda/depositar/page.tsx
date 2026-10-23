import Link from "next/link";
import { redirect } from "next/navigation";
import { DEPOSIT_ROLES } from "@insedu/domain";
import { school } from "@/lib/demo";
import { studentLabel } from "@/lib/format";
import { getSession } from "@/lib/session";
import { deposit } from "../actions";
import { readState } from "@/lib/state";

export const metadata = { title: "Entregar antecedente a Salvaguarda" };
export const dynamic = "force-dynamic";

const KINDS = [
  ["entrevista", "Entrevista"],
  ["derivacion", "Derivación"],
  ["revelacion", "Revelación del estudiante"],
  ["nota_seguimiento", "Nota de seguimiento"],
  ["documento", "Documento o antecedente externo"],
] as const;

export default async function DepositPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; s?: string }> }) {
  await readState();
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/salvaguarda/depositar");
  const allowed = session.person.roles.some((r) => DEPOSIT_ROLES.includes(r));
  return (
    <main className="wrap" style={{ maxWidth: 720 }}>
      <Link href="/salvaguarda" className="muted">← Salvaguarda</Link>
      <h1>Entregar un antecedente a Salvaguarda</h1>
      <p>
        Lo que escriba se cifra al enviarlo y solo lo lee el Encargado de Salvaguarda. Usted recibirá una confirmación de
        entrega, pero no podrá volver a abrirlo.
      </p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}
      {!allowed ? (
        <p className="notice warn">Su perfil no entrega antecedentes a Salvaguarda. Si observa una situación de riesgo, informe de inmediato a inspectoría o a la dirección.</p>
      ) : (
        <form action={deposit} className="card">
          <div className="grid">
            <div className="field">
              <label htmlFor="studentId">Estudiante</label>
              <select id="studentId" name="studentId" required defaultValue={sp.s ?? ""}>
                <option value="" disabled>Seleccione…</option>
                {school().students.map((s) => <option key={s.id} value={s.id}>{studentLabel(s.id)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="kind">Tipo</label>
              <select id="kind" name="kind" defaultValue={sp.s ? "derivacion" : "entrevista"}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="text">Antecedente</label>
            <textarea id="text" name="text" rows={6} required minLength={10} placeholder="Describa los hechos observados o relatados, con fecha y contexto." />
          </div>
          <button className="btn primary">Entregar a Salvaguarda</button>
        </form>
      )}
    </main>
  );
}
