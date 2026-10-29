import Link from "next/link";
import { redirect } from "next/navigation";
import { courseById } from "@/lib/demo";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { findPerson } from "@/lib/store";
import { canAnswer, canCreate, canSeeResults, eligibleCount, responseOf, responsesOf, surveyState, type Survey } from "@/lib/surveys";

export const metadata = { title: "Encuestas" };
export const dynamic = "force-dynamic";

const AUDIENCE = { estudiantes: "Estudiantes", apoderados: "Apoderados", funcionarios: "Funcionarios" } as const;

export default async function Surveys() {
  await readState();
  const s = await getSession();
  if (!s) redirect("/ingresar?next=/encuestas");
  const me = s.person;
  const all = surveyState().surveys;
  const toAnswer = all.filter((x) => canAnswer(me, x));
  const mine = all.filter((x) => canSeeResults(me, x));
  const creates = canCreate(me, "general") || canCreate(me, "sociometrica");

  return (
    <main className="wrap" style={{ maxWidth: 960 }}>
      <h1>Encuestas</h1>

      {toAnswer.length > 0 && (
        <section className="section">
          <h2>Para responder</h2>
          <div className="grid">
            {toAnswer.map((x) => {
              const done = !!responseOf(x.id, me.id);
              return (
                <Link key={x.id} href={`/encuestas/${x.id}`} className="card">
                  <span className="eyebrow">{x.kind === "sociometrica" ? "Encuesta de curso" : x.anonymous ? "Anónima" : "Encuesta"}</span>
                  <h3>{x.title}</h3>
                  <span className={`tag ${done ? "ok" : "media"}`}>{done ? "Respondida · puede corregirla" : "Pendiente"}</span>
                  <span className="go">{done ? "Ver mis respuestas" : "Responder"} →</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {(creates || mine.length > 0) && (
        <section className="section">
          <div className="req-head" style={{ justifyContent: "space-between" }}>
            <h2>Resultados</h2>
            {creates && <Link className="btn primary small" href="/encuestas/nueva">Nueva encuesta</Link>}
          </div>
          {mine.length === 0 ? <p className="muted">Todavía no hay encuestas con resultados para usted.</p> : (
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>Encuesta</th><th>Tipo</th><th>Para</th><th>Respuestas</th><th>Estado</th></tr></thead>
                <tbody>{mine.map((x) => <Row key={x.id} x={x} />)}</tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {toAnswer.length === 0 && !creates && mine.length === 0 && <p className="notice">No tiene encuestas pendientes.</p>}
    </main>
  );
}

function Row({ x }: { x: Survey }) {
  const n = responsesOf(x.id).length;
  const total = eligibleCount(x);
  return (
    <tr>
      <td><Link href={`/encuestas/${x.id}`}><strong>{x.title}</strong></Link><br /><span className="muted">Creada por {findPerson(x.createdBy)?.name ?? "—"}</span></td>
      <td>{x.kind === "sociometrica" ? <span className="tag alta">Sociométrica · confidencial</span> : x.anonymous ? "General · anónima" : "General"}</td>
      <td>{AUDIENCE[x.audience]}{x.courseId ? ` de ${courseById(x.courseId)?.name}` : x.audience !== "funcionarios" ? " de todo el colegio" : ""}</td>
      <td>{n}{total ? ` de ${total} (${Math.round((n / total) * 100)} %)` : ""}</td>
      <td><span className={`tag ${x.status === "abierta" ? "ok" : ""}`}>{x.status}</span></td>
    </tr>
  );
}
