import Link from "next/link";
import { redirect } from "next/navigation";
import { formatRut, isSensitive, maskEmail, RELATIONSHIPS, ROLE_LABEL, STRONG_AUTH_WINDOW_MS } from "@insedu/domain";
import { accountsState, settings, showDemoSecrets, type AccessRequest } from "@/lib/accounts";
import { isAdmin, isDirector, requestHints, suggestedRole } from "@/lib/admin";
import { fullName, studentById } from "@/lib/demo";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { findPerson, repo } from "@/lib/store";
import { approveRequest, createUser, directorApprove, manageUser, rejectAccessRequest, resetSettings, saveSettings } from "./actions";
import { ProfileFields } from "./ProfileFields";

export const metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, [ok: boolean, text: string]> = {
  aprobada: [true, "Solicitud aprobada. Enviamos el enlace de activación al correo de la persona."],
  direccion: [true, "El perfil es sensible: la propuesta quedó esperando la aprobación de dirección."],
  rechazada: [true, "Solicitud rechazada. Avisamos a la persona por correo."],
  creada: [true, "Cuenta creada. Enviamos el enlace de activación al correo."],
  suspendida: [true, "Cuenta suspendida. Ya no puede ingresar."],
  reactivada: [true, "Cuenta reactivada."],
  desbloqueada: [true, "Bloqueo levantado."],
  enlace: [true, "Enviamos un enlace nuevo de activación (vence en 48 horas)."],
  guardado: [true, "Parámetros guardados."],
  permiso: [false, "Su perfil no permite esa acción."],
  vencida: [false, "La solicitud o cuenta ya no está disponible. Actualice la página."],
  propuesta: [false, "Revise el perfil: asigne al menos uno; apoderados y estudiantes necesitan un RUN de estudiante matriculado; la jefatura requiere el perfil Docente."],
  duplicada: [false, "Ya existe una cuenta con ese correo o RUN."],
  motivo: [false, "Escriba el motivo del rechazo (se envía a la persona)."],
  "cuatro-ojos": [false, "Quien propuso el perfil no puede aprobarlo: debe hacerlo otra persona de dirección."],
  datos: [false, "Revise nombre, RUN y correo."],
  rango: [false, "Un parámetro está fuera del rango permitido."],
  horario: [false, "La hora de término debe ser posterior a la de inicio."],
};

const STATUS: Record<AccessRequest["status"], string> = {
  verificando_correo: "Confirmando correo",
  pendiente: "Pendiente",
  esperando_direccion: "Espera a dirección",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }) : "—");
const nameOf = (id: string) => findPerson(id)?.name ?? (id === "público" ? "Formulario público" : id);

