import Link from "next/link";
import { redirect } from "next/navigation";
import { formatRut, type Role } from "@insedu/domain";
import { courseById, fullName, school, studentById } from "@/lib/demo";
import { fmtDate, fmtDT, studentLabel, who } from "@/lib/format";
import { bmi, profile, visitsOf } from "@/lib/health";
import { getSession } from "@/lib/session";
import { addVisit, updateProfile } from "./actions";
import { readState } from "@/lib/state";

export const metadata = { title: "Salud integral" };
export const dynamic = "force-dynamic";

const READERS: Role[] = ["nurse", "psychologist", "counselor", "safeguarding_lead"];

export default async function HealthPage({ searchParams }: { searchParams: Promise<{ s?: string; ok?: string; error?: string }> }) {
  await readState();
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/salud");
  if (!session.person.roles.some((r) => READERS.includes(r))) {
    return (
      <main className="wrap" style={{ maxWidth: 720 }}>
        <h1>Salud integral</h1>
        <p className="notice warn">La ficha de salud es visible para enfermería y los profesionales de apoyo. Los docentes reciben solo las instrucciones de protección que les correspondan.</p>
      </main>
    );
  }
  const isNurse = session.person.roles.includes("nurse");
  const st = sp.s ? studentById(sp.s) : undefined;
  const recent = [...school().health].sort((a, b) => (b.at ?? b.date).localeCompare(a.at ?? a.date)).slice(0, 8);

  return (
    <main className="wrap">
      <span className="muted">Salud integral · {session.person.name}</span>
      <h1>Enfermería y salud escolar</h1>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}

      <form method="get" className="card inline-form" style={{ marginTop: 12 }}>
        <label htmlFor="s" style={{ fontWeight: 500 }}>Estudiante</label>
        <select id="s" name="s" defaultValue={st?.id ?? ""} style={{ flex: 1, minWidth: 240 }}>
          <option value="" disabled>Seleccione…</option>
          {school().courses.map((c) => (
            <optgroup key={c.id} label={c.name}>
              {school().students.filter((x) => x.courseId === c.id).sort((a, b) => a.lastName.localeCompare(b.lastName, "es")).map((x) => (
                <option key={x.id} value={x.id}>{x.lastName}, {x.firstName}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button className="btn">Abrir ficha</button>
      </form>

      {!st && (
        <section className="section">
          <h2>Últimas atenciones</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Fecha</th><th>Estudiante</th><th>Motivo</th><th>Retiro</th></tr></thead>
              <tbody>
                {recent.map((h) => (
                  <tr key={h.id}>
                    <td>{h.at ? fmtDT(h.at) : fmtDate(h.date)}</td>
                    <td><Link href={`/salud?s=${h.studentId}`}>{studentLabel(h.studentId)}</Link></td>
                    <td>{h.reason}</td>
                    <td>{h.sentHome ? "Sí" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {st && <StudentHealth studentId={st.id} isNurse={isNurse} />}
    </main>
  );
}

function StudentHealth({ studentId, isNurse }: { studentId: string; isNurse: boolean }) {
  const st = studentById(studentId)!;
  const p = profile(studentId);
  const visits = visitsOf(studentId);
  const imc = bmi(p);
  const last30 = visits.filter((v) => (v.at ?? v.date) >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).length;
  return (
    <>
      <section className="section">
        <h2>{fullName(st)}</h2>
        <p className="muted">{courseById(st.courseId)?.name} · {formatRut(st.rut)} · ficha actualizada {fmtDT(p.updatedAt)} por {who(p.updatedBy)}</p>
        {last30 >= 3 && (
          <p className="notice warn">
            {last30} atenciones en los últimos 30 días. Si sospecha una causa no física, entregue el antecedente a Salvaguarda.
          </p>
        )}
        <form action={updateProfile} className="card">
          <input type="hidden" name="studentId" value={studentId} />
          <div className="grid">
            <div className="field"><label htmlFor="allergies">Alergias</label><input id="allergies" name="allergies" defaultValue={p.allergies} readOnly={!isNurse} /></div>
            <div className="field"><label htmlFor="restrictions">Restricciones para la actividad escolar</label><input id="restrictions" name="restrictions" defaultValue={p.restrictions} readOnly={!isNurse} /></div>
            <div className="field"><label htmlFor="emergencyContact">Contacto de emergencia</label><input id="emergencyContact" name="emergencyContact" defaultValue={p.emergencyContact} readOnly={!isNurse} /></div>
          </div>
          <div className="grid">
            <div className="field"><label htmlFor="heightCm">Estatura (cm)</label><input id="heightCm" name="heightCm" inputMode="decimal" defaultValue={p.heightCm ?? ""} readOnly={!isNurse} /></div>
            <div className="field"><label htmlFor="weightKg">Peso (kg)</label><input id="weightKg" name="weightKg" inputMode="decimal" defaultValue={p.weightKg ?? ""} readOnly={!isNurse} /></div>
            <div className="field">
              <label>IMC</label>
              <span className="kpi" style={{ fontSize: "1.4rem" }}>{imc ? imc.toFixed(1).replace(".", ",") : "—"}</span>
              <span className="muted">Solo para enfermería. Nunca se muestra al estudiante ni se usa en desafíos.</span>
            </div>
          </div>
          {isNurse && <button className="btn">Guardar ficha</button>}
        </form>
      </section>

      {isNurse && (
        <section className="section">
          <h2>Registrar atención</h2>
          <form action={addVisit} className="card">
            <input type="hidden" name="studentId" value={studentId} />
            <div className="grid">
              <div className="field">
                <label htmlFor="reason">Motivo</label>
                <input id="reason" name="reason" list="reasons" required placeholder="Dolor de cabeza" />
                <datalist id="reasons">{["Dolor de cabeza", "Dolor abdominal", "Golpe en recreo", "Malestar general", "Herida leve", "Crisis de asma"].map((r) => <option key={r} value={r} />)}</datalist>
              </div>
              <div className="field"><label htmlFor="action">Acción realizada</label><input id="action" name="action" placeholder="Reposo 15 minutos, vuelve a clases" /></div>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 0 12px" }}>
              <input type="checkbox" name="sentHome" value="1" /> Requiere retiro por el apoderado
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn primary">Registrar atención</button>
              <Link className="btn secondary" href={`/salvaguarda/depositar?s=${studentId}`}>Derivar a Salvaguarda</Link>
            </div>
          </form>
        </section>
      )}

      <section className="section">
        <h2>Historial de atenciones ({visits.length})</h2>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Fecha</th><th>Motivo</th><th>Acción</th><th>Retiro</th><th>Registró</th></tr></thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id}>
                  <td>{v.at ? fmtDT(v.at) : fmtDate(v.date)}</td>
                  <td>{v.reason}</td>
                  <td>{v.action ?? "—"}</td>
                  <td>{v.sentHome ? "Sí" : "No"}</td>
                  <td className="muted">{v.nurseId ? who(v.nurseId) : "Enfermería"}</td>
                </tr>
              ))}
              {!visits.length && <tr><td colSpan={5} className="muted">Sin atenciones registradas.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
