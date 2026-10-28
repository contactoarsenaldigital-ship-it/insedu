import Link from "next/link";
import { redirect } from "next/navigation";
import { RiskHistogram } from "@/components/RiskCharts";
import { Breadcrumb, FactorChips, PriorityTag, RISK_DISCLAIMER, RiskNoAccess, TrendTag } from "@/components/RiskBits";
import { canSeeRiskboard, LEVEL_GROUPS, riskboard, type LevelGroup, type StudentRow } from "@/lib/riskboard";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";

export const metadata = { title: "Tablero de indicadores · Salvaguarda" };
export const dynamic = "force-dynamic";

const fullName = (r: StudentRow) => `${r.student.lastName}, ${r.student.firstName}`;

export default async function RiskboardPage({ searchParams }: { searchParams: Promise<{ nivel?: string }> }) {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/salvaguarda/indicadores");
  if (!canSeeRiskboard(session)) return <RiskNoAccess />;

  const nivel = (await searchParams).nivel;
  const group: LevelGroup | null = nivel === "basica" || nivel === "media" ? nivel : null;
  const rb = riskboard();
  const inGroup = (r: StudentRow) => !group || LEVEL_GROUPS[group].match(r.course);
  const rows = rb.rows.filter(inGroup);
  const attention = rb.attention.filter(inGroup);
  const groups = (group ? [group] : (Object.keys(LEVEL_GROUPS) as LevelGroup[]));
  const scope = group ? LEVEL_GROUPS[group].label.toLowerCase() : "el establecimiento";

  return (
    <main className="wrap">
      <Breadcrumb items={[{ href: "/salvaguarda", label: "Salvaguarda" }, { label: "Tablero de indicadores" }]} />
      <h1>Estudiantes con puntos de atención</h1>
      <p className="muted">Último mes y evolución por quincena · {rb.periods[0]?.label.split(" a ")[0]} al {rb.periods.at(-1)?.label.split(" a ")[1]}. Vista exclusiva de quien ejerce como Encargado de Salvaguarda.</p>

      <nav className="tabs" aria-label="Nivel">
        <Link href="/salvaguarda/indicadores" aria-current={!group ? "page" : undefined}>Todos</Link>
        {(Object.keys(LEVEL_GROUPS) as LevelGroup[]).map((g) => (
          <Link key={g} href={`/salvaguarda/indicadores?nivel=${g}`} aria-current={group === g ? "page" : undefined}>{LEVEL_GROUPS[g].label}</Link>
        ))}
      </nav>

      <div className="grid">
        <Kpi label="Con algún factor" value={`${attention.length} de ${rows.length}`} />
        <Kpi label="Prioridad alta" value={String(attention.filter((r) => r.risk.priority === "alta").length)} />
        <Kpi label="Riesgo integral" value={String(attention.filter((r) => r.risk.pattern === "riesgo_integral").length)} hint="Rendimiento, conducta y salud" />
        <Kpi label="Conducta y rendimiento" value={String(attention.filter((r) => r.risk.pattern === "conducta_rendimiento").length)} hint="Conducta reiterada con notas bajas" />
      </div>

      <section className="section">
        <h2>Evolución en {scope}</h2>
        <RiskHistogram data={rb.histogramOf(rows)} caption={`Estudiantes con factores de atención por quincena en ${scope}`} />
      </section>

      {groups.map((g) => (
        <section key={g} className="section">
          <h2>{LEVEL_GROUPS[g].label}: cursos</h2>
          <div className="grid">
            {rb.coursesOf(g).map((c) => {
              const cr = rb.rows.filter((r) => r.course.id === c.id);
              const n = (p: string) => cr.filter((r) => r.risk.priority === p).length;
              return (
                <Link key={c.id} href={`/salvaguarda/indicadores/curso/${c.id}`} className="card">
                  <span className="eyebrow">{c.level}</span>
                  <h3>{c.name}</h3>
                  <span className="muted">{cr.filter((r) => r.risk.priority).length} de {cr.length} con factores · {n("alta")} alta · {n("media")} media · {n("seguimiento")} seguimiento</span>
                  <RiskHistogram data={rb.histogramOf(cr)} compact caption={`Evolución de ${c.name}`} />
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <section className="section">
        <h2>Requieren atención ({attention.length})</h2>
        <p className="muted">Ordenados por prioridad, patrón detectado, número de factores y tendencia.</p>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Estudiante</th><th>Curso</th><th>Prioridad</th><th>Factores del último mes</th><th>Tendencia</th><th>Primera acción sugerida</th></tr></thead>
            <tbody>
              {attention.map((r) => (
                <tr key={r.student.id}>
                  <td><Link href={`/salvaguarda/indicadores/estudiante/${r.student.id}`}><strong>{fullName(r)}</strong></Link></td>
                  <td>{r.course.name}</td>
                  <td><PriorityTag risk={r.risk} /></td>
                  <td><FactorChips risk={r.risk} /></td>
                  <td><TrendTag risk={r.risk} /></td>
                  <td className="muted">{r.risk.actions[0]}</td>
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

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <span className="eyebrow">{label}</span>
      <span className="kpi">{value}</span>
      {hint && <span className="muted">{hint}</span>}
    </div>
  );
}
