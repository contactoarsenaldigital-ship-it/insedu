import Link from "next/link";
import { redirect } from "next/navigation";
import { courseById, school } from "@/lib/demo";
import { fmtDT, who } from "@/lib/format";
import { announcementsFor, audienceOf, other, recipientsFor, teacherCourses, threadsOf, type Announcement } from "@/lib/messages";
import { getSession } from "@/lib/session";
import type { Person } from "@/lib/repository";
import { confirmRead, publishAnnouncement, sendMessage } from "./actions";
import { readState, saveState } from "@/lib/state";

export const metadata = { title: "Comunicados y mensajes" };
export const dynamic = "force-dynamic";

const isStaffPerson = (p: Person) => !p.roles.includes("student") && !p.wards;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ tab?: string; t?: string; ok?: string; error?: string }> }) {
  await readState();
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/mensajes");
  const me = session.person;
  const isStudent = me.roles.includes("student");
  const tab = sp.tab === "mensajes" && !isStudent ? "mensajes" : "comunicados";
  if (tab === "mensajes" && sp.t) {
    const t = threadsOf(me.id).find((x) => x.id === sp.t);
    let changed = false;
    for (const m of t?.messages ?? []) if (m.from !== me.id && !m.readAt) (m.readAt = new Date().toISOString()), (changed = true);
    if (changed) await saveState();
  }
  const unread = threadsOf(me.id).filter((t) => t.messages.some((m) => m.from !== me.id && !m.readAt)).length;

  return (
    <main className="wrap">
      <span className="muted">{me.name}</span>
      <h1>Comunicación</h1>
      <nav className="tabs" aria-label="Secciones">
        <Link href="/mensajes" aria-current={tab === "comunicados" ? "page" : undefined}>Comunicados</Link>
        {!isStudent && <Link href="/mensajes?tab=mensajes" aria-current={tab === "mensajes" ? "page" : undefined}>Mensajes{unread ? ` (${unread})` : ""}</Link>}
      </nav>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}
      {tab === "comunicados" ? <Announcements me={me} /> : <Inbox me={me} selected={sp.t} />}
    </main>
  );
}

