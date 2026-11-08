import Link from "next/link";
import { redirect } from "next/navigation";
import { daysLate, isOpenLoan, LOAN_STATE_LABEL, loanState } from "@insedu/domain";
import { DownloadLinks } from "@/components/DownloadLinks";
import { borrowerGroup, borrowerName, canManageLibrary, itemById, libraryToday } from "@/lib/biblioteca";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { libraryState } from "@/lib/store";
import { renewLoan, returnLoan } from "../actions";

export const metadata = { title: "Préstamos de biblioteca" };
export const dynamic = "force-dynamic";

const TAG = { vigente: "ok", por_vencer: "media", atrasado: "alta", devuelto: "" } as const;
const VIEWS = [["abiertos", "Abiertos"], ["atrasados", "Atrasados"], ["historial", "Devueltos"]] as const;

export default async function Loans({ searchParams }: { searchParams: Promise<{ ver?: string; ok?: string; error?: string }> }) {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/biblioteca/prestamos");
  if (!canManageLibrary(session)) redirect("/biblioteca");
  const sp = await searchParams;
  const today = libraryToday();
  const ver = VIEWS.some(([k]) => k === sp.ver) ? sp.ver! : "abiertos";
  const { loans, copies } = libraryState();
  const open = loans.filter(isOpenLoan);
  const overdue = open.filter((l) => loanState(l, today) === "atrasado");
  const closed = loans.filter((l) => !isOpenLoan(l));
  const rows = (ver === "atrasados" ? overdue : ver === "historial" ? closed : open).slice().sort((a, b) => (ver === "historial" ? (b.returnedOn ?? "").localeCompare(a.returnedOn ?? "") : a.dueOn.localeCompare(b.dueOn)));
  const count = { abiertos: open.length, atrasados: overdue.length, historial: closed.length };

  return (
    <main className="wrap">
      <Link href="/biblioteca" className="muted">← Biblioteca</Link>
      <h1 style={{ marginTop: 8 }}>Préstamos</h1>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}
      <nav className="tabs" aria-label="Préstamos">
        {VIEWS.map(([k, label]) => <Link key={k} href={`/biblioteca/prestamos?ver=${k}`} aria-current={ver === k ? "page" : undefined}>{label}<span className="count">{count[k]}</span></Link>)}
      </nav>
      <p style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <DownloadLinks tipo="biblioteca_prestamos" caption="Préstamos" />
        <DownloadLinks tipo="biblioteca_inventario" caption="Inventario" />
      </p>
      {rows.length === 0 ? <p className="muted">No hay préstamos en esta vista.</p> : (
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Material</th><th>Ej.</th><th>Persona</th><th>Curso</th><th>Desde</th><th>{ver === "historial" ? "Devuelto" : "Devolver el"}</th><th>Estado</th>{ver !== "historial" && <th></th>}</tr></thead>
            <tbody>
              {rows.map((l) => {
                const state = loanState(l, today);
                const late = daysLate(l, today);
                return (
                  <tr key={l.id}>
                    <td><Link href={`/biblioteca/${l.itemId}`}>{itemById(l.itemId)?.title}</Link></td>
                    <td>{copies.find((c) => c.id === l.copyId)?.number}</td><td>{borrowerName(l.borrowerId)}</td><td>{borrowerGroup(l)}</td><td style={{ whiteSpace: "nowrap" }}>{l.loanedOn}</td><td style={{ whiteSpace: "nowrap" }}>{l.returnedOn ?? l.dueOn}</td>
                    <td style={{ whiteSpace: "nowrap" }}><span className={`tag ${TAG[state]}`}>{LOAN_STATE_LABEL[state]}{late ? ` · ${late} día(s)` : ""}</span></td>
                    {ver !== "historial" && (
                      <td style={{ whiteSpace: "nowrap" }}>
                        <form action={returnLoan} style={{ display: "inline" }}><input type="hidden" name="loanId" value={l.id} /><input type="hidden" name="from" value="prestamos" /><button className="btn small">Devolver</button></form>{" "}
                        <form action={renewLoan} style={{ display: "inline" }}><input type="hidden" name="loanId" value={l.id} /><input type="hidden" name="from" value="prestamos" /><button className="btn secondary small">Renovar</button></form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
