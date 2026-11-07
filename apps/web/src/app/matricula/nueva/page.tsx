import Link from "next/link";
import { redirect } from "next/navigation";
import { canManageEnrollment } from "@/lib/matricula";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { createEnrollment } from "../actions";
import { EnrollmentFields } from "../EnrollmentFields";

export const metadata = { title: "Registrar alta" };
export const dynamic = "force-dynamic";

export default async function NewEnrollment({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/matricula/nueva");
  if (!canManageEnrollment(session)) redirect("/matricula");
  const { error } = await searchParams;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  return (
    <main className="wrap" style={{ maxWidth: 860 }}>
      <Link href="/matricula" className="muted">← Registro de matrícula</Link>
      <h1 style={{ marginTop: 8 }}>Registrar alta</h1>
      <p>Para traslados y estudiantes que se incorporan durante el año. Para muchos estudiantes, use la <Link href="/configuracion?tab=carga">carga masiva</Link>. Se pide el certificado de promoción y, si viene de otro establecimiento, el de traslado o baja.</p>
      {error && <p className="notice warn" role="alert">{error}</p>}
      <form action={createEnrollment} className="card">
        <EnrollmentFields today={today} />
        <button className="btn primary">Registrar alta</button>
      </form>
    </main>
  );
}
