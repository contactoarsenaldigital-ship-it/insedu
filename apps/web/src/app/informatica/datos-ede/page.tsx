import Link from "next/link";
import { comunaName, DEGREE_TYPE_LABEL, DEGREE_VERIFICATION_LABEL, type DegreeType, type DegreeVerification } from "@insedu/domain";
import { redirect } from "next/navigation";
import { school } from "@/lib/demo";
import { degreeCandidates } from "@/lib/datos-ede";
import { canExportMineduc, getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { edeDataState, findPerson, repo } from "@/lib/store";
import { addDegree, removeDegree, saveCapacities } from "./actions";

export const metadata = { title: "Datos para el EDE" };
export const dynamic = "force-dynamic";

export default async function EdeData({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/informatica/datos-ede");
  if (!canExportMineduc(session)) redirect("/");
  const sp = await searchParams;
  const { capacities, degrees } = edeDataState();
  const profile = school().profile;
  const staff = degreeCandidates();
  const teachers = new Set(repo.subjects().map((x) => x.teacherId).filter(Boolean));
  const withoutDegree = staff.filter((p) => teachers.has(p.id) && !degrees.some((d) => d.personId === p.id));

  return (
    <main className="wrap" style={{ maxWidth: 900 }}>
      <Link href="/informatica" className="muted">← Informática</Link>
      <h1 style={{ marginTop: 8 }}>Datos para el EDE</h1>
      <p>Datos del establecimiento que el Estándar de Datos para la Educación exige y que no se registran en el libro de clases.</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}

      {profile && (
        <section className="section">
          <h2>Establecimiento</h2>
          <div className="card">
            <p style={{ marginTop: 0 }}><strong>Jornada:</strong> {profile.jornada}</p>
            <p><strong>Dirección:</strong> {profile.location.street}, {profile.location.building}, {comunaName(profile.location.comunaCode)}, {profile.location.city}, código postal {profile.location.postalCode}</p>
            <p><strong>Correo:</strong> {profile.email} · <strong>Teléfono:</strong> {profile.phone}</p>
            <p style={{ marginBottom: 0 }}><strong>Periodo informado:</strong> {profile.firstDay} a {profile.lastDay}</p>
          </div>
        </section>
      )}

      <section className="section">
        <h2>Capacidad autorizada de cada curso</h2>
        <p className="muted">La que fija la resolución de reconocimiento oficial. Se informa en cada asignatura del curso.</p>
        <form action={saveCapacities} className="card">
          <div className="form-grid">
            {school().courses.map((c) => (
              <div key={c.id} className="field">
                <label htmlFor={`cap_${c.id}`}>{c.name}</label>
                <input id={`cap_${c.id}`} name={`cap_${c.id}`} inputMode="numeric" pattern="\d{1,3}" maxLength={3} defaultValue={capacities.find((x) => x.courseId === c.id)?.capacity ?? ""} />
              </div>
            ))}
          </div>
          <button className="btn primary">Guardar capacidades</button>
        </form>
      </section>

      <section className="section">
        <h2>Títulos de los docentes y profesionales</h2>
        {withoutDegree.length > 0 && <p className="notice warn">Docentes con asignaturas sin título registrado: {withoutDegree.map((p) => p.name).join(", ")}.</p>}
        {degrees.length > 0 && (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Persona</th><th>Título o certificado</th><th>Institución</th><th>Tipo</th><th>Fecha</th><th>Acreditada</th><th>Verificación</th><th>Idoneidad</th><th></th></tr></thead>
              <tbody>
                {[...degrees].sort((a, b) => (findPerson(a.personId)?.name ?? "").localeCompare(findPerson(b.personId)?.name ?? "", "es")).map((d) => (
                  <tr key={d.id}>
                    <td>{findPerson(d.personId)?.name ?? d.personId}</td>
                    <td>{d.title}</td>
                    <td>{d.institution}</td>
                    <td>{d.degreeType ? DEGREE_TYPE_LABEL[d.degreeType] : "—"}</td>
                    <td>{d.awardDate ?? "—"}</td>
                    <td>{d.accredited == null ? "—" : d.accredited ? "Sí" : "No"}</td>
                    <td>{d.verification ? DEGREE_VERIFICATION_LABEL[d.verification] : "—"}</td>
                    <td>{d.idoneidad ? "Sí" : "No"}</td>
                    <td><form action={removeDegree}><input type="hidden" name="degreeId" value={d.id} /><button className="btn secondary small">Quitar</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={addDegree} className="card section" style={{ maxWidth: 620 }}>
          <h3 style={{ marginTop: 0 }}>Registrar un título</h3>
          <div className="field">
            <label htmlFor="personId">Persona</label>
            <select id="personId" name="personId" required defaultValue="">
              <option value="" disabled>Seleccione…</option>
              {staff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="title">Título o certificado</label><input id="title" name="title" required minLength={5} maxLength={200} placeholder="Profesora de Educación General Básica" /></div>
          <div className="form-grid">
            <div className="field"><label htmlFor="institution">Institución</label><input id="institution" name="institution" required minLength={3} maxLength={200} /></div>
            <div className="field"><label htmlFor="awardDate">Fecha de titulación (opcional)</label><input id="awardDate" name="awardDate" type="date" /></div>
          </div>
          <div className="form-grid">
            <div className="field"><label htmlFor="degreeType">Tipo de título</label><select id="degreeType" name="degreeType" defaultValue="profesional">{(Object.keys(DEGREE_TYPE_LABEL) as DegreeType[]).map((k) => <option key={k} value={k}>{DEGREE_TYPE_LABEL[k]}</option>)}</select></div>
            <div className="field"><label htmlFor="verification">Verificación</label><select id="verification" name="verification" defaultValue="copia_titulo">{(Object.keys(DEGREE_VERIFICATION_LABEL) as DegreeVerification[]).map((k) => <option key={k} value={k}>{DEGREE_VERIFICATION_LABEL[k]}</option>)}</select></div>
          </div>
          <label className="check"><input type="checkbox" name="accredited" defaultChecked /> La institución está acreditada</label>
          <label className="check"><input type="checkbox" name="idoneidad" /> Ejerce con idoneidad docente (sin título de profesor)</label>
          <button className="btn primary">Registrar título</button>
        </form>
      </section>
    </main>
  );
}
