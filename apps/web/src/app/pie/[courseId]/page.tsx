import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  PIE_GROUP_LABEL, PIE_NEED_LABEL, PIE_PLACE_LABEL, PIE_SECTIONS, sectionsOf,
  type PieEntry, type PieGroup, type PieNeed, type PiePlace, type PieSection,
} from "@insedu/domain";
import { showDemoSecrets } from "@/lib/accounts";
import { activeStudents, courseById, fullName, studentById } from "@/lib/demo";
import { canManagePie, canReadPie, canWritePie, entriesOf, nominaOf, pieToday, statusOf, teamCandidates, teamOf } from "@/lib/pie";
import { getSession, type Session } from "@/lib/session";
import { readState } from "@/lib/state";
import { findPerson, pieState } from "@/lib/store";
import { demoSignCode } from "@/lib/verifier";
import { addPieEntry, addPieMember, addPieStudent, correctPieEntry, endPieStudent, loadPieDemo, removePieMember, signPieEntry } from "../actions";

export const metadata = { title: "Libro PIE" };
export const dynamic = "force-dynamic";

const GROUPS = Object.keys(PIE_GROUP_LABEL) as PieGroup[];
const nameOf = (id: string) => findPerson(id)?.name ?? id;
const studentName = (id: string) => {
  const st = studentById(id);
  return st ? fullName(st) : id;
};
const SIGN_LABEL = { mineduc: "verificador del Mineduc", interno: "demostración" };

