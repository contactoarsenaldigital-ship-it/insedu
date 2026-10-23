import Link from "next/link";
import { redirect } from "next/navigation";
import { LEVELS, METRIC_LABEL, canRedeem, goalProgress, type CourseGoal } from "@insedu/domain";
import { courseById, fullName, school, studentById } from "@/lib/demo";
import { fmtDate, fmtDT } from "@/lib/format";
import { rewardsFor, rewardsState, summary } from "@/lib/rewards";
import { getSession } from "@/lib/session";
import { addGoal, addReward, approveRedemption, deliver, redeem, rejectRedemption, toggleReward } from "./actions";
import { readState } from "@/lib/state";

export const metadata = { title: "Refuerzos y recompensas" };
export const dynamic = "force-dynamic";

const STATUS_TAG = { pendiente: "media", aprobado: "ok", entregado: "ok", rechazado: "alta" } as const;

function progressOf(goal: CourseGoal) {
  const s = school();
  const ids = new Set(s.students.filter((x) => x.courseId === goal.courseId).map((x) => x.id));
  return goalProgress(goal, {
    attendance: s.attendance.filter((a) => ids.has(a.studentId)),
    positives: s.conduct.filter((c) => ids.has(c.studentId) && c.kind !== "negative"),
  });
}
const fmtGoal = (g: CourseGoal, v: number) => (g.metric === "anotaciones_positivas" ? String(v) : `${Math.round(v * 1000) / 10} %`.replace(".", ","));

export default async function RewardsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await readState();
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/refuerzos");
  const { person, scope } = session;
  const msgs = (
    <>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}
    </>
  );

  if (person.roles.includes("student")) return <main className="wrap">{msgs}<StudentRewards studentId={person.id} canRedeemNow /></main>;
  if (person.wards?.length) {
    return (
      <main className="wrap">
        <span className="muted">{person.name}</span>
        {msgs}
        <StudentRewards studentId={person.wards[0]!} />
      </main>
    );
  }
  if (scope.headOfCourseIds.length) return <main className="wrap">{msgs}<HeadTeacherRewards courseIds={scope.headOfCourseIds} name={person.name} /></main>;
  return (
    <main className="wrap" style={{ maxWidth: 720 }}>
      <h1>Refuerzos y recompensas</h1>
      <p className="notice">Los canjes y metas los gestiona el profesor jefe de cada curso. Los docentes refuerzan registrando anotaciones positivas y felicitaciones en el libro de clases.</p>
    </main>
  );
}

// ───────────────────────────── Estudiante / apoderado ─────────────────────────────