function Announcements({ me }: { me: Person }) {
  const list = announcementsFor(me);
  const staff = isStaffPerson(me);
  const leader = me.roles.some((r) => ["director", "inspector", "school_admin"].includes(r));
  const myCourses = leader ? school().courses.map((c) => c.id) : teacherCourses(me.id);
  const canPublish = staff && (leader || me.roles.some((r) => r === "teacher" || r === "head_teacher"));
  return (
    <>
      {me.roles.includes("student") && (
        <p className="notice">Por protección de menores, los estudiantes reciben comunicados del curso y no tienen conversaciones privadas con adultos del colegio. Tu apoderado puede escribir a tus profesores.</p>
      )}
      <section className="section">
        {list.map((a) => <AnnouncementCard key={a.id} a={a} me={me} staff={staff} />)}
        {!list.length && <p className="muted">No hay comunicados.</p>}
      </section>
      {canPublish && (
        <section className="section">
          <h2>Publicar comunicado</h2>
          <form action={publishAnnouncement} className="card">
            <div className="grid">
              <div className="field">
                <label htmlFor="courseId">Destinatarios</label>
                <select id="courseId" name="courseId">
                  {leader && <option value="todos">Todo el establecimiento</option>}
                  {myCourses.map((c) => <option key={c} value={c}>Apoderados y estudiantes de {courseById(c)?.name}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="title">Título</label><input id="title" name="title" required minLength={5} maxLength={120} /></div>
            </div>
            <div className="field"><label htmlFor="body">Mensaje</label><textarea id="body" name="body" rows={4} required /></div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 0 12px" }}>
              <input type="checkbox" name="requiresAck" value="1" /> Solicitar confirmación de lectura a los apoderados
            </label>
            <button className="btn primary">Publicar</button>
          </form>
        </section>
      )}
    </>
  );
}

function AnnouncementCard({ a, me, staff }: { a: Announcement; me: Person; staff: boolean }) {
  const audience = audienceOf(a);
  const readCount = audience.filter((g) => a.reads[g.id]).length;
  const pending = audience.filter((g) => !a.reads[g.id]);
  const mineRead = a.reads[me.id];
  return (
    <article className="card" style={{ marginBottom: 12 }}>
      <span className="eyebrow">{a.courseId ? courseById(a.courseId)?.name : "Todo el establecimiento"} · {who(a.authorId)} · {fmtDT(a.at)}</span>
      <h3>{a.title}</h3>
      <p style={{ margin: 0 }}>{a.body}</p>
      {staff && a.requiresAck && (
        <>
          <div className="bar" aria-label="Confirmaciones de lectura"><i style={{ width: `${Math.round((readCount / Math.max(1, audience.length)) * 100)}%` }} /></div>
          <span className="muted">{readCount} de {audience.length} apoderados confirmaron lectura</span>
          {pending.length > 0 && (
            <details>
              <summary>Ver quiénes no han confirmado ({pending.length})</summary>
              <p className="muted" style={{ marginTop: 6 }}>{pending.map((g) => g.name).join(" · ")}</p>
            </details>
          )}
        </>
      )}
      {!staff && a.requiresAck && (
        mineRead ? <span className="tag ok">✓ Lectura confirmada {fmtDT(mineRead)}</span> : (
          <form action={confirmRead}><input type="hidden" name="id" value={a.id} /><button className="btn small">Confirmar lectura</button></form>
        )
      )}
    </article>
  );
}

function Inbox({ me, selected }: { me: Person; selected?: string }) {
  const threads = threadsOf(me.id);
  const current = threads.find((t) => t.id === selected);
  const recipients = recipientsFor(me);
  return (
    <div className="inbox">
      <aside>
        <h2>Conversaciones</h2>
        {!threads.length && <p className="muted">Sin conversaciones.</p>}
        <ul className="thread-list">
          {threads.map((t) => {
            const o = other(t, me.id);
            const last = t.messages.at(-1);
            const hasUnread = t.messages.some((m) => m.from !== me.id && !m.readAt);
            return (
              <li key={t.id} aria-current={t.id === current?.id ? "true" : undefined}>
                <Link href={`/mensajes?tab=mensajes&t=${t.id}`}>
                  <strong>{o?.name ?? "—"}</strong>{hasUnread && <span className="tag media" style={{ marginLeft: 6 }}>nuevo</span>}
                  <br /><span className="muted">{t.subject} · {last ? fmtDT(last.at) : ""}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link href="/mensajes?tab=mensajes" className="btn secondary small" style={{ marginTop: 8 }}>Nueva conversación</Link>
      </aside>
      <section>
        {current ? (
          <>
            <h2>{current.subject}</h2>
            <p className="muted">Con {other(current, me.id)?.name}</p>
            <ol className="messages">
              {current.messages.map((m) => (
                <li key={m.id} className={m.from === me.id ? "mine" : ""}>
                  <span className="eyebrow">{who(m.from)} · {fmtDT(m.at)}</span>
                  <p style={{ margin: 0 }}>{m.body}</p>
                  {m.notifyAt && <span className="muted" style={{ fontSize: ".8rem" }}>Notificación diferida al {fmtDT(m.notifyAt)} por horario de contacto</span>}
                </li>
              ))}
            </ol>
            <form action={sendMessage} className="card">
              <input type="hidden" name="threadId" value={current.id} />
              <div className="field"><label htmlFor="body">Responder</label><textarea id="body" name="body" rows={3} required /></div>
              <button className="btn primary">Enviar</button>
            </form>
          </>
        ) : (
          <>
            <h2>Nueva conversación</h2>
            <form action={sendMessage} className="card">
              <div className="field">
                <label htmlFor="to">Para</label>
                <select id="to" name="to" required defaultValue="">
                  <option value="" disabled>Seleccione…</option>
                  {recipients.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.description}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="subject">Asunto</label><input id="subject" name="subject" maxLength={120} /></div>
              <div className="field"><label htmlFor="body">Mensaje</label><textarea id="body" name="body" rows={5} required /></div>
              <p className="muted">Horario de contacto: lunes a viernes, 08:00 a 18:00. Fuera de ese horario el mensaje se entrega igual, pero la notificación llega al inicio del siguiente horario hábil.</p>
              <button className="btn primary">Enviar</button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
