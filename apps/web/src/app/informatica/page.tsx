import { ATTENDANCE_TEMPLATE, checkAttendance, checkGrades, GRADES_TEMPLATE } from "@insedu/domain";
import { redirect } from "next/navigation";
import { school } from "@/lib/demo";
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

  return (
    <main className="wrap" style={{ maxWidth: 900 }}>
      <span className="muted">Encargado de informática · RBD {s.rbd}</span>
      <h1>Exportación para MINEDUC</h1>
      <p>Los docentes registran una sola vez en INSEDU. Aquí se generan los archivos para cargar en la plataforma oficial, con un informe de consistencia previo.</p>
      <p className="notice warn">Las plantillas son genéricas y configurables: los formatos oficiales de carga se confirmarán con el colegio piloto antes de la Etapa 2.</p>

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

      {attIssues.length > 0 && (
        <section className="section">
          <h2>Informe de consistencia de asistencia</h2>
          <ul>{attIssues.slice(0, 10).map((i, k) => <li key={k}><span className={`tag ${i.severity === "error" ? "alta" : "media"}`}>{i.severity}</span> {i.message}</li>)}</ul>
        </section>
      )}
    </main>
  );
}
