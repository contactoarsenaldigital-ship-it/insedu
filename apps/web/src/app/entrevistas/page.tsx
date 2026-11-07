import Link from "next/link";
import { redirect } from "next/navigation";
import { MEETING_LABEL, RELATION_LABEL } from "@insedu/domain";
import { DemoCode } from "@/components/DemoCode";
import { DownloadLinks } from "@/components/DownloadLinks";
import { activeStudents, courseById, fullName, studentById } from "@/lib/demo";
import { actasOf, canSeeMeeting, meetingCourses, meetingsToday } from "@/lib/entrevistas";
import { enrollmentOf } from "@/lib/matricula";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { findPerson, meetingsState } from "@/lib/store";
import { addMeeting } from "./actions";

export const metadata = { title: "Entrevistas y reuniones" };
export const dynamic = "force-dynamic";

const studentName = (id?: string) => {
  const st = id ? studentById(id) : undefined;
  return st ? fullName(st) : "";
};

export default async function Meetings({ searchParams }: { searchParams: Promise<{ curso?: string; tipo?: string; ok?: string; error?: string }> }) {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/entrevistas");
  const sp = await searchParams;
  const courses = meetingCourses(session);
  const course = sp.curso && courses.some((c) => c.id === sp.curso) ? courseById(sp.curso) : undefined;
  const kind = sp.tipo === "reunion" ? "reunion" : "entrevista";
  const visible = meetingsState().filter((m) => canSeeMeeting(session, m) && (!course || m.courseId === course.id)).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const students = course ? activeStudents().filter((x) => x.courseId === course.id).sort((a, b) => a.lastName.localeCompare(b.lastName, "es")) : [];
  const today = meetingsToday();

  return (
    <main className="wrap" style={{ maxWidth: 1000 }}>
      <h1>Entrevistas y reuniones con apoderados</h1>
      <p>Registro de las entrevistas y reuniones con apoderados y su contenido. Quien conduce firma con su verificador; el acta firmada por el apoderado se escanea y se adjunta.</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}

      {courses.length > 0 && (
        <section className="section">
          <h2>Registrar</h2>
          <form method="get" className="req-actions" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="curso">Curso</label>
              <select id="curso" name="curso" defaultValue={course?.id ?? ""}>
                <option value="" disabled>Elija un curso</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="tipo">Tipo</label>
              <select id="tipo" name="tipo" defaultValue={kind}>
                <option value="entrevista">{MEETING_LABEL.entrevista}</option>
                <option value="reunion">{MEETING_LABEL.reunion}</option>
              </select>
            </div>
            <button className="btn secondary">Continuar</button>
          </form>

          {course && (
            <form action={addMeeting} className="card section" style={{ maxWidth: 680 }}>
              <input type="hidden" name="courseId" value={course.id} />
              <input type="hidden" name="kind" value={kind} />
              <h3 style={{ marginTop: 0 }}>{MEETING_LABEL[kind]} · {course.name}</h3>
              <div className="form-grid">
                <div className="field"><label htmlFor="date">Fecha</label><input id="date" name="date" type="date" required max={today} defaultValue={today} /></div>
                <div className="field"><label htmlFor="time">Hora de inicio</label><input id="time" name="time" type="time" required /></div>
              </div>
              {kind === "entrevista" ? (
                <>
                  <div className="field">
                    <label htmlFor="studentId">Estudiante</label>
                    <select id="studentId" name="studentId" required defaultValue="">
                      <option value="" disabled>Seleccione…</option>
                      {students.map((x) => <option key={x.id} value={x.id}>{x.lastName}, {x.firstName}</option>)}
                    </select>
                  </div>
                  <div className="form-grid">
                    <div className="field"><label htmlFor="attendeeName">Quién asistió (nombre y apellidos)</label><input id="attendeeName" name="attendeeName" required minLength={3} maxLength={120} autoComplete="off" /></div>
                    <div className="field"><label htmlFor="attendeeRut">RUN (opcional)</label><input id="attendeeRut" name="attendeeRut" maxLength={12} autoComplete="off" placeholder="12.345.678-5" /></div>
                    <div className="field">
                      <label htmlFor="relation">Relación con el estudiante</label>
                      <select id="relation" name="relation">{Object.entries(RELATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    </div>
                  </div>
                </>
              ) : (
                <fieldset className="field">
                  <legend>Apoderados que asistieron</legend>
                  <p className="muted">Se registra al apoderado titular de la matrícula de cada estudiante marcado.</p>
                  <div className="check-columns">
                    {students.map((x) => {
                      const g = enrollmentOf(x.id)?.guardians[0];
                      return <label key={x.id} className="check"><input type="checkbox" name="present" value={x.id} disabled={!g?.name} /> {x.lastName}, {x.firstName}{g?.name ? <span className="muted"> · {g.name}</span> : <span className="muted"> · sin apoderado en la matrícula</span>}</label>;
                    })}
                  </div>
                </fieldset>
              )}
              <div className="field"><label htmlFor="topics">Motivo y temas tratados</label><textarea id="topics" name="topics" rows={3} required minLength={10} maxLength={2000} /></div>
              <div className="field"><label htmlFor="agreements">Acuerdos</label><textarea id="agreements" name="agreements" rows={2} required minLength={5} maxLength={2000} /></div>
              <p className="muted">Al guardar firma el registro con su verificador. Después adjunte el acta firmada por {kind === "reunion" ? "los asistentes" : "el apoderado"}.</p>
              <DemoCode session={session} />
              <div className="field" style={{ maxWidth: 220 }}>
                <label htmlFor="code">Código de 6 dígitos</label>
                <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
              </div>
              <button className="btn primary">Guardar y firmar</button>
            </form>
          )}
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Registros{course ? ` de ${course.name}` : ""}</h2>
          {courses.length > 0 && <DownloadLinks tipo="entrevistas" params={course ? { courseId: course.id } : {}} caption="Registro de entrevistas y reuniones" />}
        </div>
        {visible.length === 0 ? <p className="muted">No hay entrevistas ni reuniones registradas.</p> : (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Curso</th><th>Estudiante</th><th>Asistentes</th><th>Condujo</th><th>Acta</th></tr></thead>
              <tbody>
                {visible.slice(0, 60).map((m) => (
                  <tr key={m.id}>
                    <td><Link href={`/entrevistas/${m.id}`}>{m.date} {m.time}</Link></td>
                    <td>{MEETING_LABEL[m.kind]}</td>
                    <td>{courseById(m.courseId)?.name}</td>
                    <td>{studentName(m.studentId) || "—"}</td>
                    <td>{m.attendees.length}</td>
                    <td className="muted">{findPerson(m.by)?.name ?? m.by}</td>
                    <td>{actasOf(m.id).length ? <span className="tag ok">Adjunta</span> : <span className="tag media">Falta</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
