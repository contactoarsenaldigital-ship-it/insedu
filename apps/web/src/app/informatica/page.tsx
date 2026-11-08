import { ATTENDANCE_TEMPLATE, checkAttendance, checkGrades, GRADES_TEMPLATE } from "@insedu/domain";
import { redirect } from "next/navigation";
import { verifyLogbook } from "@insedu/domain/server";
import { school } from "@/lib/demo";
import { edeExport } from "@/lib/ede";
import { findPerson, logbook } from "@/lib/store";
import { canExportMineduc, getSession } from "@/lib/session";
import { readState } from "@/lib/state";

export const metadata = { title: "Exportación MINEDUC" };

export default async function ITPage() {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/informatica");
  if (!canExportMineduc(session)) {
    return (
      <main className="wrap"><h1>Exportación MINEDUC</h1><p className="notice warn">Solo dirección y administración del establecimiento exportan los archivos para MINEDUC. Ingrese, por ejemplo, como Daniela Castro.</p></main>
    );
  }
  const s = school();
  const st = new Map(s.students.map((x) => [x.id, x]));
  const week = s.schoolDays.slice(-5);
  const attRows = s.attendance.filter((a) => week.includes(a.date)).map((record) => ({ student: st.get(record.studentId)!, record, rbd: s.rbd }));
  const attIssues = checkAttendance(attRows, week);
  const gradeIssues = checkGrades(s.grades.map((grade) => ({ student: st.get(grade.studentId)!, grade, rbd: s.rbd })));
  const check = verifyLogbook(logbook());
  const events = logbook().slice(-50).reverse();
  const ede = edeExport();

  return (
    <main className="wrap" style={{ maxWidth: 900 }}>
      <span className="muted">Encargado de informática · RBD {s.rbd}</span>
      <h1>Exportación para MINEDUC</h1>
      <p>Los docentes registran una sola vez en INSEDU. Aquí se generan los archivos para cargar en la plataforma oficial, con un informe de consistencia previo.</p>
      <p className="notice warn">Las plantillas son genéricas y configurables: los formatos oficiales de carga se confirmarán con el colegio piloto antes de la Etapa 2.</p>

      <p className="notice">Para declarar la asistencia use el <a href="/subvenciones">control de subvenciones</a>, que considera la segunda hora, las correcciones, los excedentes y las suspensiones. El archivo de abajo trae la asistencia diaria sin esos ajustes.</p>

      <div className="grid section">
        <div className="card">
          <span className="eyebrow">Asistencia diaria · {week[0]} a {week.at(-1)}</span>
          <h3>{attRows.length} registros</h3>
          <span className={`tag ${attIssues.some((i) => i.severity === "error") ? "alta" : "ok"}`}>
            {attIssues.filter((i) => i.severity === "error").length} errores · {attIssues.filter((i) => i.severity === "aviso").length} avisos
          </span>
          <span className="muted">Plantilla {ATTENDANCE_TEMPLATE.id}: {ATTENDANCE_TEMPLATE.columns.map((c) => c.header).join(", ")}</span>
          <a className="btn" href={`/api/export/asistencia?desde=${week[0]}&hasta=${week.at(-1)}`}>Descargar CSV</a>
        </div>
        <div className="card">
          <span className="eyebrow">Calificaciones · semestre</span>
          <h3>{s.grades.length} notas</h3>
          <span className={`tag ${gradeIssues.length ? "alta" : "ok"}`}>{gradeIssues.length} errores</span>
          <span className="muted">Plantilla {GRADES_TEMPLATE.id}: {GRADES_TEMPLATE.columns.map((c) => c.header).join(", ")}</span>
          <a className="btn" href="/api/export/notas">Descargar CSV</a>
        </div>
      </div>

      <section className="section">
        <h2>Estándar de Datos para la Educación (EDE)</h2>
        <p>Archivo <code>json.zip</code> en el formato que lee el contenedor oficial del Mineduc (<code>edemineduc/etl</code>: comandos <code>parse</code>, <code>insert</code> y <code>check</code>).</p>
        <p className="notice">Incluye establecimiento, cursos, matrícula, asistencia, horario, evaluaciones, anotaciones, entrevistas, salidas, entregas y documentos. El informe de abajo avisa lo que falta antes de cargar el archivo.</p>
        <ul>{ede.issues.map((i, k) => <li key={k}><span className={`tag ${i.severity === "error" ? "alta" : "media"}`}>{i.severity}</span> {i.message}</li>)}</ul>
        <p className="muted">{Object.entries(ede.counts).map(([t, n]) => `${t}: ${n}`).join(" · ")}</p>
        <p><a href="/informatica/datos-ede">Datos para el EDE</a>: capacidad autorizada de cada curso y títulos de los docentes.</p>
        <a className="btn secondary" href="/api/ede" download>Descargar json.zip</a>
      </section>

      <section className="section">
        <h2>Respaldo y trazabilidad del libro de clases</h2>
        <p>Descarga en Excel todo lo registrado en el libro, para entregarlo ante una fiscalización. La salud y Salvaguarda no se incluyen.</p>
        <p className="notice">Este respaldo sirve para una revisión en pantalla o en papel. El archivo en el formato del Estándar de Datos para la Educación se descarga en la sección anterior.</p>
        <form action="/api/libro-respaldo" method="get" className="req-actions" style={{ alignItems: "flex-end", marginTop: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="curso">Curso</label>
            <select id="curso" name="curso" defaultValue="">
              <option value="">Todo el establecimiento</option>
              {s.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button className="btn">Descargar respaldo</button>
        </form>

        <h3 className="section">Bitácora de acciones</h3>
        <p>
          <span className={`tag ${check.ok ? "ok" : "alta"}`}>{check.ok ? "Integridad verificada" : "Se detectaron alteraciones"}</span>{" "}
          <span className="muted">{check.checked} eventos revisados{check.ok ? "" : ` · ${check.altered.length} alterados · ${check.missingPrevious.length} sin su evento anterior`}</span>
        </p>
        {events.length === 0 ? <p className="muted">Aún no hay eventos. Cada clase, nota, anotación, firma o corrección quedará aquí.</p> : (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Registro</th><th>Motivo</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.at).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "medium" })}</td>
                    <td>{findPerson(e.actor)?.name ?? e.actor}</td>
                    <td>{e.action}</td>
                    <td>{e.entity}</td>
                    <td>{e.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {check.checked > events.length && <p className="muted">Se muestran los últimos {events.length}; el respaldo incluye todos.</p>}
      </section>

      {attIssues.length > 0 && (
        <section className="section">
          <h2>Informe de consistencia de asistencia</h2>
          <ul>{attIssues.slice(0, 10).map((i, k) => <li key={k}><span className={`tag ${i.severity === "error" ? "alta" : "media"}`}>{i.severity}</span> {i.message}</li>)}</ul>
        </section>
      )}
    </main>
  );
}
