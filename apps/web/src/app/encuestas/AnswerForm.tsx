"use client";
import { useActionState, useState } from "react";
import { SCALE_LABELS, type Answers, type Question } from "@insedu/domain";
import { answerSurvey, type AnswerState } from "./actions";

/** Formulario para responder; las preguntas de compañeros limitan las elecciones al máximo. */
export function AnswerForm({ surveyId, questions, classmates, previous }: {
  surveyId: string;
  questions: Question[];
  classmates: { id: string; name: string }[];
  previous?: Answers;
}) {
  const [state, act, busy] = useActionState(answerSurvey, { answers: previous } as AnswerState);
  const initial = state.answers ?? previous ?? {};
  return (
    // La clave nueva tras un error remonta el formulario con lo ya elegido (React lo reinicia al enviar).
    <form key={state.attempt ?? 0} action={act} className="survey-form">
      <input type="hidden" name="surveyId" value={surveyId} />
      {state.issues?.length ? (
        <div className="notice warn" role="alert"><strong>Revise:</strong><ul style={{ margin: "6px 0 0" }}>{state.issues.map((i) => <li key={i}>{i}</li>)}</ul></div>
      ) : null}
      {questions.map((q, n) => (
        <fieldset key={q.id} className="card question">
          <legend>{n + 1}. {q.text}{!q.required && <span className="muted"> (opcional)</span>}</legend>
          {q.help && <p className="muted">{q.help}</p>}
          {q.type === "companeros" && <Classmates q={q} classmates={classmates} initial={(initial[q.id] as string[]) ?? []} />}
          {q.type === "escala" && (
            <div className="scale">
              {SCALE_LABELS.map((label, i) => (
                <label key={label} className="scale-option">
                  <input type="radio" name={q.id} value={i + 1} defaultChecked={initial[q.id] === i + 1} required={q.required} />
                  <span className="scale-value">{i + 1}</span>
                  <span className="scale-label">{label}</span>
                </label>
              ))}
            </div>
          )}
          {q.type === "opcion" && (
            <div className="choice-list">
              {q.options!.map((o) => (
                <label key={o} className="check"><input type="radio" name={q.id} value={o} defaultChecked={initial[q.id] === o} required={q.required} />{o}</label>
              ))}
            </div>
          )}
          {q.type === "texto" && <textarea name={q.id} maxLength={1000} defaultValue={(initial[q.id] as string) ?? ""} required={q.required} aria-label={q.text} />}
        </fieldset>
      ))}
      <button className="btn primary" disabled={busy}>Enviar respuestas</button>
    </form>
  );
}

function Classmates({ q, classmates, initial }: { q: Question; classmates: { id: string; name: string }[]; initial: string[] }) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const max = q.max ?? 3;
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < max ? [...c, id] : c));
  return (
    <>
      <p className="muted" aria-live="polite">Elegidos: {chosen.length} de {max}</p>
      <div className="classmates">
        {classmates.map((c) => (
          <label key={c.id} className={`check mate${chosen.includes(c.id) ? " on" : ""}`}>
            <input type="checkbox" name={q.id} value={c.id} checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} disabled={!chosen.includes(c.id) && chosen.length >= max} />
            {c.name}
          </label>
        ))}
      </div>
    </>
  );
}