function StudentRewards({ studentId, canRedeemNow = false }: { studentId: string; canRedeemNow?: boolean }) {
  const st = studentById(studentId)!;
  const sum = summary(studentId);
  const state = rewardsState();
  const goals = state.goals.filter((g) => g.courseId === st.courseId);
  const catalog = rewardsFor(st.courseId).filter((r) => r.active);
  const lvl = sum.level;
  return (
    <>
      <span className="muted">{courseById(st.courseId)?.name}</span>
      <h1>{canRedeemNow ? `Tus logros, ${st.firstName}` : `Logros de ${st.firstName}`}</h1>
      <div className="grid section">
        <div className="card level-card">
          <span className="eyebrow">Nivel</span>
          <span className="kpi">{lvl.name}</span>
          <div className="bar" aria-label={`Avance al siguiente nivel: ${Math.round(lvl.progress * 100)} %`}><i style={{ width: `${Math.round(lvl.progress * 100)}%` }} /></div>
          <span className="muted">{lvl.nextName ? `${lvl.toNext} puntos para llegar a ${lvl.nextName}` : "Nivel máximo alcanzado"}</span>
        </div>
        <div className="card">
          <span className="eyebrow">Puntos disponibles</span>
          <span className="kpi">{sum.balance}</span>
          <span className="muted">Ganados en total: {sum.earned}. Canjear no baja tu nivel.</span>
        </div>
        <div className="card">
          <span className="eyebrow">Insignias</span>
          <span className="kpi">{sum.badges.length}</span>
          <span className="muted">{sum.badges.map(badgeLabel).join(" · ") || "Aún sin insignias"}</span>
        </div>
      </div>

      {goals.map((g) => {
        const p = progressOf(g);
        return (
          <section key={g.id} className="section">
            <h2>Meta del curso</h2>
            <div className="card">
              <span className="eyebrow">{METRIC_LABEL[g.metric]} · {fmtDate(g.from)} a {fmtDate(g.to)}</span>
              <h3>{g.title}</h3>
              <div className="bar"><i style={{ width: `${Math.round(p.ratio * 100)}%` }} /></div>
              <span className="muted">{fmtGoal(g, p.value)} de {fmtGoal(g, g.target)} · Si lo logramos: {g.reward}</span>
              {p.achieved && <span className="tag ok">✓ ¡Meta lograda por el curso!</span>}
            </div>
          </section>
        );
      })}

      <section className="section">
        <h2>Recompensas</h2>
        <div className="grid">
          {catalog.map((r) => {
            const issues = canRedeem(studentId, r, state.ledger, state.redemptions, new Date(), st.courseId);
            return (
              <form key={r.id} action={redeem} className="card">
                <input type="hidden" name="rewardId" value={r.id} />
                <span className="eyebrow">{r.cost} puntos{r.stock !== null ? ` · quedan ${r.stock}` : ""}{r.courseId ? " · de tu curso" : ""}</span>
                <h3>{r.name}</h3>
                <span className="muted">{r.description}</span>
                {canRedeemNow && (issues.length ? <span className="muted" style={{ fontSize: ".85rem" }}>{issues[0]}</span> : <button className="btn primary small">Canjear</button>)}
              </form>
            );
          })}
        </div>
      </section>

      {sum.redemptions.length > 0 && (
        <section className="section">
          <h2>Solicitudes de canje</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Fecha</th><th>Recompensa</th><th>Puntos</th><th>Estado</th></tr></thead>
              <tbody>
                {sum.redemptions.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDT(r.at)}</td>
                    <td>{state.rewards.find((x) => x.id === r.rewardId)?.name}</td>
                    <td>{r.cost}</td>
                    <td><span className={`tag ${STATUS_TAG[r.status]}`}>{r.status}</span>{r.note ? <span className="muted"> · {r.note}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="section">
        <h2>Últimos reconocimientos</h2>
        <ul className="recognitions">
          {sum.recent.map((e) => (
            <li key={e.id}>
              <span className="tag ok">+{e.points}</span> {e.message} <span className="muted">· {fmtDT(e.at)}</span>
            </li>
          ))}
        </ul>
        <p className="muted">Los puntos se ganan por llegar a tiempo, mantener la asistencia, mejorar y recibir anotaciones positivas. Nunca se descuentan.</p>
      </section>
    </>
  );
}

function badgeLabel(b: string) {
  if (b.startsWith("constancia-")) return `Constancia ${b.slice(11)} días`;
  if (b === "felicitacion") return "Felicitación";
  return b;
}

// ───────────────────────────── Profesor jefe ─────────────────────────────

function HeadTeacherRewards({ courseIds, name }: { courseIds: string[]; name: string }) {
  const state = rewardsState();
  const studentsIn = new Set(school().students.filter((s) => courseIds.includes(s.courseId)).map((s) => s.id));
  const requests = state.redemptions.filter((r) => studentsIn.has(r.studentId)).sort((a, b) => b.at.localeCompare(a.at));
  const pending = requests.filter((r) => r.status === "pendiente");
  const approved = requests.filter((r) => r.status === "aprobado");
  const courseId = courseIds[0]!;
  const course = courseById(courseId)!;
  const ranking = school()
    .students.filter((s) => s.courseId === courseId)
    .map((s) => ({ s, sum: summary(s.id) }))
    .sort((a, b) => b.sum.earned - a.sum.earned);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const in5 = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);

  return (
    <>
      <span className="muted">Profesor jefe · {name} · {course.name}</span>
      <h1>Refuerzos del curso</h1>

      <section className="section">
        <h2>Canjes por revisar ({pending.length})</h2>
        {!pending.length && <p className="muted">No hay solicitudes pendientes.</p>}
        <div className="grid">
          {pending.map((r) => {
            const st = studentById(r.studentId)!;
            const rw = state.rewards.find((x) => x.id === r.rewardId);
            return (
              <form key={r.id} action={approveRedemption} className="card">
                <input type="hidden" name="id" value={r.id} />
                <span className="eyebrow">{fmtDT(r.at)} · {r.cost} puntos</span>
                <h3>{fullName(st)}</h3>
                <span>{rw?.name}</span>
                <input name="note" placeholder="Mensaje al estudiante (obligatorio si rechaza)" aria-label="Mensaje" className="note-input" />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn small">Aprobar</button>
                  <button className="btn secondary small" formAction={rejectRedemption}>Rechazar</button>
                </div>
              </form>
            );
          })}
        </div>
        {approved.length > 0 && (
          <>
            <h3 style={{ marginTop: 16 }}>Aprobados por entregar</h3>
            <div className="grid">
              {approved.map((r) => (
                <form key={r.id} action={deliver} className="card">
                  <input type="hidden" name="id" value={r.id} />
                  <strong>{fullName(studentById(r.studentId)!)}</strong>
                  <span>{state.rewards.find((x) => x.id === r.rewardId)?.name}</span>
                  <button className="btn secondary small">Marcar entregado</button>
                </form>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="section">
        <h2>Metas cooperativas</h2>
        <div className="grid">
          {state.goals.filter((g) => courseIds.includes(g.courseId)).map((g) => {
            const p = progressOf(g);
            return (
              <div key={g.id} className="card">
                <span className="eyebrow">{METRIC_LABEL[g.metric]} · {fmtDate(g.from)} a {fmtDate(g.to)}</span>
                <h3>{g.title}</h3>
                <div className="bar"><i style={{ width: `${Math.round(p.ratio * 100)}%` }} /></div>
                <span className="muted">{fmtGoal(g, p.value)} de {fmtGoal(g, g.target)} · {g.reward}</span>
                {p.achieved && <span className="tag ok">✓ Lograda</span>}
              </div>
            );
          })}
        </div>
        <form action={addGoal} className="card" style={{ marginTop: 12 }}>
          <input type="hidden" name="courseId" value={courseId} />
          <div className="grid">
            <div className="field"><label htmlFor="gtitle">Meta</label><input id="gtitle" name="title" required placeholder="Todos a la hora esta semana" /></div>
            <div className="field">
              <label htmlFor="metric">Indicador</label>
              <select id="metric" name="metric">
                <option value="asistencia">Asistencia del curso (%)</option>
                <option value="puntualidad">Llegadas a tiempo (%)</option>
                <option value="anotaciones_positivas">Anotaciones positivas (cantidad)</option>
              </select>
            </div>
            <div className="field"><label htmlFor="target">Objetivo</label><input id="target" name="target" inputMode="decimal" required defaultValue="95" /></div>
          </div>
          <div className="grid">
            <div className="field"><label htmlFor="from">Desde</label><input id="from" name="from" type="date" required defaultValue={today} /></div>
            <div className="field"><label htmlFor="to">Hasta</label><input id="to" name="to" type="date" required defaultValue={in5} /></div>
            <div className="field"><label htmlFor="greward">Recompensa colectiva</label><input id="greward" name="reward" required placeholder="Clase al aire libre" /></div>
          </div>
          <button className="btn">Crear meta del curso</button>
        </form>
      </section>

      <section className="section">
        <h2>Catálogo de recompensas</h2>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Recompensa</th><th>Puntos</th><th>Unidades</th><th>Alcance</th><th></th></tr></thead>
            <tbody>
              {rewardsFor(courseId).map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong><br /><span className="muted">{r.description}</span></td>
                  <td>{r.cost}</td>
                  <td>{r.stock ?? "Sin límite"}</td>
                  <td>{r.courseId ? "Curso" : "Establecimiento"}</td>
                  <td>
                    {r.courseId && (
                      <form action={toggleReward}><input type="hidden" name="id" value={r.id} /><button className="btn secondary small">{r.active ? "Pausar" : "Activar"}</button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={addReward} className="card" style={{ marginTop: 12 }}>
          <input type="hidden" name="courseId" value={courseId} />
          <div className="grid">
            <div className="field"><label htmlFor="rname">Nueva recompensa del curso</label><input id="rname" name="name" required placeholder="Elegir el juego de la última hora" /></div>
            <div className="field"><label htmlFor="cost">Puntos</label><input id="cost" name="cost" inputMode="numeric" required defaultValue="30" /></div>
            <div className="field"><label htmlFor="stock">Unidades (vacío = sin límite)</label><input id="stock" name="stock" inputMode="numeric" /></div>
          </div>
          <div className="field"><label htmlFor="rdesc">Descripción</label><input id="rdesc" name="description" /></div>
          <button className="btn">Agregar recompensa</button>
        </form>
      </section>

      <section className="section">
        <h2>Puntos del curso</h2>
        <p className="muted">Vista interna del profesor jefe. Los estudiantes ven su propio avance y el ranking de mejora, no la lista de puntos de sus compañeros. <Link href="/panel/profesor-jefe">Ver ranking de progreso</Link></p>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Estudiante</th><th>Nivel</th><th>Ganados</th><th>Disponibles</th></tr></thead>
            <tbody>
              {ranking.map(({ s, sum }) => (
                <tr key={s.id}><td>{fullName(s)}</td><td>{sum.level.name}</td><td>{sum.earned}</td><td>{sum.balance}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">Niveles: {LEVELS.map((l) => `${l.name} (${l.min})`).join(" · ")}</p>
      </section>
    </>
  );
}
