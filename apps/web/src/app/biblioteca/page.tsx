import Link from "next/link";
import { redirect } from "next/navigation";
import { formatLibraryCode, LIBRARY_KIND_LABEL, LOAN_STATE_LABEL, loanState, searchLibrary, type LibraryKind } from "@insedu/domain";
import { availabilityFor, borrowerName, canManageLibrary, itemById, libraryItems, libraryStats, libraryToday, ownLoans } from "@/lib/biblioteca";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";

export const metadata = { title: "Biblioteca" };
export const dynamic = "force-dynamic";

const PAGE = 60;
const TAG = { vigente: "ok", por_vencer: "media", atrasado: "alta", devuelto: "" } as const;

export default async function Library({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string; ok?: string; error?: string }> }) {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/biblioteca");
  const sp = await searchParams;
  const manage = canManageLibrary(session);
  const q = (sp.q ?? "").slice(0, 120);
  const tipo = sp.tipo && sp.tipo in LIBRARY_KIND_LABEL ? (sp.tipo as LibraryKind) : undefined;
  const results = searchLibrary(libraryItems(), q, tipo);
  const today = libraryToday();
  const stats = libraryStats(today);
  const mine = ownLoans(session);
  const forWard = session.person.roles.includes("guardian_academic");
  const showStudent = forWard && (session.person.wards?.length ?? 0) > 1;

  return (
    <main className="wrap">
      <h1>Biblioteca</h1>
      <p>Busque por título, autor o ISBN y vea al instante cuántos ejemplares quedan disponibles.</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}

      {manage && (
        <>
          <div className="grid section" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
            {[["Títulos", stats.titles], ["Ejemplares", stats.total], ["Disponibles", stats.available], ["Prestados", stats.onLoan], ["Atrasados", stats.overdue]].map(([label, value]) => (
              <div className="card" key={label as string} style={{ padding: 14 }}><strong style={{ fontSize: "1.6rem" }}>{value}</strong><br /><span className="muted">{label}</span></div>
            ))}
          </div>
          <p className="section" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="btn primary" href="/biblioteca/escanear">Escanear código</Link>
            <Link className="btn secondary" href="/biblioteca/nuevo">Agregar sin código</Link>
            <Link className="btn secondary" href="/biblioteca/prestamos">Ver préstamos</Link>
          </p>
        </>
      )}

      {mine.length > 0 && (
        <section className="section">
          <h2>{forWard ? "Préstamos de su pupilo" : "Mis préstamos"}</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Material</th>{showStudent && <th>Estudiante</th>}<th>Devolver el</th><th>Estado</th></tr></thead>
              <tbody>
                {mine.map((l) => {
                  const state = loanState(l, today);
                  return <tr key={l.id}><td><Link href={`/biblioteca/${l.itemId}`}>{itemById(l.itemId)?.title}</Link></td>{showStudent && <td>{borrowerName(l.borrowerId)}</td>}<td style={{ whiteSpace: "nowrap" }}>{l.dueOn}</td><td><span className={`tag ${TAG[state]}`}>{LOAN_STATE_LABEL[state]}</span></td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="section">
        <h2>Catálogo</h2>
        <form action="/biblioteca" className="card" role="search">
          <div className="form-grid">
            <div className="field"><label htmlFor="q">Título, autor o ISBN</label><input id="q" name="q" type="search" defaultValue={q} maxLength={120} autoComplete="off" /></div>
            <div className="field">
              <label htmlFor="tipo">Tipo</label>
              <select id="tipo" name="tipo" defaultValue={tipo ?? ""}><option value="">Todos</option>{(Object.keys(LIBRARY_KIND_LABEL) as LibraryKind[]).map((k) => <option key={k} value={k}>{LIBRARY_KIND_LABEL[k]}</option>)}</select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary">Buscar</button>
            {!manage && <Link className="btn secondary" href="/biblioteca/escanear">Escanear código</Link>}
          </div>
        </form>
        <p className="muted" aria-live="polite" style={{ marginTop: 12 }}>{results.length} resultado(s){results.length > PAGE ? `. Se muestran los primeros ${PAGE}: afine la búsqueda.` : "."}</p>
        {results.length > 0 && (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Título</th><th>Autor</th><th>Tipo</th><th>Código</th><th>Disponibles</th><th>Ubicación</th></tr></thead>
              <tbody>
                {results.slice(0, PAGE).map((i) => {
                  const a = availabilityFor(i.id);
                  return (
                    <tr key={i.id}>
                      <td><Link href={`/biblioteca/${i.id}`}>{i.title}</Link></td>
                      <td>{i.author ?? "—"}</td>
                      <td>{LIBRARY_KIND_LABEL[i.kind]}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{formatLibraryCode(i.code) || "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}><span className={`tag ${a.available ? "ok" : "alta"}`}>{a.available} de {a.total}</span></td>
                      <td>{i.location ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