export default async function Configuration({ searchParams }: { searchParams: Promise<{ tab?: string; msg?: string; campo?: string }> }) {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/configuracion");
  const admin = isAdmin(session);
  const director = isDirector(session);
  if (!admin && !director) {
    return (
      <main className="wrap"><h1>Configuración</h1><p className="notice warn">Solo administración del establecimiento y dirección acceden a la configuración. Ingrese, por ejemplo, como Daniela Castro.</p></main>
    );
  }
  const sp = await searchParams;
  const tabs = [
    { id: "solicitudes", label: "Solicitudes" },
    { id: "usuarios", label: "Usuarios" },
    ...(admin ? [{ id: "nuevo", label: "Crear usuario" }, { id: "parametros", label: "Parámetros" }] : []),
    { id: "auditoria", label: "Auditoría" },
    ...(showDemoSecrets() ? [{ id: "correos", label: "Correos (demo)" }] : []),
  ];
  const tab = tabs.some((t) => t.id === sp.tab) ? sp.tab! : "solicitudes";
  const st = accountsState();
  const msg = sp.msg ? MESSAGES[sp.msg] : undefined;
  const fresh = !!session.lastStrongAuthAt && Date.now() - new Date(session.lastStrongAuthAt).getTime() <= STRONG_AUTH_WINDOW_MS;
  const pending = st.requests.filter((r) => r.status === "pendiente");
  const awaiting = st.requests.filter((r) => r.status === "esperando_direccion");

  return (
    <main className="wrap" style={{ maxWidth: 1000 }}>
      <span className="muted">{admin ? "Administración del establecimiento" : "Dirección"} · {session.person.name}</span>
      <h1>Configuración y cuentas</h1>
      <p>Aquí se reciben las solicitudes de acceso, se crean y administran las cuentas, y se ajustan los parámetros del establecimiento. Cada acción queda registrada en la auditoría.</p>
      {!fresh && (
        <p className="notice warn">
          Para aprobar, crear o modificar cuentas y parámetros debe verificar su identidad (dura 5 minutos).{" "}
          <Link href={`/verificar?next=${encodeURIComponent(`/configuracion?tab=${tab}`)}`}>Verificar ahora</Link>
        </p>
      )}
      {msg && <p className={`notice ${msg[0] ? "ok" : "warn"}`} role={msg[0] ? "status" : "alert"}>{msg[1]}</p>}

      <nav className="tabs" aria-label="Secciones de configuración">
        {tabs.map((t) => (
          <Link key={t.id} href={`/configuracion?tab=${t.id}`} aria-current={t.id === tab ? "page" : undefined}>
            {t.label}
            {t.id === "solicitudes" && pending.length + awaiting.length > 0 && <span className="count">{pending.length + awaiting.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "solicitudes" && (
        <>
          {awaiting.length > 0 && (
            <section className="section">
              <h2>Esperan aprobación de dirección</h2>
              <p className="muted">Perfiles con acceso a información sensible. Aprueba una persona de dirección distinta de quien los propuso.</p>
              {awaiting.map((r) => (
                <article key={r.id} className="card req">
                  <RequestHeader r={r} />
                  <p>Propuesta de {nameOf(r.proposal!.by)} ({when(r.proposal!.at)}): <strong>{r.proposal!.roles.map((x) => ROLE_LABEL[x]).join(", ")}</strong> · app autenticadora</p>
                  {director ? (
                    <div className="req-actions">
                      <form action={directorApprove}><input type="hidden" name="requestId" value={r.id} /><button className="btn primary small">Aprobar como dirección</button></form>
                      <RejectForm id={r.id} />
                    </div>
                  ) : (
                    <p className="muted">Solo dirección puede aprobarla.{r.proposal!.by === session.person.id && " Usted puede retirarla rechazándola."}</p>
                  )}
                  {!director && r.proposal!.by === session.person.id && <RejectForm id={r.id} />}
                </article>
              ))}
            </section>
          )}

          <section className="section">
            <h2>Solicitudes pendientes</h2>
            {pending.length === 0 && <p className="muted">No hay solicitudes pendientes. Las personas las envían desde <Link href="/solicitar-acceso">/solicitar-acceso</Link> (enlace también en la página de ingreso).</p>}
            {pending.map((r) => (
              <article key={r.id} className="card req">
                <RequestHeader r={r} />
                <ul className="hints">{requestHints(r).map((h) => <li key={h.text} className={h.ok ? "ok" : "warn"}>{h.ok ? "✓" : "!"} {h.text}</li>)}</ul>
                {admin ? (
                  <>
                    <details open={sp.msg === "propuesta"}>
                      <summary className="btn primary small">Aprobar y asignar perfil</summary>
                      <form action={approveRequest} style={{ marginTop: 12 }}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <ProfileFields idPrefix={r.id} roles={suggestedRole(r) ? [suggestedRole(r)!] : []} studentRut={r.studentRut} />
                        <button className="btn primary">Aprobar y enviar enlace de activación</button>
                      </form>
                    </details>
                    <RejectForm id={r.id} />
                  </>
                ) : (
                  <p className="muted">Administración revisa y asigna el perfil.</p>
                )}
              </article>
            ))}
          </section>

          <section className="section">
            <h2>Historial</h2>
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>Fecha</th><th>Persona</th><th>Relación</th><th>Estado</th><th>Detalle</th></tr></thead>
                <tbody>
                  {st.requests.filter((r) => r.status === "aprobada" || r.status === "rechazada").reverse().map((r) => (
                    <tr key={r.id}>
                      <td>{when(r.decidedAt)}</td>
                      <td>{r.name}</td>
                      <td>{RELATIONSHIPS[r.relationship as keyof typeof RELATIONSHIPS]?.label ?? r.relationship}</td>
                      <td><span className={`tag ${r.status === "aprobada" ? "ok" : "alta"}`}>{STATUS[r.status]}</span></td>
                      <td>{r.reason ?? (r.decidedBy ?? []).map(nameOf).join(" y ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === "usuarios" && (
        <section className="section">
          <h2>Cuentas</h2>
          <p className="muted">Las personas del colegio ficticio usan el ingreso de demostración; aquí aparecen las cuentas reales creadas en INSEDU.</p>
          {st.users.length === 0 && <p className="notice">Aún no hay cuentas. Apruebe una solicitud o cree un usuario.</p>}
          {st.users.length > 0 && (
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>Persona</th><th>Perfiles y alcance</th><th>Estado</th><th>Segundo factor</th><th>Último ingreso</th>{admin && <th>Acciones</th>}</tr></thead>
                <tbody>
                  {st.users.map((a) => {
                    const locked = a.lockedUntil && new Date(a.lockedUntil).getTime() > Date.now();
                    const subj = (a.scope.subjectIds ?? []).map((id) => repo.subject(id)).filter(Boolean);
                    const ward = a.scope.studentId ? studentById(a.scope.studentId) : undefined;
                    return (
                      <tr key={a.id}>
                        <td><strong>{a.name}</strong><br /><span className="muted">{formatRut(a.rut)} · {a.email}</span></td>
                        <td>
                          {a.roles.map((r) => ROLE_LABEL[r]).join(", ")}
                          {isSensitive(a.roles) && <> <span className="tag alta">sensible</span></>}
                          {subj.length > 0 && <><br /><span className="muted">{subj.length} asignatura{subj.length > 1 ? "s" : ""}</span></>}
                          {a.scope.headOfCourseId && <><br /><span className="muted">Jefatura: {repo.course(a.scope.headOfCourseId)?.name}</span></>}
                          {ward && <><br /><span className="muted">Estudiante: {fullName(ward)}</span></>}
                        </td>
                        <td>
                          <span className={`tag ${a.status === "activa" ? "ok" : a.status === "suspendida" ? "alta" : "media"}`}>{a.status}</span>
                          {locked && <><br /><span className="tag alta">bloqueada</span></>}
                        </td>
                        <td>{a.mfa ? (a.mfa.method === "app" ? "App" : "Correo") : `Por configurar (${a.mfaPlan === "app" ? "app" : "correo"})`}<br /><span className="muted">{a.recoveryHashes.length} códigos de recuperación</span></td>
                        <td>{when(a.lastLoginAt)}</td>
                        {admin && (
                          <td>
                            <div className="req-actions">
                              {a.status === "invitada" && <UserButton id={a.id} op="reenviar" label="Reenviar enlace" />}
                              {a.status === "activa" && <UserButton id={a.id} op="restablecer" label="Restablecer acceso" />}
                              {locked && <UserButton id={a.id} op="desbloquear" label="Desbloquear" />}
                              {a.status !== "suspendida" ? <UserButton id={a.id} op="suspender" label="Suspender" /> : <UserButton id={a.id} op="reactivar" label="Reactivar" />}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "nuevo" && admin && (
        <section className="section">
          <h2>Crear usuario</h2>
          <p className="muted">Para funcionarios que no enviaron solicitud. La persona recibe un enlace para crear su clave y su segundo factor; administración nunca conoce la clave.</p>
          <form action={createUser} className="card">
            <div className="field"><label htmlFor="n-name">Nombre y apellidos</label><input id="n-name" name="name" required /></div>
            <div className="field"><label htmlFor="n-rut">RUN</label><input id="n-rut" name="rut" placeholder="12.345.678-9" required /></div>
            <div className="field"><label htmlFor="n-email">Correo</label><input id="n-email" name="email" type="email" required /></div>
            <div className="field"><label htmlFor="n-phone">Teléfono (opcional)</label><input id="n-phone" name="phone" type="tel" /></div>
            <ProfileFields idPrefix="nuevo" />
            <button className="btn primary">Crear y enviar enlace de activación</button>
          </form>
        </section>
      )}

      {tab === "parametros" && admin && <SettingsForm field={sp.campo} />}

      {tab === "auditoria" && (
        <section className="section">
          <h2>Auditoría de cuentas y configuración</h2>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Detalle</th></tr></thead>
              <tbody>
                {st.audit.slice(-200).reverse().map((e) => (
                  <tr key={e.id}><td>{when(e.at)}</td><td>{nameOf(e.actor)}</td><td>{e.action}</td><td>{e.detail}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {st.audit.length === 0 && <p className="muted">Sin registros todavía.</p>}
        </section>
      )}

      {tab === "correos" && showDemoSecrets() && (
        <section className="section">
          <h2>Correos enviados (demostración)</h2>
          <p className="notice">La maqueta no envía correos reales: aquí se ven los que recibiría cada persona, con sus enlaces de activación. En el piloto llegan a la bandeja de entrada y esta pestaña no existe.</p>
          {st.outbox.slice().reverse().slice(0, 50).map((m) => (
            <article key={m.id} className="card mail">
              <span className="muted">{when(m.at)} · para {maskEmail(m.to)}</span>
              <strong>{m.subject}</strong>
              <p>{m.body}</p>
              {m.link && <a className="btn small" href={m.link}>Abrir enlace del correo</a>}
            </article>
          ))}
          {st.outbox.length === 0 && <p className="muted">Sin correos todavía.</p>}
        </section>
      )}
    </main>
  );
}

function RequestHeader({ r }: { r: AccessRequest }) {
  return (
    <>
      <div className="req-head">
        <strong>{r.name}</strong>
        <span className="tag">{RELATIONSHIPS[r.relationship as keyof typeof RELATIONSHIPS]?.label ?? r.relationship}</span>
        <span className="muted">{when(r.createdAt)}</span>
      </div>
      <p className="muted">RUN {formatRut(r.rut)} · {r.email}{r.phone ? ` · ${r.phone}` : ""}{r.studentRut ? ` · RUN estudiante ${formatRut(r.studentRut)}` : ""}</p>
      {r.note && <p>“{r.note}”</p>}
    </>
  );
}

function RejectForm({ id }: { id: string }) {
  return (
    <details>
      <summary className="btn secondary small">Rechazar</summary>
      <form action={rejectAccessRequest} style={{ marginTop: 12 }}>
        <input type="hidden" name="requestId" value={id} />
        <div className="field">
          <label htmlFor={`reason-${id}`}>Motivo (se envía a la persona)</label>
          <input id={`reason-${id}`} name="reason" required minLength={5} maxLength={300} placeholder="Por ejemplo: el RUN no figura en la matrícula" />
        </div>
        <button className="btn secondary small">Confirmar rechazo</button>
      </form>
    </details>
  );
}

function UserButton({ id, op, label }: { id: string; op: string; label: string }) {
  return (
    <form action={manageUser}>
      <input type="hidden" name="accountId" value={id} />
      <input type="hidden" name="op" value={op} />
      <button className="btn secondary small">{label}</button>
    </form>
  );
}

function SettingsForm({ field }: { field?: string }) {
  const s = settings();
  const num = (name: string, label: string, value: number, min: number, max: number, step = 1, help?: string) => (
    <div className="field">
      <label htmlFor={`p-${name}`}>{label}</label>
      <input id={`p-${name}`} name={name} type="number" min={min} max={max} step={step} defaultValue={value} required aria-invalid={field === name || undefined} />
      {help && <span className="muted">{help}</span>}
    </div>
  );
  return (
    <section className="section">
      <h2>Parámetros del establecimiento</h2>
      <p className="muted">Última modificación: {s.updatedAt ? `${when(s.updatedAt)} por ${nameOf(s.updatedBy ?? "")}` : "valores recomendados"}.</p>
      <form action={saveSettings} className="settings-grid">
        <fieldset className="card">
          <legend>Comunicaciones</legend>
          {num("contactStartHour", "Hora de inicio de envío a familias", s.contactStartHour, 0, 23, 1, "Los mensajes fuera del horario se entregan al día siguiente.")}
          {num("contactEndHour", "Hora de término", s.contactEndHour, 1, 24)}
        </fieldset>
        <fieldset className="card">
          <legend>Indicadores de atención (Salvaguarda)</legend>
          {num("riskMinAverage", "Promedio bajo (menor que)", s.riskMinAverage, 1, 7, 0.1)}
          {num("riskMinAttendance", "Asistencia baja (menor que, %)", Math.round(s.riskMinAttendance * 100), 50, 100, 1, "La ley exige 85 % para promoción.")}
          {num("riskMaxNegatives", "Anotaciones negativas (más de)", s.riskMaxNegatives, 0, 20)}
          {num("riskMaxNurseVisits", "Atenciones de enfermería en el mes (más de)", s.riskMaxNurseVisits, 0, 20)}
        </fieldset>
        <fieldset className="card">
          <legend>Seguridad de cuentas</legend>
          {num("passwordMinLength", "Largo mínimo de clave", s.passwordMinLength, 10, 64, 1, "Además: mayúscula, minúscula, número y símbolo.")}
          {num("codeMinutes", "Vigencia del código de 6 dígitos (minutos)", s.codeMinutes, 3, 30)}
          {num("maxAttempts", "Intentos fallidos antes de bloquear", s.maxAttempts, 3, 10)}
          {num("lockMinutes", "Duración del bloqueo (minutos)", s.lockMinutes, 5, 120)}
        </fieldset>
        <fieldset className="card">
          <legend>Copiloto docente</legend>
          {num("copilotDailyLimit", "Consultas diarias por establecimiento", s.copilotDailyLimit, 0, 2000, 1, "0 desactiva el Copiloto.")}
        </fieldset>
        <div><button className="btn primary">Guardar parámetros</button></div>
      </form>
      <form action={resetSettings} style={{ marginTop: 12 }}><button className="btn secondary small">Volver a los valores recomendados</button></form>
    </section>
  );
}
