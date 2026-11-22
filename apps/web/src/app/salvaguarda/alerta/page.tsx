import Link from "next/link";
import { redirect } from "next/navigation";
import { ALERT_ROLES, DEPOSIT_ROLES } from "@insedu/domain";
import { ALERT_MAX_LENGTH } from "@insedu/domain/server";
import { activeStudents, courseById, school } from "@/lib/demo";
import { who } from "@/lib/format";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { vaultService } from "@/lib/vault";
import { sendAlert } from "../actions";

export const metadata = { title: "Alerta preventiva a Salvaguarda" };
export const dynamic = "force-dynamic";

/**
 * Alerta preventiva: docentes, profesores jefe, inspectoría y portería avisan a Salvaguarda lo que observaron.
 * Se cifra al enviarla y quien la envía no puede volver a leerla. No reemplaza el aviso en persona.
 */
export default async function AlertPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await readState();
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/salvaguarda/alerta");
  const allowed = session.person.roles.some((r) => ALERT_ROLES.includes(r) || DEPOSIT_ROLES.includes(r));
  const holder = (await vaultService()).holder(school().tenantId);
  const students = [...activeStudents()].sort((a, b) => a.courseId.localeCompare(b.courseId) || a.lastName.localeCompare(b.lastName, "es"));

  return (
    <main className="wrap" style={{ maxWidth: 720 }}>
      <span className="muted">Salvaguarda</span>
      <h1>Alerta preventiva</h1>
      <p>Avise a la Encargada de Salvaguarda lo que observó o le contaron sobre un estudiante. La alerta se cifra al enviarla: solo ella la lee, y usted no podrá volver a abrirla.</p>
      <div className="alert-banner" role="note">
        <strong>Si hay riesgo inminente, actúe antes de escribir.</strong> No deje solo al estudiante, llame al 131 si está en peligro y avise en persona a {holder ? who(holder) : "la Encargada de Salvaguarda"} o a dirección. Esta alerta deja el registro; no reemplaza ese aviso.
      </div>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}
      {!allowed ? (
        <p className="notice warn">Su perfil no envía alertas a Salvaguarda. Si observa una situación de riesgo, informe de inmediato a inspectoría o a dirección.</p>
      ) : (
        <form action={sendAlert} className="card section">
          <div className="field">
            <label htmlFor="studentId">Estudiante</label>
            <select id="studentId" name="studentId" required defaultValue="">
              <option value="" disabled>Seleccione…</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName} · {courseById(s.courseId)?.name}</option>)}
            </select>
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
            <legend style={{ fontWeight: 500, marginBottom: 6 }}>Urgencia</legend>
            <label className="check"><input type="radio" name="urgency" value="inminente" required /> Riesgo inminente: ya avisé en persona y el estudiante está acompañado</label>
            <label className="check"><input type="radio" name="urgency" value="preocupacion" /> Preocupación: señales que conviene revisar</label>
          </fieldset>
          <div className="field">
            <label htmlFor="text">Qué observó o le contaron</label>
            <textarea id="text" name="text" rows={5} required minLength={10} maxLength={ALERT_MAX_LENGTH} placeholder="Hechos, con fecha, hora y lugar. Las palabras del estudiante, si las dijo. Sin diagnósticos." />
            <span className="muted">Máximo {ALERT_MAX_LENGTH} caracteres. No escriba esto en anotaciones, comunicados ni mensajes a apoderados: esos registros los ve la familia.</span>
          </div>
          <button className="btn primary">Enviar alerta a Salvaguarda</button>
        </form>
      )}
      <p className="section"><Link href="/salvaguarda">← Salvaguarda</Link></p>
    </main>
  );
}
