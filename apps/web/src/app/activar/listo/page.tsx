import Link from "next/link";
import { redirect } from "next/navigation";
import { accountById } from "@/lib/accounts";
import { getSession } from "@/lib/session";
import { readState, saveState } from "@/lib/state";

export const metadata = { title: "Cuenta activada" };
export const dynamic = "force-dynamic";

/** Muestra los códigos de recuperación una sola vez, justo después de activar la cuenta. */
export default async function Activated() {
  await readState();
  const session = await getSession();
  const a = session?.accountId ? accountById(session.accountId) : undefined;
  if (!a) redirect("/ingresar");
  const codes = a.revealRecovery;
  if (codes) {
    a.revealRecovery = undefined;
    await saveState();
  }
  return (
    <main className="wrap" style={{ maxWidth: 640 }}>
      <h1>Su cuenta está activa</h1>
      {codes ? (
        <section className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Guarde sus códigos de recuperación</h2>
          <p>Si pierde su teléfono o no recibe el código, puede ingresar con uno de estos códigos. Cada uno sirve una sola vez. <strong>Esta es la única vez que se muestran:</strong> anótelos o imprímalos y guárdelos en un lugar seguro.</p>
          <ul className="recovery-codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
        </section>
      ) : (
        <p className="notice">Sus códigos de recuperación ya se mostraron. Si los perdió, pida a administración que restablezca su acceso.</p>
      )}
      <p className="section"><Link className="btn primary" href="/">Comenzar a usar INSEDU</Link></p>
    </main>
  );
}
