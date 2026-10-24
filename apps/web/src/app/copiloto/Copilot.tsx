"use client";
import "katex/dist/katex.min.css";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import { COPILOT_KINDS, normalizeMath, SCHOOL_LEVELS, subjectsFor, type CopilotInput } from "@insedu/domain";
import { draftFileName, remarkPlugins } from "@/lib/copilot-markdown";

const OTHER = "__otra";
type Kind = CopilotInput["kind"];
type Context = { kind: Kind; subject: string; level: string };

export function Copilot() {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [meta, setMeta] = useState("");
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [ctx, setCtx] = useState<Context | null>(null);

  const [kind, setKind] = useState<Kind>("guia");
  const [level, setLevel] = useState<string>("7° Básico");
  const [subject, setSubject] = useState("Matemática");
  const subjects = subjectsFor(level);

  function changeLevel(l: string) {
    setLevel(l);
    if (subject !== OTHER && !subjectsFor(l).includes(subject)) setSubject(subjectsFor(l)[0] ?? OTHER);
  }

  async function submit(form: FormData) {
    const chosen = subject === OTHER ? String(form.get("subjectOther") ?? "").trim() : subject;
    if (!chosen) return setError("Indique la asignatura.");
    setBusy(true);
    setError("");
    setApproved(false);
    setEditing(false);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(form), kind, level, subject: chosen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraft(data.draft);
      setCtx({ kind, subject: chosen, level });
      setMeta(`${data.provider} · ${data.model} · plantilla ${data.promptVersion}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  const kindLabel = ctx ? COPILOT_KINDS[ctx.kind] : "";
  const fileName = ctx ? draftFileName(kindLabel, ctx.subject, ctx.level) : "borrador";
  const withStudentFields = ctx?.kind === "guia" || ctx?.kind === "prueba";

  async function downloadWord() {
    if (!ctx) return;
    setExporting(true);
    try {
      // La librería de Word se carga solo al exportar.
      const [{ Packer }, { draftToDocx }] = await Promise.all([import("docx"), import("@/lib/copilot-docx")]);
      const blob = await Packer.toBlob(draftToDocx(draft, { kind: kindLabel, subject: ctx.subject, level: ctx.level, withStudentFields }));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${fileName}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch {
      setError("No se pudo generar el archivo Word. Intente nuevamente.");
    } finally {
      setExporting(false);
    }
  }

  function printPdf() {
    // El navegador usa el título de la página como nombre sugerido del PDF.
    const title = document.title;
    document.title = fileName;
    window.addEventListener("afterprint", () => (document.title = title), { once: true });
    window.print();
  }

  return (
    <>
      <form action={submit} className="no-print">
        <div className="grid">
          <div className="field">
            <label htmlFor="kind">Tipo de material</label>
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {Object.entries(COPILOT_KINDS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="level">Nivel</label>
            <select id="level" value={level} onChange={(e) => changeLevel(e.target.value)}>
              {SCHOOL_LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="subject">Asignatura</label>
            <select id="subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {subjects.map((s) => <option key={s}>{s}</option>)}
              <option value={OTHER}>Otra asignatura…</option>
            </select>
          </div>
          {subject === OTHER && (
            <div className="field">
              <label htmlFor="subjectOther">Nombre de la asignatura</label>
              <input id="subjectOther" name="subjectOther" maxLength={60} required placeholder="Por ejemplo: Taller de Robótica" />
            </div>
          )}
          <div className="field">
            <label htmlFor="difficulty">Dificultad</label>
            <select id="difficulty" name="difficulty" defaultValue="media">
              <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
            </select>
          </div>
          {kind === "prueba" && (
            <div className="field">
              <label htmlFor="items">Número de preguntas</label>
              <input id="items" name="items" type="number" min={3} max={30} defaultValue={10} />
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="objective">Objetivo de aprendizaje</label>
          <textarea id="objective" name="objective" rows={3} required maxLength={1500} placeholder="Copie el OA de las Bases Curriculares o describa lo que quiere trabajar. Por ejemplo: OA 3 · Resolver problemas que involucren multiplicación y división de fracciones." />
        </div>
        <p className="muted">No escriba nombres ni RUT de estudiantes: el sistema bloquea solicitudes con datos personales.</p>
        <button className="btn primary" disabled={busy}>{busy ? "Generando borrador…" : "Generar borrador"}</button>
      </form>

      {error && <p className="notice warn section no-print" role="alert">{error}</p>}
      {draft && ctx && (
        <section className="section">
          <div className="draft-toolbar no-print">
            <div>
              <h2>Borrador</h2>
              <p className="muted">{meta}. Revise, edite y apruebe antes de compartir.</p>
            </div>
            <div className="segmented" role="group" aria-label="Modo del borrador">
              <button type="button" aria-pressed={!editing} onClick={() => setEditing(false)}>Vista</button>
              <button type="button" aria-pressed={editing} onClick={() => setEditing(true)}>Editar texto</button>
            </div>
          </div>

          {editing ? (
            <div className="no-print">
              <textarea className="draft-source" aria-label="Texto del borrador" value={draft} onChange={(e) => setDraft(e.target.value)} rows={22} />
              <p className="muted">Títulos con #, listas con 1. o -, negrita con **texto** y fórmulas entre \( y \). Vuelva a «Vista» para revisar el resultado.</p>
            </div>
          ) : (
            <article className="draft-doc print-area">
              <p className="draft-meta">{ctx.subject} · {ctx.level} · {kindLabel}</p>
              {withStudentFields && <p className="student-fields">Nombre: ______________________________ Curso: __________ Fecha: __________</p>}
              <div className="md-view">
                <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}>
                  {normalizeMath(draft)}
                </ReactMarkdown>
              </div>
            </article>
          )}

          <div className="draft-actions no-print">
            <button className="btn" onClick={() => setApproved(true)} disabled={approved}>{approved ? "Aprobado por el docente" : "Aprobar borrador"}</button>
            <button className="btn secondary" onClick={downloadWord} disabled={exporting}>{exporting ? "Preparando Word…" : "Descargar Word"}</button>
            <button className="btn secondary" onClick={printPdf} disabled={editing} title={editing ? "Vuelva a «Vista» para descargar el PDF" : undefined}>Descargar PDF</button>
            <button className="btn secondary" onClick={() => navigator.clipboard?.writeText(draft)}>Copiar texto</button>
          </div>
        </section>
      )}
    </>
  );
}
