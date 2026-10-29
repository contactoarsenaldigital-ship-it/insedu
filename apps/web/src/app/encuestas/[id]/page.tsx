import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { analyzeSociogram, ATTENTION, SCALE_LABELS, STATUS_LABEL, STRONG_AUTH_WINDOW_MS, summarize, type SociometricStatus } from "@insedu/domain";
import { Sociogram, STATUS_COLOR } from "@/components/Sociogram";
import { courseById, school } from "@/lib/demo";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { findPerson } from "@/lib/store";
import { canAnswer, canSeeResults, classmatesOf, eligibleCount, responseOf, responsesOf, surveyById, type Survey } from "@/lib/surveys";
import { AnswerForm } from "../AnswerForm";
import { toggleSurvey } from "../actions";

export const metadata = { title: "Encuesta" };
export const dynamic = "force-dynamic";

const SUGGESTION: Partial<Record<SociometricStatus, string>> = {
  aislado: "No recibió elecciones de sus compañeros. Conversar con la jefatura del curso, observar los recreos y armar grupos con compañeros afines.",
  rechazado: "Varios compañeros señalan dificultad para trabajar en equipo. Explorar las causas sin exponer a nadie y trabajar habilidades sociales en el curso.",
  controvertido: "Es muy elegido y también señalado. Puede tener un rol de liderazgo con roces; conviene conversar en privado.",
  sin_reciprocidad: "Elige y es elegido, pero sin vínculos mutuos. Favorecer trabajo en parejas con quienes lo eligen.",
};

export default async function SurveyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ enviada?: string; rechazos?: string }> }) {
  await readState();
  const { id } = await params;
  const sp = await searchParams;
  const s = await getSession();
  if (!s) redirect(`/ingresar?next=/encuestas/${id}`);
  const survey = surveyById(id);
  if (!survey) notFound();
  const me = s.person;
  const answering = canAnswer(me, survey);
  const results = canSeeResults(me, survey);
  if (!answering && !results) {
    return <main className="wrap"><h1>{survey.title}</h1><p className="notice warn">Esta encuesta no está disponible para su perfil.</p><p><Link href="/encuestas">Volver a encuestas</Link></p></main>;
  }

  return (
    <main className="wrap" style={{ maxWidth: results ? 1040 : 720 }}>
      <p className="muted"><Link href="/encuestas">Encuestas</Link> · {survey.kind === "sociometrica" ? `Encuesta de curso · ${courseById(survey.courseId!)?.name}` : survey.anonymous ? "Anónima" : "Encuesta"}</p>
      <h1>{survey.title}</h1>
      {survey.intro && <p>{survey.intro}</p>}
      {answering && <Answering survey={survey} meId={me.id} sent={!!sp.enviada} />}
      {results && (survey.kind === "sociometrica"
        ? <SociometricResults survey={survey} fresh={!!s.lastStrongAuthAt && Date.now() - new Date(s.lastStrongAuthAt).getTime() <= STRONG_AUTH_WINDOW_MS} showNegative={sp.rechazos === "1"} />
        : <GeneralResults survey={survey} />)}
    </main>
  );
}

