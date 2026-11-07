import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fold, normalizeRut } from "@insedu/domain";
import { DownloadLinks } from "@/components/DownloadLinks";
import { activeStudents, courseById, fullName, school, studentById } from "@/lib/demo";
import { canRegisterExits, exitsToday, nowTime, openExits, pickupsOf, wardsOf } from "@/lib/salidas";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { exitsState } from "@/lib/store";
import { addCourseExit, registerCourseReturn, registerReturn, searchExitStudent } from "./actions";

export const metadata = { title: "Salidas y retiros" };
export const dynamic = "force-dynamic";

const studentName = (id: string) => {
  const st = studentById(id);
  return st ? fullName(st) : id;
};

export default async function Exits({ searchParams }: { searchParams: Promise<{ fecha?: string; ok?: string; error?: string }> }) {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/salidas");
  const sp = await searchParams;
  const notices = (
    <>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}
    </>
  );

  const wards = wardsOf(session);
  if (wards.length) {
    return (
      <main className="wrap" style={{ maxWidth: 760 }}>
        <h1>Salidas y retiros</h1>
        <p>Indique quiénes pueden retirar a su pupilo/a del colegio. Solo ellos podrán hacerlo sin una comunicación suya.</p>
        {notices}
        <div className="grid section">
          {wards.map((id) => (
            <Link key={id} href={`/salidas/${id}`} className="card">
              <h3>{studentName(id)}</h3>
              <span className="muted">{pickupsOf(id).length} persona(s) autorizada(s)</span>
              <span className="go">Ver y administrar →</span>
            </Link>
          ))}
        </div>
      </main>
    );
  }

  const heads = session.scope.headOfCourseIds;
  const write = canRegisterExits(session);
  if (!write && !heads.length) {
    return <main className="wrap"><h1>Salidas y retiros</h1><p className="notice warn">Este registro es para portería, inspectoría, profesores jefe, dirección, administración y apoderados.</p></main>;
  }

  const today = exitsToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha ?? "") ? sp.fecha! : today;
  const visible = (courseId: string) => write || heads.includes(courseId);
  const { exits, courseExits } = exitsState();
  const ofDay = exits.filter((e) => e.date === date && visible(e.courseId)).sort((a, b) => a.exitTime.localeCompare(b.exitTime));
  const coursesOfDay = courseExits.filter((e) => e.date === date && visible(e.courseId));
  const open = openExits(date).filter((e) => visible(e.courseId));
  const search = write ? (await cookies()).get("insedu_salidas_q")?.value ?? "" : "";
  const q = fold(search);
  const qRut = normalizeRut(search);
  const matches = q ? activeStudents().filter((s) => fold(fullName(s)).includes(q) || s.rut.includes(qRut)).slice(0, 12) : [];
  const now = nowTime();

  return (
    <main className="wrap" style={{ maxWidth: 1040 }}>
      <span className="muted">{school().name}</span>
      <h1>Salidas y retiros</h1>
      {notices}

      {write && (
        <section className="card section">
          <h2 style={{ fontSize: "1.1rem" }}>Registrar un retiro</h2>
          <form action={searchExitStudent} className="req-actions" style={{ alignItems: "flex-end" }}>
            <input type="hidden" name="fecha" value={date} />
            <div className="field" style={{ marginBottom: 0, flex: "1 1 260px" }}>
              <label htmlFor="q">Buscar estudiante por nombre o RUN</label>
              <input id="q" name="q" defaultValue={search} autoComplete="off" autoFocus />
            </div>
            <button className="btn primary">Buscar</button>
          </form>
          {q && matches.length === 0 && <p className="muted">No hay estudiantes vigentes con esa búsqueda.</p>}
          {matches.length > 0 && (
            <ul className="exit-matches">
              {matches.map((s) => <li key={s.id}><Link href={`/salidas/${s.id}`}>{s.lastName}, {s.firstName}</Link> <span className="muted">· {courseById(s.courseId)?.name} · {pickupsOf(s.id).length} autorizada(s)</span></li>)}
            </ul>
          )}
        </section>
      )}

      <form className="req-actions section" style={{ alignItems: "flex-end", justifyContent: "space-between" }}>
        <div className="field" style={{ marginBottom: 0 }}><label htmlFor="fecha">Fecha</label><input id="fecha" name="fecha" type="date" defaultValue={date} max={today} /></div>
        <button className="btn secondary">Ver el día</button>
        {write && <span style={{ marginLeft: "auto" }}><DownloadLinks tipo="salidas" caption="Registro completo" /></span>}
      </form>

      {open.length > 0 && <p className="notice warn section">{open.length} salida(s) de este día sin regreso registrado. Si el estudiante no vuelve, déjelo sin regreso.</p>}

      <section className="section">
        <h2>Retiros del día</h2>
        {ofDay.length === 0 ? <p className="muted">Sin retiros registrados este día.</p> : (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Folio</th><th>Estudiante</th><th>Curso</th><th>Salida</th><th>Regreso</th><th>Retiró</th><th>Motivo</th></tr></thead>
              <tbody>
                {ofDay.map((e) => (
                  <tr key={e.id}>
                    <td>{e.folio}</td>
                    <td><Link href={`/salidas/${e.studentId}`}>{studentName(e.studentId)}</Link></td>
                    <td>{courseById(e.courseId)?.name}</td>
                    <td>{e.exitTime}</td>
                    <td>
                      {e.returnTime ?? (write ? (
                        <form action={registerReturn} className="sign-form">
                          <input type="hidden" name="exitId" value={e.id} />
                          <input name="returnTime" type="time" required defaultValue={now} aria-label="Hora de regreso" />
                          <button className="btn secondary small">Regresó</button>
                        </form>
                      ) : "—")}
                    </td>
                    <td>{e.pickupName}{!e.pickupAuthId && <> <span className="tag alta">No registrada</span></>}</td>
                    <td>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Salidas de curso completo</h2>
        {coursesOfDay.length === 0 ? <p className="muted">Ningún curso salió este día.</p> : (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Folio</th><th>Curso</th><th>Estudiantes fuera</th><th>A cargo</th><th>Destino</th><th>Salida</th><th>Regreso</th></tr></thead>
              <tbody>
                {coursesOfDay.map((e) => (
                  <tr key={e.id}>
                    <td>{e.folio}</td><td>{courseById(e.courseId)?.name}</td><td>{e.studentsOut}</td><td>{e.responsible}</td><td>{e.destination}</td><td>{e.exitTime}</td>
                    <td>
                      {e.returnTime ?? (write ? (
                        <form action={registerCourseReturn} className="sign-form">
                          <input type="hidden" name="exitId" value={e.id} />
                          <input name="returnTime" type="time" required defaultValue={now} aria-label="Hora de regreso" />
                          <button className="btn secondary small">Regresó</button>
                        </form>
                      ) : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {write && (
          <details className="section card">
            <summary><strong>Registrar la salida de un curso</strong></summary>
            <form action={addCourseExit} style={{ marginTop: 12 }}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="courseId">Curso</label>
                  <select id="courseId" name="courseId" required defaultValue="">
                    <option value="" disabled>Seleccione…</option>
                    {school().courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field"><label htmlFor="c-date">Fecha</label><input id="c-date" name="date" type="date" required max={today} defaultValue={today} /></div>
                <div className="field"><label htmlFor="c-exit">Hora de salida</label><input id="c-exit" name="exitTime" type="time" required defaultValue={now} /></div>
                <div className="field"><label htmlFor="c-return">Hora de regreso (si ya volvió)</label><input id="c-return" name="returnTime" type="time" /></div>
                <div className="field"><label htmlFor="c-out">Estudiantes fuera</label><input id="c-out" name="studentsOut" type="number" min={1} required /></div>
                <div className="field"><label htmlFor="c-resp">Persona a cargo</label><input id="c-resp" name="responsible" required /></div>
                <div className="field wide"><label htmlFor="c-dest">Destino o actividad</label><input id="c-dest" name="destination" required /></div>
              </div>
              <button className="btn primary">Registrar salida del curso</button>
            </form>
          </details>
        )}
      </section>
    </main>
  );
}
