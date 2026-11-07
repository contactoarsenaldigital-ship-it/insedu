import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatRut, MEETING_LABEL, RELATION_LABEL } from "@insedu/domain";
import { Attachments } from "@/components/Attachments";
import { courseById, fullName, studentById } from "@/lib/demo";
import { actasOf, canRegisterMeeting, canSeeMeeting, meetingById } from "@/lib/entrevistas";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { findPerson } from "@/lib/store";

export const metadata = { title: "Entrevista o reunión" };
export const dynamic = "force-dynamic";

const studentName = (id?: string) => {
  const st = id ? studentById(id) : undefined;
  return st ? fullName(st) : "";
};

export default async function Meeting({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  await readState();
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=${encodeURIComponent(`/entrevistas/${id}`)}`);
  const m = meetingById(id);
  if (!m || !canSeeMeeting(session, m)) notFound();
  const sp = await searchParams;
  const staff = canRegisterMeeting(session, m.courseId);
  const signedAt = new Date(m.signature.at).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });

  return (
    <main className="wrap" style={{ maxWidth: 820 }}>
      <Link href={staff ? `/entrevistas?curso=${encodeURIComponent(m.courseId)}` : "/entrevistas"} className="muted">← Entrevistas y reuniones</Link>
      <h1 style={{ marginTop: 8 }}>{MEETING_LABEL[m.kind]}</h1>
      <p className="muted">{courseById(m.courseId)?.name}{m.studentId ? ` · ${studentName(m.studentId)}` : ""} · {m.date}, {m.time}</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}

      <section className="card section">
        <h2 style={{ marginTop: 0 }}>Motivo y temas tratados</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>{m.topics}</p>
        <h2>Acuerdos</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>{m.agreements}</p>
        <h2>Asistentes</h2>
        <ul>
          {m.attendees.map((a) => (
            <li key={`${a.studentId}:${a.name}`}>{a.name}{staff && a.rut ? ` · ${formatRut(a.rut)}` : ""} · {RELATION_LABEL[a.relation]}{m.kind === "reunion" ? ` de ${studentName(a.studentId)}` : ""}</li>
          ))}
        </ul>
        <p className="muted">Condujo {findPerson(m.by)?.name ?? m.by}. Firmado el {signedAt} {m.signature.method === "mineduc" ? "con el verificador del Mineduc" : "con el verificador de demostración"}. El registro no se modifica después de firmado.</p>
      </section>

      <section className="section">
        <h2>Acta firmada</h2>
        {!actasOf(m.id).length && <p className="notice warn">Falta adjuntar el acta firmada por {m.kind === "reunion" ? "los asistentes" : "el apoderado"}. El Estándar de Datos para la Educación la exige.</p>}
        <Attachments kind="entrevista" ownerId={m.id} hint="Acta firmada por el apoderado" />
      </section>
    </main>
  );
}