export default async function PieCourse({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ tab?: string; ok?: string; error?: string }> }) {
  await readState();
  const { courseId } = await params;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=/pie/${courseId}`);
  const course = courseById(courseId);
  if (!course) notFound();
  if (!canReadPie(session, courseId)) redirect("/pie");
  const sp = await searchParams;
  const tabs = [{ id: "nomina", label: "Nómina y equipo" }, ...GROUPS.map((g) => ({ id: g, label: PIE_GROUP_LABEL[g] }))];
  const tab = tabs.some((t) => t.id === sp.tab) ? sp.tab! : "nomina";
  const write = canWritePie(session, courseId);
  const status = statusOf(courseId);
  const empty = entriesOf(courseId).length === 0 && status.students === 0;

  return (
    <main className="wrap" style={{ maxWidth: 1000 }}>
      <Link href="/pie" className="muted">← Libro PIE</Link>
      <h1 style={{ marginTop: 8 }}>{course.name}</h1>
      <p className="muted">
        {status.students} en la nómina · {status.team} en el equipo de aula · {status.weeklySupportHours} horas pedagógicas de apoyo en 7 días · <Link href={`/pie/${courseId}/registro`}>Ver registro para imprimir</Link>
      </p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}
      {status.emptyGroups.length > 0 && !empty && <p className="notice warn">Partes del registro sin anotaciones: {status.emptyGroups.map((g) => PIE_GROUP_LABEL[g]).join(", ")}.</p>}
      {empty && canManagePie(session) && showDemoSecrets() && (
        <form action={loadPieDemo} className="notice">
          <input type="hidden" name="courseId" value={courseId} />
          Este curso no tiene registros. <button className="btn secondary small">Cargar datos ficticios de ejemplo</button>
        </form>
      )}

      <nav className="tabs" aria-label="Partes del Libro PIE">
        {tabs.map((t) => <Link key={t.id} href={`/pie/${courseId}?tab=${t.id}`} aria-current={t.id === tab ? "page" : undefined}>{t.label}</Link>)}
      </nav>

      {tab === "nomina" ? <Roster courseId={courseId} session={session} /> : <Group group={tab as PieGroup} courseId={courseId} session={session} canWrite={write} />}
    </main>
  );
}

function Roster({ courseId, session }: { courseId: string; session: Session }) {
  const manage = canManagePie(session);
  const nomina = nominaOf(courseId);
  const inNomina = new Set(nomina.map((p) => p.id));
  const team = teamOf(courseId);
  const candidates = teamCandidates().filter((p) => !team.some((m) => m.personId === p.id));
  const past = pieState().students.filter((p) => p.until && studentById(p.id)?.courseId === courseId);
  return (
    <>
      <section className="section">
        <h2>Nómina del programa</h2>
        {nomina.length === 0 ? <p className="muted">Aún no hay estudiantes en la nómina.</p> : (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Estudiante</th><th>Necesidad</th><th>Desde</th>{manage && <th>Egreso del programa</th>}</tr></thead>
              <tbody>
                {nomina.map((p) => (
                  <tr key={p.id}>
                    <td>{studentName(p.id)}</td>
                    <td>{PIE_NEED_LABEL[p.need]}</td>
                    <td>{p.since}</td>
                    {manage && (
                      <td>
                        <details>
                          <summary>Registrar egreso</summary>
                          <form action={endPieStudent} className="inline-form">
                            <input type="hidden" name="courseId" value={courseId} />
                            <input type="hidden" name="studentId" value={p.id} />
                            <input name="reason" required minLength={10} maxLength={300} aria-label="Motivo del egreso" placeholder="Motivo" />
                            <button className="btn secondary small">Confirmar</button>
                          </form>
                        </details>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {manage && (
          <form action={addPieStudent} className="card section">
            <input type="hidden" name="courseId" value={courseId} />
            <h3 style={{ fontSize: "1rem" }}>Agregar estudiante</h3>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="studentId">Estudiante</label>
                <select id="studentId" name="studentId" required defaultValue="">
                  <option value="" disabled>Seleccione…</option>
                  {activeStudents().filter((s) => s.courseId === courseId && !inNomina.has(s.id)).sort((a, b) => a.lastName.localeCompare(b.lastName, "es")).map((s) => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="need">Necesidad educativa especial</label>
                <select id="need" name="need" required defaultValue="">
                  <option value="" disabled>Seleccione…</option>
                  {(Object.keys(PIE_NEED_LABEL) as PieNeed[]).map((n) => <option key={n} value={n}>{PIE_NEED_LABEL[n]}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="since">Desde</label><input id="since" name="since" type="date" required max={pieToday()} defaultValue={pieToday()} /></div>
            </div>
            <div><button className="btn primary">Agregar a la nómina</button></div>
          </form>
        )}
        {past.length > 0 && <p className="muted section">Egresados del programa: {past.map((p) => `${studentName(p.id)} (${p.until})`).join(", ")}.</p>}
      </section>

      <section className="section">
        <h2>Equipo de aula</h2>
        {team.length === 0 ? <p className="muted">Aún no hay integrantes.</p> : (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Integrante</th><th>Función</th><th>Horas semanales</th>{manage && <th />}</tr></thead>
              <tbody>
                {team.map((m) => (
                  <tr key={m.id}>
                    <td>{nameOf(m.personId)}</td>
                    <td>{m.role}</td>
                    <td>{m.weeklyHours ?? "—"}</td>
                    {manage && (
                      <td>
                        <form action={removePieMember}>
                          <input type="hidden" name="courseId" value={courseId} />
                          <input type="hidden" name="memberId" value={m.id} />
                          <button className="btn secondary small">Retirar</button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {manage && (
          <form action={addPieMember} className="card section">
            <input type="hidden" name="courseId" value={courseId} />
            <h3 style={{ fontSize: "1rem" }}>Agregar integrante</h3>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="personId">Persona</label>
                <select id="personId" name="personId" required defaultValue="">
                  <option value="" disabled>Seleccione…</option>
                  {candidates.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.description}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="role">Función</label><input id="role" name="role" required maxLength={80} placeholder="Educadora diferencial" /></div>
              <div className="field"><label htmlFor="weeklyHours">Horas semanales</label><input id="weeklyHours" name="weeklyHours" inputMode="decimal" /></div>
            </div>
            <div><button className="btn primary">Agregar al equipo</button></div>
          </form>
        )}
      </section>
    </>
  );
}

function Group({ group, courseId, session, canWrite }: { group: PieGroup; courseId: string; session: Session; canWrite: boolean }) {
  const sections = sectionsOf(group);
  const entries = entriesOf(courseId).filter((e) => PIE_SECTIONS[e.section].group === group);
  const nomina = nominaOf(courseId);
  const team = teamOf(courseId);
  const usesStudents = sections.some((s) => s !== "coordinacion" && s !== "actas") && group !== "familia";
  const usesParticipants = sections.some((s) => PIE_SECTIONS[s].needsParticipants);
  const usesMinutes = sections.some((s) => PIE_SECTIONS[s].needsMinutes);
  const inTeam = team.some((m) => m.personId === session.person.id);
  const code = canWrite ? demoSignCode(session) : undefined;

  return (
    <>
      {canWrite && (
        <form action={addPieEntry} className="card section">
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="tab" value={group} />
          <h2 style={{ fontSize: "1.1rem" }}>Nuevo registro</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="section">Tipo</label>
              <select id="section" name="section" required>
                {sections.map((s: PieSection) => <option key={s} value={s}>{PIE_SECTIONS[s].label}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="date">Fecha</label><input id="date" name="date" type="date" required max={pieToday()} defaultValue={pieToday()} /></div>
            {usesMinutes && (
              <>
                <div className="field"><label htmlFor="minutes">Minutos (solo apoyos)</label><input id="minutes" name="minutes" type="number" min={5} max={480} /></div>
                <div className="field">
                  <label htmlFor="place">Lugar (solo apoyos)</label>
                  <select id="place" name="place" defaultValue="">
                    <option value="">Sin indicar</option>
                    {(Object.keys(PIE_PLACE_LABEL) as PiePlace[]).map((p) => <option key={p} value={p}>{PIE_PLACE_LABEL[p]}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
          <div className="field"><label htmlFor="text">Descripción</label><textarea id="text" name="text" required minLength={10} maxLength={3000} /></div>
          {usesStudents && (
            <fieldset className="field">
              <legend>Estudiantes de la nómina</legend>
              {nomina.length === 0 ? <p className="muted">Primero agregue estudiantes a la nómina.</p> : (
                <div className="classmates">{nomina.map((p) => <label key={p.id} className="check"><input type="checkbox" name="studentIds" value={p.id} />{studentName(p.id)}</label>)}</div>
              )}
            </fieldset>
          )}
          {usesParticipants && (
            <fieldset className="field">
              <legend>Participantes (reuniones y actas)</legend>
              {team.length === 0 ? <p className="muted">Primero agregue integrantes al equipo.</p> : (
                <div className="classmates">{team.map((m) => <label key={m.id} className="check"><input type="checkbox" name="participantIds" value={m.personId} />{nameOf(m.personId)}</label>)}</div>
              )}
            </fieldset>
          )}
          {group === "planificacion" && (
            <fieldset className="field">
              <legend>Plan de apoyo individual: lo aprobó</legend>
              <label className="check"><input type="checkbox" name="approvedByStudent" value="1" />El estudiante</label>
              <label className="check"><input type="checkbox" name="approvedByGuardian" value="1" />Su apoderado/a</label>
            </fieldset>
          )}
          {inTeam ? (
            <div className="field" style={{ maxWidth: 360 }}>
              <label htmlFor="code">Firmar al guardar: código de su verificador (opcional)</label>
              <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="6 dígitos" />
            </div>
          ) : <p className="muted">Solo quienes integran el equipo de aula pueden firmar. Este registro quedará como borrador.</p>}
          {code && inTeam && <p className="notice">Demostración: su código vigente es <strong>{code}</strong> (cambia cada 30 segundos).</p>}
          <div><button className="btn primary">Guardar registro</button></div>
        </form>
      )}

      <section className="section">
        <h2>{PIE_GROUP_LABEL[group]}</h2>
        {entries.length === 0 && <p className="muted">Aún no hay registros en esta parte.</p>}
        {entries.map((e) => <EntryCard key={e.id} entry={e} group={group} courseId={courseId} session={session} canWrite={canWrite} inTeam={inTeam} />)}
      </section>
    </>
  );
}

function EntryCard({ entry: e, group, courseId, session, canWrite, inTeam }: { entry: PieEntry; group: PieGroup; courseId: string; session: Session; canWrite: boolean; inTeam: boolean }) {
  const signedByMe = e.signatures.some((s) => s.by === session.person.id);
  const hidden = (
    <>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="tab" value={group} />
      <input type="hidden" name="entryId" value={e.id} />
    </>
  );
  return (
    <article className="card pie-entry">
      <span className="eyebrow">{e.date} · {PIE_SECTIONS[e.section].label}</span>
      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{e.text}</p>
      {e.studentIds.length > 0 && <span className="muted">Estudiantes: {e.studentIds.map(studentName).join(", ")}</span>}
      {e.participantIds.length > 0 && <span className="muted">Participantes: {e.participantIds.map(nameOf).join(", ")}</span>}
      {e.minutes && <span className="muted">{e.minutes} minutos{e.place ? ` · ${PIE_PLACE_LABEL[e.place]}` : ""}</span>}
      {e.section === "plan_individual" && <span className="muted">Aprobación: estudiante {e.approvedByStudent ? "sí" : "pendiente"} · apoderado/a {e.approvedByGuardian ? "sí" : "pendiente"}</span>}
      <div className="req-actions" style={{ alignItems: "center" }}>
        {e.signatures.length === 0
          ? <span className="tag media">Borrador sin firmar</span>
          : e.signatures.map((s) => <span key={s.by} className="tag ok">✓ {nameOf(s.by)} · {SIGN_LABEL[s.method]}</span>)}
        {inTeam && !signedByMe && (
          <form action={signPieEntry} className="sign-form">
            {hidden}
            <input name="code" aria-label="Código de 6 dígitos de su verificador" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required placeholder="Código" />
            <button className="btn secondary small">{e.signatures.length ? "Firmar en codocencia" : "Firmar"}</button>
          </form>
        )}
      </div>
      {canWrite && (
        <details>
          <summary>{e.signatures.length ? "Corregir (requiere motivo)" : "Editar borrador"}</summary>
          <form action={correctPieEntry} style={{ marginTop: 8 }}>
            {hidden}
            <div className="field"><label htmlFor={`t-${e.id}`}>Descripción</label><textarea id={`t-${e.id}`} name="text" required minLength={10} maxLength={3000} defaultValue={e.text} /></div>
            {e.signatures.length > 0 && <div className="field"><label htmlFor={`r-${e.id}`}>Motivo de la corrección</label><input id={`r-${e.id}`} name="reason" required minLength={10} maxLength={300} /></div>}
            <button className="btn secondary small">Guardar</button>
          </form>
        </details>
      )}
    </article>
  );
}
