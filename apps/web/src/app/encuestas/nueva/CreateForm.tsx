"use client";
import { Fragment, useActionState, useState } from "react";
import type { Question } from "@insedu/domain";
import { createSurveyAction, type CreateState } from "../actions";

export function CreateForm({ kinds, courses, sociometric, consentText }: {
  kinds: ("general" | "sociometrica")[];
  courses: { id: string; name: string }[];
  sociometric: Question[];
  consentText: string;
}) {
  const [state, act, busy] = useActionState(createSurveyAction, {} as CreateState);
  const [kind, setKind] = useState(kinds[0]!);
  const [audience, setAudience] = useState("estudiantes");
  const [rows, setRows] = useState(3);
  const [types, setTypes] = useState<Record<number, string>>({});

  return (
    <form action={act} className="card">
      {state.error && <p className="notice warn" role="alert">{state.error}</p>}
      {kinds.length > 1 && (
        <fieldset className="field">
          <legend>Tipo de encuesta</legend>
          <label className="check"><input type="radio" name="kind" value="general" checked={kind === "general"} onChange={() => setKind("general")} />General (escala, opciones o respuesta libre)</label>
          <label className="check"><input type="radio" name="kind" value="sociometrica" checked={kind === "sociometrica"} onChange={() => setKind("sociometrica")} />Sociométrica de curso (relaciones entre compañeros)</label>
        </fieldset>
      )}
      {kinds.length === 1 && <input type="hidden" name="kind" value={kind} />}

      <div className="field"><label htmlFor="title">Título</label><input id="title" name="title" required minLength={5} maxLength={120} defaultValue={kind === "sociometrica" ? "Convivencia en el curso" : ""} key={kind} /></div>
      <div className="field"><label htmlFor="intro">Presentación para quienes responden</label><textarea id="intro" name="intro" maxLength={600} key={`i${kind}`} defaultValue={kind === "sociometrica" ? "Queremos conocer cómo te llevas con tu curso para armar mejores grupos de trabajo y acompañarte. Tus respuestas son confidenciales: solo las ve el equipo de convivencia." : ""} /></div>

      {kind === "sociometrica" ? (
        <Fragment key="sociometrica">
          <div className="field">
            <label htmlFor="courseId">Curso</label>
            <select id="courseId" name="courseId" required defaultValue="">
              <option value="" disabled>Seleccione…</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <fieldset className="field">
            <legend>Preguntas</legend>
            {sociometric.map((q) => (
              <label key={q.id} className="check">
                <input type="checkbox" name="optional" value={q.id} defaultChecked disabled={q.required} />
                {q.text} <span className="muted">({q.required ? "obligatoria" : "opcional"}{q.valence === "negativa" ? ", formulada sin exponer a nadie" : ""})</span>
              </label>
            ))}
            <p className="muted">Por resguardo de los estudiantes no se pregunta a quién sacarían del curso. Las preguntas se responden eligiendo compañeros de una lista.</p>
          </fieldset>
          <label className="check consent">
            <input type="checkbox" name="consent" value="1" required />
            {consentText}
          </label>
        </Fragment>
      ) : (
        <Fragment key="general">
          <div className="field">
            <label htmlFor="audience">¿Quiénes responden?</label>
            <select id="audience" name="audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="estudiantes">Estudiantes</option>
              <option value="apoderados">Apoderados</option>
              <option value="funcionarios">Funcionarios</option>
            </select>
          </div>
          {audience !== "funcionarios" && (
            <div className="field">
              <label htmlFor="courseId">Curso</label>
              <select id="courseId" name="courseId" defaultValue="">
                <option value="">Todo el establecimiento</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <label className="check"><input type="checkbox" name="anonymous" value="1" defaultChecked />Anónima: los resultados se muestran sin nombres</label>
          {Array.from({ length: rows }, (_, i) => (
            <fieldset key={i} className="field question-row">
              <legend>Pregunta {i + 1}{i > 0 && <span className="muted"> (déjela en blanco si no la usa)</span>}</legend>
              <input name={`q${i}-text`} aria-label={`Texto de la pregunta ${i + 1}`} maxLength={200} required={i === 0} placeholder="Por ejemplo: Me siento seguro en el colegio" />
              <div className="row-inline">
                <select name={`q${i}-type`} aria-label={`Tipo de la pregunta ${i + 1}`} value={types[i] ?? "escala"} onChange={(e) => setTypes((t) => ({ ...t, [i]: e.target.value }))}>
                  <option value="escala">Escala de 1 a 5 (muy en desacuerdo a muy de acuerdo)</option>
                  <option value="opcion">Una opción de una lista</option>
                  <option value="texto">Respuesta libre</option>
                </select>
                <label className="check"><input type="checkbox" name={`q${i}-required`} value="1" defaultChecked={i === 0} />Obligatoria</label>
              </div>
              {types[i] === "opcion" && <input name={`q${i}-options`} aria-label={`Opciones de la pregunta ${i + 1}`} placeholder="Opciones separadas por punto y coma: Sala; Patio; Baños" />}
            </fieldset>
          ))}
          {rows < 8 && <button type="button" className="btn secondary small" onClick={() => setRows((r) => r + 1)}>Agregar pregunta</button>}
        </Fragment>
      )}
      <div className="field section"><label htmlFor="closesOn">Fecha de cierre (opcional)</label><input id="closesOn" name="closesOn" type="date" /></div>
      <button className="btn primary" disabled={busy}>Crear y abrir la encuesta</button>
    </form>
  );
}
