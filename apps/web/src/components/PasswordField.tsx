"use client";
import { useState } from "react";
import { passwordIssues, passwordStrength } from "@insedu/domain";

const LEVELS = ["Muy débil", "Débil", "Aceptable", "Buena", "Muy buena"];

/** Clave nueva con su confirmación y la lista de requisitos, evaluada mientras se escribe. */
export function PasswordField({ name, email, minLength }: { name: string; email: string; minLength: number }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const ctx = { name, email };
  const issues = pw ? passwordIssues(pw, ctx, { minLength }) : [];
  const strength = passwordStrength(pw, ctx);
  const rules = [
    { ok: pw.length >= minLength, text: `Al menos ${minLength} caracteres` },
    { ok: /[a-zñ]/.test(pw), text: "Una letra minúscula" },
    { ok: /[A-ZÑ]/.test(pw), text: "Una letra mayúscula" },
    { ok: /\d/.test(pw), text: "Un número" },
    { ok: /[^A-Za-z0-9ñÑ]/.test(pw), text: "Un símbolo, por ejemplo ! # $ % & *" },
  ];
  return (
    <>
      <div className="field">
        <label htmlFor="password">Clave nueva</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      <div className="strength" aria-live="polite">
        <div className="bar"><i style={{ width: `${(strength + 1) * 20}%` }} className={`s${strength}`} /></div>
        <span className="muted">Fortaleza: {pw ? LEVELS[strength] : "—"}</span>
      </div>
      <ul className="pw-rules">
        {rules.map((r) => <li key={r.text} className={r.ok ? "ok" : undefined}>{r.ok ? "✓" : "○"} {r.text}</li>)}
      </ul>
      {/* Los requisitos básicos («Debe…») ya están en la lista; aquí, las demás advertencias. */}
      {issues.filter((i) => !i.startsWith("Debe ")).map((i) => <p key={i} className="muted" style={{ color: "var(--warning-ink)" }}>{i}</p>)}
      <div className="field">
        <label htmlFor="confirm">Repita la clave</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {confirm && confirm !== pw && <span className="muted" style={{ color: "var(--warning-ink)" }}>Las claves no coinciden.</span>}
      </div>
      <button className="btn primary" disabled={issues.length > 0 || !pw || pw !== confirm}>Guardar clave y continuar</button>
    </>
  );
}
