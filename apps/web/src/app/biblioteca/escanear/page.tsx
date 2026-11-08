import Link from "next/link";
import { redirect } from "next/navigation";
import { canManageLibrary } from "@/lib/biblioteca";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { LibraryScanner } from "./LibraryScanner";

export const metadata = { title: "Escanear material" };
export const dynamic = "force-dynamic";

export default async function ScanLibrary() {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/biblioteca/escanear");
  return (
    <main className="wrap" style={{ maxWidth: 640 }}>
      <Link href="/biblioteca" className="muted">← Biblioteca</Link>
      <h1 style={{ marginTop: 8 }}>Escanear material</h1>
      <p>{canManageLibrary(session) ? "Apunte la cámara al código de barras. Si el material ya está en el catálogo abrimos su ficha; si es nuevo, usted completa sus datos." : "Apunte la cámara al código de barras para ver si el material está disponible."}</p>
      <LibraryScanner />
    </main>
  );
}
