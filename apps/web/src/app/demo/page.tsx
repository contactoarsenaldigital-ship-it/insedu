import { getSession } from "@/lib/session";
import { persistenceMode, readState } from "@/lib/state";
import { reset } from "./actions";

export const metadata = { title: "Administración de la demostración" };
export const dynamic = "force-dynamic";

export default async function DemoAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await readState();
  const sp = await searchParams;
  const s = await getSession();
  const allowed = s?.person.roles.some((r) => r === "school_admin" || r === "director");
  return (
    <main className="wrap" style={{ maxWidth: 640 }}>
      <h1>Administración de la demostración</h1>
      <p className="muted">Almacenamiento: <strong>{persistenceMode()}</strong>. Todos los datos son ficticios.</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}
      {allowed ? (
        <form action={reset} className="card">
          <h3>Reiniciar la demostración</h3>
          <p className="muted" style={{ margin: 0 }}>Borra clases, notas, anotaciones, canjes, mensajes y casos registrados, y vuelve a generar el colegio ficticio. Útil antes de cada presentación.</p>
          <div className="field">
            <label htmlFor="confirm">Escriba REINICIAR para confirmar</label>
            <input id="confirm" name="confirm" autoComplete="off" required />
          </div>
          <button className="btn primary">Reiniciar</button>
        </form>
      ) : (
        <p className="notice warn">Ingrese como Daniela Castro (administración) o Jorge Valenzuela (dirección) para reiniciar la demostración.</p>
      )}
    </main>
  );
}
