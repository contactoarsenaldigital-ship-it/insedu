import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { COPY_CONDITION_LABEL, COPY_STATE_LABEL, copyState, defaultDueDate, formatLibraryCode, isOpenLoan, LIBRARY_KIND_LABEL, LIBRARY_MEDIUM_LABEL, LOAN_STATE_LABEL, loanState, type CopyCondition } from "@insedu/domain";
import { availabilityFor, borrowerGroup, borrowerGroups, borrowerName, canManageLibrary, copiesOf, itemById, libraryToday, loansOf } from "@/lib/biblioteca";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { addCopies, lendCopy, renewLoan, returnLoan, setCopyCondition, updateItem } from "../actions";
import { BorrowerPicker } from "../BorrowerPicker";
import { ItemFields } from "../ItemFields";

export const metadata = { title: "Ficha de material" };
export const dynamic = "force-dynamic";

const STATE_TAG = { disponible: "ok", prestado: "media", reparacion: "alta", perdido: "alta", baja: "" } as const;
const LOAN_TAG = { vigente: "ok", por_vencer: "media", atrasado: "alta", devuelto: "" } as const;

export default async function LibraryItem({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; nuevo?: string }> }) {
  await readState();
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=/biblioteca/${id}`);
  const item = itemById(id);
  if (!item) notFound();
  const sp = await searchParams;
  const manage = canManageLibrary(session);
  const copies = copiesOf(id);
  const loans = loansOf(id);
  const open = loans.filter(isOpenLoan).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const history = loans.filter((l) => !isOpenLoan(l)).sort((a, b) => b.loanedOn.localeCompare(a.loanedOn)).slice(0, 10);
  const a = availabilityFor(id);
  const today = libraryToday();
  const free = copies.filter((c) => copyState(c, loans) === "disponible");

  return (
    <main className="wrap" style={{ maxWidth: 900 }}>
      <Link href="/biblioteca" className="muted">← Biblioteca</Link>
      <h1 style={{ marginTop: 8 }}>{item.title}</h1>
      <p className="muted">{[item.author, LIBRARY_KIND_LABEL[item.kind], LIBRARY_MEDIUM_LABEL[item.medium], item.year].filter(Boolean).join(" · ")}</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}
      {sp.nuevo && <p><Link className="btn primary" href="/biblioteca/escanear">Escanear otro</Link></p>}

      <section className="card section">
        <p style={{ marginTop: 0 }}><span className={`tag ${a.available ? "ok" : "alta"}`}>{a.available ? `${a.available} disponible(s) de ${a.total}` : `Sin ejemplares disponibles de ${a.total}`}</span>{a.onLoan > 0 && <span className="muted"> · {a.onLoan} prestado(s)</span>}{a.unavailable > 0 && <span className="muted"> · {a.unavailable} en reparación</span>}</p>
        {!a.available && open[0] && <p>La próxima devolución está prevista para el <strong>{open[0].dueOn}</strong>.</p>}
        {item.code && <p><strong>Código:</strong> {formatLibraryCode(item.code)}</p>}
        {item.publisher && <p><strong>Editorial:</strong> {item.publisher}</p>}
        {item.category && <p><strong>Categoría:</strong> {item.category}</p>}
        {item.location && <p><strong>Ubicación:</strong> {item.location}</p>}
        {item.link && <p><a href={item.link} target="_blank" rel="noopener noreferrer">Abrir archivo digital</a></p>}
        {item.notes && <p style={{ marginBottom: 0 }}>{item.notes}</p>}
      </section>

      {manage && (
        <>
          <section className="section">
            <h2>Prestar</h2>
            {free.length === 0 ? <p className="muted">No hay ejemplares disponibles para prestar.</p> : (
              <form action={lendCopy} className="card">
                <input type="hidden" name="itemId" value={id} />
                <BorrowerPicker groups={borrowerGroups()} />
                <div className="form-grid">
                  <div className="field"><label htmlFor="copyId">Ejemplar</label><select id="copyId" name="copyId" defaultValue={free[0]!.id}>{free.map((c) => <option key={c.id} value={c.id}>N° {c.number}</option>)}</select></div>
                  <div className="field"><label htmlFor="dueOn">Devolver el</label><input id="dueOn" name="dueOn" type="date" required min={today} defaultValue={defaultDueDate(today, item.kind)} /></div>
                </div>
                <button className="btn primary">Registrar préstamo</button>
              </form>
            )}
          </section>

          <section className="section">
            <h2>Quién lo tiene</h2>
            {open.length === 0 ? <p className="muted">Ningún ejemplar prestado.</p> : (
              <div className="table-scroll">
                <table className="data">
                  <thead><tr><th>Ejemplar</th><th>Persona</th><th>Curso</th><th>Desde</th><th>Devolver el</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {open.map((l) => {
                      const state = loanState(l, today);
                      return (
                        <tr key={l.id}>
                          <td>N° {copies.find((c) => c.id === l.copyId)?.number}</td><td>{borrowerName(l.borrowerId)}</td><td>{borrowerGroup(l)}</td><td style={{ whiteSpace: "nowrap" }}>{l.loanedOn}</td><td style={{ whiteSpace: "nowrap" }}>{l.dueOn}</td>
                          <td><span className={`tag ${LOAN_TAG[state]}`}>{LOAN_STATE_LABEL[state]}</span></td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <form action={returnLoan} style={{ display: "inline" }}><input type="hidden" name="loanId" value={l.id} /><button className="btn small">Devolver</button></form>{" "}
                            <form action={renewLoan} style={{ display: "inline" }}><input type="hidden" name="loanId" value={l.id} /><button className="btn secondary small">Renovar</button></form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="section">
            <h2>Ejemplares</h2>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>N°</th><th>Situación</th><th>Observación</th><th>Cambiar estado</th></tr></thead>
                <tbody>
                  {copies.map((c) => {
                    const state = copyState(c, loans);
                    return (
                      <tr key={c.id}>
                        <td>{c.number}</td><td><span className={`tag ${STATE_TAG[state]}`}>{COPY_STATE_LABEL[state]}</span></td><td>{c.note ?? "—"}</td>
                        <td>
                          <form action={setCopyCondition} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <input type="hidden" name="copyId" value={c.id} />
                            <select name="condition" defaultValue={c.condition} aria-label={`Estado del ejemplar ${c.number}`}>{(Object.keys(COPY_CONDITION_LABEL) as CopyCondition[]).map((k) => <option key={k} value={k}>{COPY_CONDITION_LABEL[k]}</option>)}</select>
                            <input name="note" maxLength={200} placeholder="Observación" aria-label={`Observación del ejemplar ${c.number}`} defaultValue={c.note} style={{ maxWidth: 180 }} />
                            <button className="btn secondary small">Guardar</button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <form action={addCopies} className="section" style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
              <input type="hidden" name="itemId" value={id} />
              <div className="field" style={{ margin: 0 }}><label htmlFor="copies">Agregar ejemplares</label><input id="copies" name="copies" inputMode="numeric" pattern="\d{1,3}" maxLength={3} required defaultValue="1" style={{ width: 100 }} /></div>
              <button className="btn secondary">Agregar</button>
            </form>
          </section>

          {history.length > 0 && (
            <section className="section">
              <h2>Últimas devoluciones</h2>
              <div className="table-scroll">
                <table className="data">
                  <thead><tr><th>Persona</th><th>Curso</th><th>Desde</th><th>Devuelto</th><th>Observación</th></tr></thead>
                  <tbody>{history.map((l) => <tr key={l.id}><td>{borrowerName(l.borrowerId)}</td><td>{borrowerGroup(l)}</td><td>{l.loanedOn}</td><td>{l.returnedOn}</td><td>{l.returnNote ?? "—"}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}

          <details className="card section">
            <summary><strong>Corregir datos del título</strong></summary>
            <form action={updateItem} style={{ marginTop: 12 }}>
              <input type="hidden" name="itemId" value={id} />
              <ItemFields item={item} />
              <button className="btn primary">Guardar cambios</button>
            </form>
          </details>
        </>
      )}
    </main>
  );
}
