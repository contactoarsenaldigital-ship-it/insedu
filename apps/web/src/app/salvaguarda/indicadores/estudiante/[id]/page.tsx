import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatRut, NUTRITION_LABEL } from "@insedu/domain";
import { IndicatorBars } from "@/components/RiskCharts";
import { Breadcrumb, FactorChips, PriorityTag, RISK_DISCLAIMER, RiskNoAccess, TrendTag } from "@/components/RiskBits";
import { fmtDate } from "@/lib/format";
import { nutritionOf, profile } from "@/lib/health";
import { canSeeRiskboard, LEVEL_GROUPS, riskboard, riskRules, type LevelGroup } from "@/lib/riskboard";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { vault } from "@/lib/vault";

export const metadata = { title: "Estudiante · Tablero de Salvaguarda" };
export const dynamic = "force-dynamic";

const dec = (v: number) => v.toFixed(1).replace(".", ",");

export default async function StudentRisk({ params }: { params: Promise<{ id: string }> }) {
  await readState();
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=/salvaguarda/indicadores/estudiante/${id}`);
  if (!canSeeRiskboard(session)) return <RiskNoAccess />;

  const rb = riskboard();
  const RISK_RULES = riskRules();
  const row = rb.rows.find((r) => r.student.id === id);
  if (!row) notFound();
  const { student: st, course, risk, indicators } = row;
  const group = (Object.keys(LEVEL_GROUPS) as LevelGroup[]).find((g) => LEVEL_GROUPS[g].match(course))!;
  const labels = rb.periods.map((p) => p.from.slice(5).split("-").reverse().join("-"));
  const nutrition = nutritionOf(st.id);
  const hp = profile(st.id);
  // Solo metadatos del expediente: el contenido se descifra al abrir el caso, con verificación.
  const cases = vault().store.getAll("cases").filter((c) => (c as { studentId: string }).studentId === st.id) as { id: string; status: string }[];

  return (
    <main className="wrap">
      <Breadcrumb
        items={[
          { href: "/salvaguarda", label: "Salvaguarda" },
          { href: "/salvaguarda/indicadores", label: "Tablero" },
          { href: `/salvaguarda/indicadores?nivel=${group}`, label: LEVEL_GROUPS[group].label },
          { href: `/salvaguarda/indicadores/curso/${course.id}`, label: course.name },
          { label: `${st.firstName} ${st.lastName}` },
        ]}
      />
      <h1>{st.firstName} {st.lastName}</h1>
      <p className="muted">{course.name} · RUN {formatRut(st.rut)} · <PriorityTag risk={risk} /> · <TrendTag risk={risk} /></p>

      <div className="grid section">
        <div className="card">
          <span className="eyebrow">Factores del último mes</span>
          {risk.current.length ? <FactorChips risk={risk} reasons /> : <span className="muted">Sin factores de atención.</span>}
          {risk.repeatedConduct && <span className="muted">Anotaciones negativas en al menos dos de las tres últimas quincenas.</span>}
        </div>
        <div className="card">
          <span className="eyebrow">Estado nutricional · dato de salud sensible</span>
          {nutrition ? (
            <>
              <span className="kpi">{NUTRITION_LABEL[nutrition.status]}</span>
              <span className="muted">
                IMC {dec(nutrition.bmi)} · {Math.floor(nutrition.ageYears)} años · {hp.sex === "F" ? "femenino" : "masculino"} · medición de enfermería del {fmtDate(hp.updatedAt.slice(0, 10))}.
                Clasificación referencial de IMC para la edad (IOTF); en el piloto se usa la norma técnica de MINSAL.
              </span>
            </>
          ) : (
            <span className="muted">Sin peso y talla registrados en la ficha de salud.</span>
          )}
        </div>
        <div className="card">
          <span className="eyebrow">Expediente de Salvaguarda</span>
          {cases.length ? (
            cases.map((c) => <span key={c.id}>Caso {c.status} · <Link href={`/salvaguarda/caso/${c.id}`}>Abrir caso</Link></span>)
          ) : (
            <>
              <span className="muted">Sin casos abiertos.</span>
              <Link className="btn small" href={`/salvaguarda?estudiante=${st.id}#abrir-caso`}>Abrir un caso</Link>
            </>
          )}
        </div>
      </div>

      <section className="section">
        <h2>Acciones sugeridas</h2>
        {risk.actions.length ? (
          <ol className="actions-list">{risk.actions.map((a) => <li key={a}>{a}</li>)}</ol>
        ) : (
          <p className="muted">No hay acciones sugeridas: el estudiante no presenta factores de atención en el último mes.</p>
        )}
      </section>

      <section className="section">
        <h2>Evolución por quincena</h2>
        <div className="indicator-grid">
          <IndicatorBars title="Promedio de notas" values={indicators.map((i) => i.average)} labels={labels} max={7} threshold={RISK_RULES.minAverage} thresholdLabel={dec(RISK_RULES.minAverage)} isBad={(v) => v < RISK_RULES.minAverage} format={dec} />
          <IndicatorBars title="Anotaciones negativas" values={indicators.map((i) => i.negatives)} labels={labels} max={Math.max(4, ...indicators.map((i) => i.negatives))} threshold={2} thresholdLabel="2 por quincena" isBad={(v) => v >= 2} format={String} />
          <IndicatorBars title="Asistencia" values={indicators.map((i) => (i.attendance == null ? null : i.attendance * 100))} labels={labels} max={100} threshold={RISK_RULES.minAttendance * 100} thresholdLabel={`${Math.round(RISK_RULES.minAttendance * 100)} %`} isBad={(v) => v < RISK_RULES.minAttendance * 100} format={(v) => `${Math.round(v)}%`} />
          <IndicatorBars title="Atenciones de enfermería" values={indicators.map((i) => i.nurseVisits)} labels={labels} max={Math.max(3, ...indicators.map((i) => i.nurseVisits))} threshold={2} thresholdLabel="2 por quincena" isBad={(v) => v >= 2} format={String} />
        </div>
        <div className="table-scroll section">
          <table className="data">
            <thead><tr><th>Quincena</th><th>Promedio</th><th>Asignaturas bajo 4,0</th><th>Anotaciones negativas</th><th>Asistencia</th><th>Enfermería</th><th>Factores</th></tr></thead>
            <tbody>
              {indicators.map((ind, i) => (
                <tr key={rb.periods[i]!.from}>
                  <td>{rb.periods[i]!.label}</td>
                  <td>{ind.average == null ? "—" : dec(ind.average)}</td>
                  <td>{ind.failingSubjects}</td>
                  <td>{ind.negatives}{ind.serious ? ` (${ind.serious} grave)` : ""}</td>
                  <td>{ind.attendance == null ? "—" : `${Math.round(ind.attendance * 100)} %`}</td>
                  <td>{ind.nurseVisits}</td>
                  <td>{risk.perPeriod[i]!.length || "—"}</td>
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
