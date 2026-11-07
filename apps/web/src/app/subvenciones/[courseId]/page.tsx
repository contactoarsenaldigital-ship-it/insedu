import Link from "next/link";
import { redirect } from "next/navigation";
import { CORRECTION_KIND_LABEL, type SubsidyCell } from "@insedu/domain";
import { DownloadLinks } from "@/components/DownloadLinks";
import { Attachments } from "@/components/Attachments";
import { courseById, studentById, fullName } from "@/lib/demo";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { findPerson, subsidyState } from "@/lib/store";
import { canManageSubsidy, canReadSubsidy, courseSheet, DAY_STATUS, isMonth, subsidyMonths } from "@/lib/subvenciones";
import { addCorrection, endSurplus } from "../actions";

export const metadata = { title: "Control mensual de asistencia" };
export const dynamic = "force-dynamic";

const pct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(1).replace(".", ",")} %`);

function symbol(c: SubsidyCell) {
  if (c.state === "out") return "";
  if (c.state === "suspended") return "S";
  if (c.state === "missing") return "?";
  return c.mark === "present" ? "•" : "x";
}

function describe(c: SubsidyCell) {
  const parts = [c.state === "out" ? "Sin matrícula" : c.state === "suspended" ? "Suspensión" : c.state === "missing" ? "Sin dato" : c.mark === "present" ? "Presente" : "Ausente"];
  if (c.corrected) parts.push("corregido");
  if (c.discrepancy) parts.push("no coincide con la asistencia diaria");
  if (c.lateEntry) parts.push("ingresó después de la segunda hora");
  return parts.join(", ");
}

export default async function CourseSubsidy({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ mes?: string; ok?: string; error?: string }> }) {
  await readState();
  const { courseId } = await params;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=/subvenciones/${courseId}`);
  const course = courseById(courseId);
  if (!course || !canReadSubsidy(session, courseId)) {
    return <main className="wrap"><h1>Control mensual de asistencia</h1><p className="notice warn">No tiene acceso a este curso.</p></main>;
  }
  const sp = await searchParams;
  const months = subsidyMonths();
  const month = isMonth(sp.mes) && months.includes(sp.mes) ? sp.mes : months[0];
  const manage = canManageSubsidy(session);
  if (!month) return <main className="wrap"><h1>{course.name}</h1><p className="muted">Aún no hay asistencia registrada.</p></main>;

  const sheet = courseSheet(courseId, month);
  const corrections = subsidyState().corrections.filter((c) => c.courseId === courseId && c.date.startsWith(month)).sort((a, b) => b.at.localeCompare(a.at));
  const surplus = sheet.rows.filter((r) => r.student.surplus);
  const changes = sheet.rows.filter((r) => r.student.withdrawnOn?.startsWith(month) || r.student.enrolledOn?.startsWith(month));

  return (
    <main className="wrap" style={{ maxWidth: 1200 }}>
      <p><Link href={`/subvenciones?mes=${month}`}>← Control de subvenciones</Link></p>
      <h1>{course.name}</h1>
      <p>Control mensual de asistencia · {month} · asistencia media {pct(sheet.rate)}</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}

      <form method="get" className="req-actions" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="mes">Mes</label>
          <select id="mes" name="mes" defaultValue={month}>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </div>
        <button className="btn secondary">Ver mes</button>
      </form>

      {sheet.issues.length > 0 && (
        <ul className="section">
          {sheet.issues.map((i, k) => <li key={k}><span className={`tag ${i.severity === "error" ? "alta" : "media"}`}>{i.severity}</span> {i.message}</li>)}
        </ul>
      )}

      <p className="muted section">• presente · x ausente · S suspensión · ? sin dato · celda vacía: sin matrícula. Marcadas en amarillo: con observación.</p>
      <div className="table-scroll">
        <table className="data subsidy-matrix">
          <thead>
            <tr>
              <th>N°</th><th>Estudiante</th>
              {sheet.days.map((d) => <th key={d.date} title={d.event ? `${DAY_STATUS[d.status]}: ${d.event.reason}` : DAY_STATUS[d.status]}>{d.date.slice(8, 10)}</th>)}
              <th>Asist.</th><th>Inasist.</th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r) => (
              <tr key={r.student.id} className={r.student.withdrawnOn?.startsWith(month) ? "subsidy-out" : undefined}>
                <td>{r.number}</td>
                <td>
                  {r.student.name}
                  {r.student.surplus && <> <span className="tag media">Excedente</span></>}
                  {r.student.withdrawnOn && r.student.withdrawnOn <= `${month}-31` && <> <span className="tag alta">Baja {r.student.withdrawnOn}</span></>}
                  {r.student.enrolledOn?.startsWith(month) && <> <span className="tag ok">Alta {r.student.enrolledOn}</span></>}
                </td>
                {r.cells.map((c) => <td key={c.date} title={describe(c)} className={c.discrepancy || c.lateEntry || c.state === "missing" ? "subsidy-flag" : c.corrected ? "subsidy-fixed" : undefined}>{symbol(c)}</td>)}
                <td>{r.attended}</td>
                <td>{r.absent}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {([["ASIST", "attended"], ["INASIST", "absent"], ["MATRIC", "enrolled"]] as const).map(([label, key]) => (
              <tr key={key}>
                <th></th><th>{label}</th>
                {sheet.days.map((d) => <td key={d.date} className={d.status === "empty" || d.status === "incomplete" ? "subsidy-flag" : undefined}>{d.status === "suspended" ? "S" : d[key]}</td>)}
                <td>{key === "attended" ? sheet.totals.attended : key === "enrolled" ? sheet.totals.enrolled : ""}</td>
                <td>{key === "absent" ? sheet.totals.absent : ""}</td>
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
      {surplus.length > 0 && <p className="muted">Los excedentes se registran para efectos pedagógicos y no suman a los totales del curso.</p>}
      {changes.length > 0 && <p className="muted">Bajas y altas del mes: {changes.length}. Se reflejan desde la fecha del registro de matrícula y deben registrarse también en el SIGE.</p>}

      <DownloadLinks tipo="subvenciones" params={{ courseId, month }} caption="Control mensual" />

      <section className="section">
        <h2>Correcciones</h2>
        <p className="muted">Toda corrección queda con responsable, fecha, hora y motivo. Conviene hacerla antes de declarar en el SIGE, para no generar contradicciones.</p>
        {corrections.length === 0 ? <p className="muted">No hay correcciones en este mes.</p> : (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Día</th><th>Estudiante</th><th>Queda</th><th>Tipo</th><th>Motivo</th><th>Justificativo</th><th>Responsable</th><th>Escaneado</th></tr></thead>
              <tbody>
                {corrections.map((c) => {
                  const st = studentById(c.studentId);
                  return (
                    <tr key={c.id}>
                      <td>{c.date}{c.afterDeclaration && <> <span className="tag media">Tras declarar</span></>}</td>
                      <td>{st ? fullName(st) : "—"}</td>
                      <td>{c.mark === "present" ? "Presente" : "Ausente"}</td>
                      <td>{CORRECTION_KIND_LABEL[c.kind]}</td>
                      <td>{c.reason}</td>
                      <td>{c.document ?? "—"}</td>
                      <td>{findPerson(c.by)?.name ?? c.by}</td>
                      <td><Attachments kind="subvencion" ownerId={c.id} compact hint="Justificativo escaneado" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {manage && (
          <form action={addCorrection} className="card section" style={{ maxWidth: 560 }}>
            <h3>Registrar corrección</h3>
            <input type="hidden" name="courseId" value={courseId} />
            <input type="hidden" name="mes" value={month} />
            <div className="field"><label htmlFor="studentId">Estudiante</label><select id="studentId" name="studentId" required>{sheet.rows.map((r) => <option key={r.student.id} value={r.student.id}>{r.number}. {r.student.name}</option>)}</select></div>
            <div className="field"><label htmlFor="date">Día</label><select id="date" name="date" required>{sheet.days.map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}</select></div>
            <div className="field"><label htmlFor="mark">Queda como</label><select id="mark" name="mark"><option value="present">Presente</option><option value="absent">Ausente</option></select></div>
            <div className="field"><label htmlFor="kind">Tipo</label><select id="kind" name="kind">{Object.entries(CORRECTION_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field"><label htmlFor="reason">Motivo</label><textarea id="reason" name="reason" required minLength={10} maxLength={500} /></div>
            <div className="field"><label htmlFor="document">Dónde consta el justificativo (obligatorio si ingresó después)</label><input id="document" name="document" maxLength={160} /></div>
            <button className="btn">Registrar corrección</button>
          </form>
        )}
      </section>

      {manage && surplus.length > 0 && (
        <section className="section">
          <h2>Excedentes que reemplazan a un estudiante retirado</h2>
          <p className="muted">Solo con autorización de la Secretaría Regional Ministerial y aviso escrito a la Unidad de Pago. Desde la fecha indicada el estudiante genera subvención.</p>
          <form action={endSurplus} className="card" style={{ maxWidth: 560 }}>
            <input type="hidden" name="courseId" value={courseId} />
            <input type="hidden" name="mes" value={month} />
            <div className="field"><label htmlFor="surplusStudent">Estudiante</label><select id="surplusStudent" name="studentId">{surplus.map((r) => <option key={r.student.id} value={r.student.id}>{r.student.name}</option>)}</select></div>
            <div className="field"><label htmlFor="surplusDate">Genera subvención desde</label><input id="surplusDate" name="date" type="date" required /></div>
            <div className="field"><label htmlFor="resolution">Autorización y aviso (número y fecha)</label><input id="resolution" name="resolution" required minLength={5} maxLength={160} /></div>
            <button className="btn">Actualizar condición</button>
          </form>
        </section>
      )}
    </main>
  );
}
