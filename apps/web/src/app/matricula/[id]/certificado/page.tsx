import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatRut, parseRut, WITHDRAWAL_LABEL } from "@insedu/domain";
import { PrintButton } from "@/components/PrintButton";
import { courseById, fullName, school, studentById } from "@/lib/demo";
import { canManageEnrollment, enrollmentOf } from "@/lib/matricula";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";

export const metadata = { title: "Certificado de baja de matrícula" };
export const dynamic = "force-dynamic";

const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("es-CL", { dateStyle: "long", timeZone: "UTC" });

/** Certificado que acredita el retiro y su fecha (Circular, 5.4). Su entrega no depende de ningún pago. */
export default async function WithdrawalCertificate({ params }: { params: Promise<{ id: string }> }) {
  await readState();
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=/matricula/${id}/certificado`);
  if (!canManageEnrollment(session)) redirect("/matricula");
  const student = studentById(id);
  const record = enrollmentOf(id);
  if (!student || !record) notFound();
  if (!record.withdrawal) redirect(`/matricula/${id}`);
  const s = school();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

  return (
    <main className="wrap certificate" style={{ maxWidth: 720 }}>
      <p className="no-print"><Link href={`/matricula/${id}`} className="muted">← Ficha de matrícula</Link></p>
      <p className="muted">{s.name} · RBD {s.rbd}</p>
      <h1>Certificado de baja de matrícula</h1>
      <p>Se certifica que <strong>{fullName(student)}</strong>, {record.document} <strong>{parseRut(student.rut) ? formatRut(student.rut) : student.rut}</strong>, matriculado/a con el número {record.number} de {record.level}, curso {courseById(student.courseId)?.name}, fue dado/a de baja del registro general de matrícula de este establecimiento con fecha <strong>{longDate(record.withdrawal.date)}</strong>.</p>
      <p>Motivo: {WITHDRAWAL_LABEL[record.withdrawal.reason]}.</p>
      <p>Se extiende el presente certificado para los fines que estime conveniente, con fecha {longDate(today)}.</p>
      <div className="signature-line"><span>Dirección del establecimiento</span></div>
      {process.env.INSEDU_DATA_MODE !== "real" && <p className="notice">Demostración: documento con datos ficticios, sin validez.</p>}
      <p className="no-print"><PrintButton /></p>
    </main>
  );
}
