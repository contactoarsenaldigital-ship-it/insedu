"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { RELATIONSHIPS } from "@insedu/domain";
import { accessRequestAction, type RequestFormState } from "./actions";

/** Formulario en dos pasos: datos de la persona y confirmación del correo con un código. */
export function RequestForm() {
  const [state, act, busy] = useActionState(accessRequestAction, { step: "datos" } as RequestFormState);
  const v = state.values;
  const [rel, setRel] = useState(v?.relationship ?? "");
  const needsStudent = rel === "apoderado" || rel === "estudiante";

  if (state.step === "enviada") {
    return (
      <section className="card">
        <h2 style={{ fontSize: "1.2rem" }}>Solicitud enviada</h2>
        <p>{state.message ?? "Confirmamos su correo y su solicitud llegó a administración del establecimiento. Revisarán sus datos y le enviarán un enlace para activar su cuenta."}</p>
        <p className="muted">La revisión puede tardar hasta 2 días hábiles. Los perfiles con acceso a información sensible (salud, convivencia o protección) requieren además la aprobación de dirección.</p>
        <p><Link href="/ingresar">Volver al ingreso</Link></p>
      </section>
    );
  }

  if (state.step === "codigo" && state.requestId) {
    return (
      <form action={act} className="card">
        <input type="hidden" name="phase" value="codigo" />
        <h2 style={{ fontSize: "1.2rem" }}>Confirme su correo</h2>
        <p>Enviamos un código de 6 dígitos a <strong>{state.sentTo}</strong>. Escríbalo aquí para enviar su solicitud.</p>
        {state.message && <p className={`notice ${state.message.startsWith("Enviamos") ? "ok" : "warn"}`} role="alert">{state.message}</p>}
        {state.demoCode && <p className="notice">Demostración: el correo enviado contiene el código <strong>{state.demoCode}</strong>.</p>}
        <input type="hidden" name="requestId" value={state.requestId} />
        <div className="field">
          <label htmlFor="code">Código de 6 dígitos</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} className="code-input" autoFocus />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn primary" disabled={busy}>Confirmar y enviar solicitud</button>
          <button className="btn secondary small" name="resend" value="1" formNoValidate disabled={busy}>Enviar otro código</button>
        </div>
      </form>
    );
  }

  const issues = state.issues;
  return (
    <form action={act} className="card">
      {issues?.length ? (
        <div className="notice warn" role="alert">
          <strong>Revise estos datos:</strong>
          <ul style={{ margin: "6px 0 0" }}>{issues.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="name">Nombre y apellidos</label>
        <input id="name" name="name" autoComplete="name" required defaultValue={v?.name} />
      </div>
      <div className="field">
        <label htmlFor="rut">RUN</label>
        <input id="rut" name="rut" placeholder="12.345.678-9" required defaultValue={v?.rut} />
      </div>
      <div className="field">
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={v?.email} />
        <span className="muted">Le enviaremos un código para confirmarlo. Docentes y funcionarios: use su correo institucional.</span>
      </div>
      <div className="field">
        <label htmlFor="phone">Teléfono (opcional)</label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+56 9 1234 5678" defaultValue={v?.phone} />
      </div>
      <div className="field">
        <label htmlFor="relationship">Relación con el establecimiento</label>
        <select id="relationship" name="relationship" required value={rel} onChange={(e) => setRel(e.target.value)}>
          <option value="" disabled>Seleccione…</option>
          {Object.entries(RELATIONSHIPS).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
        </select>
      </div>
      {needsStudent && (
        <div className="field">
          <label htmlFor="studentRut">{rel === "apoderado" ? "RUN de su pupilo/a" : "Su RUN de estudiante"}</label>
          <input id="studentRut" name="studentRut" placeholder="23.456.789-0" required defaultValue={v?.studentRut} />
          <span className="muted">Administración lo comparará con la matrícula antes de aprobar.</span>
        </div>
      )}
      <div className="field">
        <label htmlFor="note">Comentario para administración (opcional)</label>
        <textarea id="note" name="note" maxLength={500} placeholder="Por ejemplo: asignaturas que dicta o curso de su pupilo." defaultValue={v?.note} />
      </div>
      <p className="muted">Sus datos se usan solo para revisar esta solicitud. Vea la <Link href="/privacidad">política de privacidad</Link>.</p>
      <button className="btn primary" disabled={busy}>Continuar</button>
    </form>
  );
}
