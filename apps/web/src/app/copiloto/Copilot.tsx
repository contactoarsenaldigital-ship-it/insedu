"use client";
import { useState } from "react";

export function Copilot() {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [meta, setMeta] = useState("");
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    setApproved(false);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraft(data.draft);
      setMeta(`${data.provider} · ${data.model} · plantilla ${data.promptVersion}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form action={submit}>
        <div className="grid">
          <div className="field">
            <label htmlFor="kind">Tipo de material</label>
            <select id="kind" name="kind" defaultValue="guia">
              <option value="guia">Guía de estudio</option>
              <option value="prueba">Prueba con pauta</option>
              <option value="rubrica">Rúbrica</option>
              <option value="planificacion">Planificación</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="subject">Asignatura</label>
            <input id="subject" name="subject" defaultValue="Matemática" required />
          </div>
          <div className="field">
            <label htmlFor="level">Nivel</label>
            <select id="level" name="level" defaultValue="7° Básico">
              {["5° Básico", "6° Básico", "7° Básico", "8° Básico", "1° Medio", "2° Medio"].map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="difficulty">Dificultad</label>
            <select id="difficulty" name="difficulty" defaultValue="media">
              <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="objective">Objetivo de aprendizaje</label>
          <textarea id="objective" name="objective" rows={3} required defaultValue="OA 3: Resolver problemas que involucren multiplicación y división de fracciones." />
        </div>
        <p className="muted">No escriba nombres ni RUT de estudiantes: el sistema bloquea solicitudes con datos personales.</p>
        <button className="btn primary" disabled={busy}>{busy ? "Generando borrador…" : "Generar borrador"}</button>
      </form>

      {error && <p className="notice warn section" role="alert">{error}</p>}
      {draft && (
        <section className="section">
          <h2>Borrador</h2>
          <p className="muted">{meta}. Revise, edite y apruebe antes de compartir.</p>
          <textarea className="draft" aria-label="Borrador editable" value={draft} onChange={(e) => setDraft(e.target.value)} rows={18} style={{ width: "100%", font: "inherit", padding: 16, borderRadius: 14, border: "1px solid var(--line)" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => setApproved(true)} disabled={approved}>{approved ? "Aprobado por el docente" : "Aprobar borrador"}</button>
            <button className="btn secondary" onClick={() => navigator.clipboard?.writeText(draft)}>Copiar</button>
          </div>
        </section>
      )}
    </>
  );
}
