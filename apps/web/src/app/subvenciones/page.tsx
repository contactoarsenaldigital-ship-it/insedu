import Link from "next/link";
import { redirect } from "next/navigation";
import { DAY_EVENT_LABEL } from "@insedu/domain";
import { courseById, school } from "@/lib/demo";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { subsidyState } from "@/lib/store";
import { canManageSubsidy, canReadAllSubsidy, canReadSubsidy, courseSheet, differencesFromDeclared, isMonth, latestDeclaration, subsidyMonths, subsidyToday } from "@/lib/subvenciones";
import { addDayEvent, declareMonth } from "./actions";

export const metadata = { title: "Control de subvenciones" };
export const dynamic = "force-dynamic";

const pct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(1).replace(".", ",")} %`);

export default async function Subsidies({ searchParams }: { searchParams: Promise<{ mes?: string; ok?: string; error?: string }> }) {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/subvenciones");
  const courses = school().courses.filter((c) => canReadSubsidy(session, c.id));
  if (!courses.length) {
    return <main className="wrap"><h1>Control de subvenciones</h1><p className="notice warn">Este registro es para dirección, administración, inspectoría y profesores jefe.</p></main>;
  }
  const sp = await searchParams;
  const months = subsidyMonths();
  const month = isMonth(sp.mes) && months.includes(sp.mes) ? sp.mes : months[0];
  const today = subsidyToday();
  const manage = canManageSubsidy(session);
  const sheets = month ? courses.map((c) => ({ course: c, sheet: courseSheet(c.id, month) })) : [];
  const errors = sheets.flatMap((x) => x.sheet.issues).filter((i) => i.severity === "error").length;
  const declared = month ? latestDeclaration(month) : undefined;
  const diffs = month && canReadAllSubsidy(session) ? differencesFromDeclared(month) : [];
  const events = month ? subsidyState().events.filter((e) => e.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const finished = !!month && month < today.slice(0, 7);

  return (
    <main className="wrap" style={{ maxWidth: 1040 }}>
      <h1>Control de subvenciones</h1>
      <p>Control mensual de asistencia del libro de clases. Vale la asistencia de la segunda hora, que debe coincidir con el control de asignatura.</p>
      <p className="notice">Este registro no calcula montos y <strong>no envía datos al SIGE</strong>: prepara, revisa y deja constancia de lo que el establecimiento declara.</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}

      {!month ? <p className="muted section">Aún no hay asistencia registrada.</p> : (
        <>
          <form method="get" className="req-actions section" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="mes">Mes</label>
              <select id="mes" name="mes" defaultValue={month}>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            </div>
            <button className="btn secondary">Ver mes</button>
          </form>

          <div className="table-scroll section">
            <table className="data">
              <thead><tr><th>Curso</th><th>Asistencia media</th><th>Asistentes</th><th>Inasistentes</th><th>Matrícula acumulada</th><th>Revisión</th></tr></thead>
              <tbody>
                {sheets.map(({ course, sheet }) => {
                  const e = sheet.issues.filter((i) => i.severity === "error").length;
                  const a = sheet.issues.filter((i) => i.severity === "aviso").length;
                  return (
                    <tr key={course.id}>
                      <td><Link href={`/subvenciones/${course.id}?mes=${month}`}><strong>{course.name}</strong></Link></td>
                      <td>{pct(sheet.rate)}</td>
                      <td>{sheet.totals.attended}</td>
                      <td>{sheet.totals.absent}</td>
                      <td>{sheet.totals.enrolled}</td>
                      <td>{e > 0 ? <span className="tag alta">{e} por resolver</span> : <span className="tag ok">Sin errores</span>}{a > 0 && <> <span className="tag media">{a} aviso(s)</span></>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted">La matrícula acumulada suma la matrícula de cada día. La asistencia media divide los asistentes por ese total.</p>

          {canReadAllSubsidy(session) && (
            <section className="section">
              <h2>Declaración del mes</h2>
              {declared ? (
                <p><span className="tag ok">Declarado el {declared.declaredOn}</span> <span className="muted">Certificado: {declared.certificate}</span></p>
              ) : <p><span className="tag media">Sin declaración registrada</span></p>}
              {diffs.length > 0 && (
                <div className="notice warn" role="alert">
                  <strong>El libro ya no coincide con lo declarado:</strong>
                  <ul>{diffs.map((d) => <li key={d.courseId}>{courseById(d.courseId)?.name}: {d.days.map((x) => x.slice(8, 10)).join(", ")}</li>)}</ul>
                  Corrija en el SIGE si corresponde y registre la rectificación.
                </div>
              )}
              {manage && (
                <p className="req-actions">
                  <a className="btn secondary" href={`/api/export/subvenciones?mes=${month}`}>Descargar archivo para cotejar con el SIGE</a>
                </p>
              )}
              <p className="muted">El archivo es una plantilla propia, sin suspensiones ni excedentes y con las correcciones aplicadas. No se ha comprobado contra el formato de carga del SIGE: sirve para cotejar la declaración.</p>
              {manage && (finished ? (
                errors > 0 ? <p className="notice warn">Resuelva los {errors} problema(s) de los cursos para registrar la declaración.</p> : (!declared || diffs.length > 0) && (
                  <form action={declareMonth} className="card section" style={{ maxWidth: 560 }}>
                    <h3>{declared ? "Registrar rectificación" : "Registrar declaración"}</h3>
                    <input type="hidden" name="mes" value={month} />
                    <div className="field"><label htmlFor="declaredOn">Fecha en que se declaró en el SIGE</label><input id="declaredOn" name="declaredOn" type="date" max={today} required /></div>
                    <div className="field"><label htmlFor="certificate">Folio del certificado de asistencia, o dónde consta</label><input id="certificate" name="certificate" required minLength={3} maxLength={120} /></div>
                    {declared && <div className="field"><label htmlFor="reason">Motivo de la rectificación</label><textarea id="reason" name="reason" required minLength={10} maxLength={500} /></div>}
                    <button className="btn">Registrar</button>
                  </form>
                )
              ) : <p className="muted">El mes se puede declarar cuando termine.</p>)}
            </section>
          )}

          <section className="section">
            <h2>Suspensiones y cambios de actividades</h2>
            <p className="muted">Un día suspendido no se cuenta ni se declara. En un cambio de actividades la asistencia se sigue registrando y declarando.</p>
            {events.length === 0 ? <p className="muted">No hay eventos en este mes.</p> : (
              <div className="table-scroll">
                <table className="data">
                  <thead><tr><th>Fecha</th><th>Alcance</th><th>Tipo</th><th>Motivo</th><th>Autorización</th><th>Recuperación</th></tr></thead>
                  <tbody>{events.map((e) => <tr key={e.id}><td>{e.date}</td><td>{e.courseId ? courseById(e.courseId)?.name : "Todo el establecimiento"}</td><td>{DAY_EVENT_LABEL[e.kind]}</td><td>{e.reason}</td><td>{e.authorization}</td><td>{e.recovery ?? "—"}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            {manage && (
              <form action={addDayEvent} className="card section" style={{ maxWidth: 560 }}>
                <h3>Registrar evento</h3>
                <input type="hidden" name="mes" value={month} />
                <div className="field"><label htmlFor="date">Fecha</label><input id="date" name="date" type="date" required /></div>
                <div className="field"><label htmlFor="courseId">Alcance</label><select id="courseId" name="courseId" defaultValue=""><option value="">Todo el establecimiento</option>{school().courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="field"><label htmlFor="kind">Tipo</label><select id="kind" name="kind">{Object.entries(DAY_EVENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div className="field"><label htmlFor="reason2">Motivo</label><input id="reason2" name="reason" required minLength={10} maxLength={300} /></div>
                <div className="field"><label htmlFor="authorization">Dónde consta la autorización</label><input id="authorization" name="authorization" required minLength={5} maxLength={160} /></div>
                <div className="field"><label htmlFor="recovery">Calendario de recuperación (opcional)</label><input id="recovery" name="recovery" maxLength={160} /></div>
                <button className="btn">Registrar evento</button>
              </form>
            )}
          </section>
        </>
      )}
    </main>
  );
}
