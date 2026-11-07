import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fold, formatRut, missingEnrollmentData, normalizeRut, parseRut } from "@insedu/domain";
import { DownloadLinks } from "@/components/DownloadLinks";
import { courseById, fullName, school, studentById } from "@/lib/demo";
import { canManageEnrollment, enrollmentSummary, ensureEnrollments } from "@/lib/matricula";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { filterEnrollment } from "./actions";

export const metadata = { title: "Registro de matrícula" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function Enrollment({ searchParams }: { searchParams: Promise<{ nivel?: string; estado?: string; ok?: string; error?: string }> }) {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/matricula");
  if (!canManageEnrollment(session)) {
    return <main className="wrap"><h1>Registro de matrícula</h1><p className="notice warn">Solo administración y dirección acceden al registro de matrícula. Ingrese, por ejemplo, como Daniela Castro.</p></main>;
  }
  const sp = await searchParams;
  const summary = enrollmentSummary();
  const search = (await cookies()).get("insedu_matricula_q")?.value ?? "";
  const q = fold(search);
  const qRut = normalizeRut(search);
  const rows = ensureEnrollments()
    .map((r) => ({ r, st: studentById(r.id) }))
    .filter((x) => !!x.st)
    .filter(({ r, st }) => {
      if (sp.nivel && r.level !== sp.nivel) return false;
      if (sp.estado === "bajas" && !r.withdrawal) return false;
      if (sp.estado === "incompletas" && (r.withdrawal || !missingEnrollmentData(r).length)) return false;
      return !q || fold(fullName(st!)).includes(q) || st!.rut.includes(qRut);
    })
    .sort((a, b) => a.r.level.localeCompare(b.r.level, "es") || a.r.number - b.r.number);
  const shown = rows.slice(0, PAGE_SIZE);

  return (
    <main className="wrap" style={{ maxWidth: 1100 }}>
      <span className="muted">{school().name} · RBD {school().rbd}</span>
      <h1>Registro general de matrícula</h1>
      <p>Es requisito para usar el libro de clases digital. Cada alta, cambio y baja queda en la bitácora.</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}

      <div className="import-counts">
        <div><strong>{summary.total}</strong><span>Matriculados en el año</span></div>
        <div><strong>{summary.withdrawn}</strong><span>Bajas</span></div>
        <div><strong>{summary.effective}</strong><span>Matrícula efectiva</span></div>
        <div><strong>{summary.incomplete}</strong><span>Fichas con datos faltantes</span></div>
      </div>
      {summary.mismatches.length === 0
        ? <p className="notice ok">La matrícula efectiva coincide con los cursos en todos los niveles.</p>
        : <div className="notice warn" role="alert"><strong>El registro no cuadra:</strong><ul style={{ margin: "6px 0 0" }}>{summary.mismatches.map((m) => <li key={m}>{m}</li>)}</ul></div>}

      <div className="req-actions section" style={{ justifyContent: "space-between" }}>
        <form action={filterEnrollment} className="req-actions" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0 }}><label htmlFor="q">Buscar por nombre o RUN</label><input id="q" name="q" defaultValue={search} /></div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="nivel">Nivel</label>
            <select id="nivel" name="nivel" defaultValue={sp.nivel ?? ""}>
              <option value="">Todos</option>
              {summary.byLevel.map((l) => <option key={l.level} value={l.level}>{l.level}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="estado">Mostrar</label>
            <select id="estado" name="estado" defaultValue={sp.estado ?? ""}>
              <option value="">Todas las fichas</option>
              <option value="incompletas">Con datos faltantes</option>
              <option value="bajas">Bajas</option>
            </select>
          </div>
          <button className="btn secondary">Filtrar</button>
        </form>
        <div className="req-actions" style={{ alignItems: "center" }}>
          <DownloadLinks tipo="matricula" caption="Registro" />
          <Link className="btn primary" href="/matricula/nueva">Registrar alta</Link>
        </div>
      </div>

      <div className="table-scroll section">
        <table className="data">
          <thead><tr><th>Nivel</th><th>N°</th><th>RUN o IPE</th><th>Estudiante</th><th>Curso</th><th>Matrícula</th><th>Estado</th></tr></thead>
          <tbody>
            {shown.map(({ r, st }) => {
              const missing = missingEnrollmentData(r).length;
              return (
                <tr key={r.id}>
                  <td>{r.level}</td>
                  <td>{r.number}</td>
                  <td>{parseRut(st!.rut) ? formatRut(st!.rut) : st!.rut}</td>
                  <td><Link href={`/matricula/${r.id}`}>{st!.lastName}, {st!.firstName}</Link></td>
                  <td>{courseById(st!.courseId)?.name}</td>
                  <td>{r.enrolledOn ?? "—"}</td>
                  <td>
                    {r.withdrawal ? <span className="tag alta">Baja {r.withdrawal.date}</span>
                      : missing ? <span className="tag media">Faltan {missing} dato{missing > 1 ? "s" : ""}</span>
                      : <span className="tag ok">Completa</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted">No hay fichas con ese filtro.</p>}
      {rows.length > shown.length && <p className="muted">Se muestran {shown.length} de {rows.length}. Use el buscador o el filtro de nivel; la planilla incluye todas.</p>}
    </main>
  );
}
