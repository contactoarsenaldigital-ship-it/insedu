import Link from "next/link";
import { redirect } from "next/navigation";
import { formatLibraryCode, readLibraryCode } from "@insedu/domain";
import { canManageLibrary, itemByCode } from "@/lib/biblioteca";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { addItem } from "../actions";
import { ItemFields } from "../ItemFields";

export const metadata = { title: "Agregar material" };
export const dynamic = "force-dynamic";

export default async function NewItem({ searchParams }: { searchParams: Promise<{ codigo?: string; error?: string }> }) {
  await readState();
  const session = await getSession();
  const sp = await searchParams;
  if (!session) redirect("/ingresar?next=/biblioteca");
  const read = sp.codigo ? readLibraryCode(sp.codigo) : null;
  const existing = read && itemByCode(read.code);
  if (existing) redirect(`/biblioteca/${existing.id}`);
  if (!canManageLibrary(session)) {
    return (
      <main className="wrap" style={{ maxWidth: 640 }}>
        <Link href="/biblioteca" className="muted">← Biblioteca</Link>
        <h1 style={{ marginTop: 8 }}>Material no encontrado</h1>
        <p className="notice">Ese código no está en el catálogo. Consulte en biblioteca.</p>
        <p><Link className="btn" href="/biblioteca/escanear">Escanear otro</Link></p>
      </main>
    );
  }
  return (
    <main className="wrap" style={{ maxWidth: 720 }}>
      <Link href="/biblioteca" className="muted">← Biblioteca</Link>
      <h1 style={{ marginTop: 8 }}>Agregar material</h1>
      {read ? <p className="notice ok" role="status">Código leído: <strong>{formatLibraryCode(read.code)}</strong>. No está en el catálogo: complete sus datos.</p> : <p>Para material sin código de barras, como un video o un set didáctico.</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}
      <form action={addItem} className="card section">
        <ItemFields code={read?.code} kind={read?.type === "issn" ? "revista" : undefined} />
        <div className="field" style={{ maxWidth: 220 }}><label htmlFor="copies">Cantidad de ejemplares</label><input id="copies" name="copies" inputMode="numeric" pattern="\d{1,3}" maxLength={3} required defaultValue="1" /></div>
        <button className="btn primary">Agregar al catálogo</button>
      </form>
    </main>
  );
}