function Answering({ survey, meId, sent }: { survey: Survey; meId: string; sent: boolean }) {
  const previous = responseOf(survey.id, meId);
  const classmates = survey.kind === "sociometrica" ? classmatesOf(meId).map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` })) : [];
  return (
    <section className="section">
      {sent && <p className="notice ok" role="status">¡Gracias! Guardamos sus respuestas. Puede corregirlas mientras la encuesta esté abierta.</p>}
      {survey.kind === "sociometrica" && (
        <p className="notice">Tus respuestas son <strong>confidenciales</strong>: solo las ve el equipo de convivencia del colegio. No las verán tus compañeros, ni tus profesores, ni se usan para poner notas o anotaciones. Puedes dejar en blanco las preguntas opcionales.</p>
      )}
      {survey.anonymous && <p className="notice">Encuesta anónima: los resultados se ven sin nombres.</p>}
      <AnswerForm surveyId={survey.id} questions={survey.questions} classmates={classmates} previous={previous?.answers} />
    </section>
  );
}

function Header({ survey }: { survey: Survey }) {
  const n = responsesOf(survey.id).length;
  const total = eligibleCount(survey);
  return (
    <div className="req-head" style={{ justifyContent: "space-between" }}>
      <span>
        <strong>{n}</strong> respuestas{total ? ` de ${total} (${Math.round((n / total) * 100)} %)` : ""} · creada por {findPerson(survey.createdBy)?.name ?? "—"} · <span className={`tag ${survey.status === "abierta" ? "ok" : ""}`}>{survey.status}</span>
      </span>
      <form action={toggleSurvey}>
        <input type="hidden" name="surveyId" value={survey.id} />
        <button className="btn secondary small">{survey.status === "abierta" ? "Cerrar encuesta" : "Reabrir encuesta"}</button>
      </form>
    </div>
  );
}

function SociometricResults({ survey, fresh, showNegative }: { survey: Survey; fresh: boolean; showNegative: boolean }) {
  if (!fresh) {
    return (
      <section className="section">
        <Header survey={survey} />
        <p className="notice warn section">Los resultados sociométricos son confidenciales. <Link href={`/verificar?next=${encodeURIComponent(`/encuestas/${survey.id}`)}`}>Verifique su identidad</Link> para verlos (la verificación dura 5 minutos).</p>
      </section>
    );
  }
  const students = school().students.filter((x) => x.courseId === survey.courseId).sort((a, b) => a.lastName.localeCompare(b.lastName, "es"));
  const result = analyzeSociogram(students.map((x) => x.id), responsesOf(survey.id), survey.questions);
  const labels = Object.fromEntries(students.map((x) => [x.id, `${x.firstName} ${x.lastName[0]}.`]));
  const fullName = Object.fromEntries(students.map((x) => [x.id, `${x.firstName} ${x.lastName}`]));
  const attention = result.students.filter((x) => ATTENTION.includes(x.status)).sort((a, b) => ATTENTION.indexOf(a.status) - ATTENTION.indexOf(b.status));
  const missing = result.students.filter((x) => !x.answered);
  const mutualPairs = result.positiveEdges.filter((e) => e.mutual).length / 2;
  const hasNegative = survey.questions.some((q) => q.valence === "negativa");

  return (
    <section className="section">
      <Header survey={survey} />
      <p className="notice section">Uso confidencial del equipo de convivencia. Los resultados son una fotografía del curso para orientar el acompañamiento y la formación de grupos; no se comparten con estudiantes ni se usan para sancionar. Consentimiento de las familias registrado el {new Date(survey.consent!.at).toLocaleDateString("es-CL")}.</p>

      <div className="grid section">
        <div className="card"><span className="eyebrow">Respondieron</span><h3>{result.respondents} de {students.length}</h3></div>
        <div className="card"><span className="eyebrow">Parejas recíprocas</span><h3>{mutualPairs}</h3><span className="muted">Cohesión {(result.cohesion * 100).toFixed(1).replace(".", ",")} %</span></div>
        <div className="card"><span className="eyebrow">Requieren atención</span><h3>{attention.length}</h3></div>
      </div>

      <h2 className="section">Sociograma</h2>
      <p className="muted">Cada punto es un estudiante; su tamaño indica cuántas veces fue elegido. Las líneas gruesas son elecciones mutuas; las flechas, elecciones de una sola vía. Contorno punteado: no respondió.</p>
      {hasNegative && (
        <p><Link href={`/encuestas/${survey.id}${showNegative ? "" : "?rechazos=1"}`}>{showNegative ? "Ocultar" : "Mostrar"} las menciones de «me cuesta trabajar con…»</Link></p>
      )}
      <div className="sociogram-wrap">
        <Sociogram result={result} labels={labels} showNegative={showNegative} />
        <ul className="legend">
          {(Object.keys(STATUS_COLOR) as SociometricStatus[]).filter((k) => k !== "sin_datos").map((k) => (
            <li key={k}><span className="dot" style={{ background: STATUS_COLOR[k] }} />{STATUS_LABEL[k]}</li>
          ))}
        </ul>
      </div>

      <h2 className="section">Estudiantes que requieren atención</h2>
      {attention.length === 0 ? <p className="muted">Ninguno según los criterios actuales.</p> : (
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Estudiante</th><th>Situación</th><th>Elegido por</th><th>Mutuas</th>{hasNegative && <th>Menciones de dificultad</th>}<th>Sugerencia</th></tr></thead>
            <tbody>
              {attention.map((x) => (
                <tr key={x.id}>
                  <td>{fullName[x.id]}{!x.answered && <><br /><span className="muted">no respondió</span></>}</td>
                  <td><span className="dot" style={{ background: STATUS_COLOR[x.status] }} /> {STATUS_LABEL[x.status]}</td>
                  <td>{x.positive}</td>
                  <td>{x.mutual}</td>
                  {hasNegative && <td>{x.negative}</td>}
                  <td>{SUGGESTION[x.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="section">
        <summary>Detalle de todo el curso ({students.length} estudiantes)</summary>
        <div className="table-scroll" style={{ marginTop: 12 }}>
          <table className="data">
            <thead><tr><th>Estudiante</th><th>Elegido por</th><th>Mutuas</th><th>Mejor amigo de</th>{hasNegative && <th>Dificultad</th>}<th>Situación</th></tr></thead>
            <tbody>
              {[...result.students].sort((a, b) => b.positive - a.positive).map((x) => (
                <tr key={x.id}>
                  <td>{fullName[x.id]}</td><td>{x.positive}</td><td>{x.mutual}</td>
                  <td>{x.bestFriendOf}{x.bestFriendMutual ? " · recíproca" : ""}</td>
                  {hasNegative && <td>{x.negative}</td>}
                  <td>{STATUS_LABEL[x.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">Criterios: muy elegido desde {result.thresholds.popular} elecciones; señalado desde {result.thresholds.rejected} menciones de dificultad (15 % de quienes respondieron, mínimo 2).</p>
      </details>

      {missing.length > 0 && <p className="muted section">Aún no responden: {missing.map((x) => fullName[x.id]).join(", ")}.</p>}
    </section>
  );
}

function GeneralResults({ survey }: { survey: Survey }) {
  const answers = responsesOf(survey.id).map((r) => r.answers);
  return (
    <section className="section">
      <Header survey={survey} />
      {survey.questions.map((q, i) => {
        const sm = summarize(q, answers);
        return (
          <article key={q.id} className="card section">
            <h3 style={{ fontSize: "1.05rem" }}>{i + 1}. {q.text}</h3>
            <span className="muted">{sm.count} respuestas</span>
            {sm.type === "escala" && (
              <>
                <p>Promedio: <strong>{sm.average == null ? "—" : sm.average.toFixed(1).replace(".", ",")}</strong> de 5</p>
                <Bars rows={sm.distribution.map((n, k) => ({ label: `${k + 1} · ${SCALE_LABELS[k]}`, n }))} total={sm.count} />
              </>
            )}
            {sm.type === "opcion" && <Bars rows={sm.counts.map((c) => ({ label: c.option, n: c.n }))} total={sm.count} />}
            {sm.type === "texto" && (sm.texts.length ? <ul className="answers">{sm.texts.slice(0, 50).map((t, k) => <li key={k}>{t}</li>)}</ul> : <p className="muted">Sin respuestas.</p>)}
          </article>
        );
      })}
    </section>
  );
}

function Bars({ rows, total }: { rows: { label: string; n: number }[]; total: number }) {
  return (
    <ul className="result-bars">
      {rows.map((r) => {
        const pct = total ? Math.round((r.n / total) * 100) : 0;
        return (
          <li key={r.label}>
            <span>{r.label}</span>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            <span className="muted">{r.n} · {pct} %</span>
          </li>
        );
      })}
    </ul>
  );
}
