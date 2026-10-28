import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RiskHistogram } from "@/components/RiskCharts";
import { Breadcrumb, FactorChips, PriorityTag, RISK_DISCLAIMER, RiskNoAccess, TrendTag } from "@/components/RiskBits";
import { canSeeRiskboard, LEVEL_GROUPS, riskboard, type LevelGroup } from "@/lib/riskboard";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";

export const metadata = { title: "Curso · Tablero de Salvaguarda" };
export const dynamic = "force-dynamic";

const PRIORITY = { alta: 0, media: 1, seguimiento: 2 } as const;

export default async function CourseRisk({ params }: { params: Promise<{ id: string }> }) {
  await readState();
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=/salvaguarda/indicadores/curso/${id}`);
  if (!canSeeRiskboard(session)) return <RiskNoAccess />;

  const rb = riskboard();
  const rows = rb.rows.filter((r) => r.course.id === id);
  if (!rows.length) notFound();
  const course = rows[0]!.course;
  const group = (Object.keys(LEVEL_GROUPS) as LevelGroup[]).find((g) => LEVEL_GROUPS[g].match(course))!;
  // Todos los estudiantes: primero los que requieren atención, luego el resto en orden alfabético.
  const sorted = [...rows].sort(
    (a, b) =>
      (a.risk.priority ? PRIORITY[a.risk.priority] : 9) - (b.risk.priority ? PRIORITY[b.risk.priority] : 9) ||
      b.risk.current.length - a.risk.current.length ||
      a.student.lastName.localeCompare(b.student.lastName, "es"),
  );

  return (
    <main className="wrap">
      <Breadcrumb
        items={[
          { href: "/salvaguarda", label: "Salvaguarda" },
          { href: "/salvaguarda/indicadores", label: "Tablero" },
          { href: `/salvaguarda/indicadores?nivel=${group}`, label: LEVEL_GROUPS[group].label },
          { label: course.name },
        ]}
      />
      <h1>{course.name}</h1>
      <p className="muted">{rows.filter((r) => r.risk.priority).length} de {rows.length} estudiantes con factores de atención en el último mes.</p>

      <section className="section">
        <h2>Evolución del curso</h2>
        <RiskHistogram data={rb.histogramOf(rows)} caption={`Estudiantes de ${course.name} con factores de atención por quincena`} />
      </section>

      <section className="section">
        <h2>Estudiantes</h2>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Estudiante</th><th>Prioridad</th><th>Factores del último mes</th><th>Tendencia</th></tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.student.id}>
                  <td><Link href={`/salvaguarda/indicadores/estudiante/${r.student.id}`}>{r.student.lastName}, {r.student.firstName}</Link></td>
                  <td><PriorityTag risk={r.risk} /></td>
                  <td>{r.risk.current.length ? <FactorChips risk={r.risk} /> : <span className="muted">—</span>}</td>
                  <td><TrendTag risk={r.risk} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="notice">{RISK_DISCLAIMER}</p>
    </main>
  );
}
