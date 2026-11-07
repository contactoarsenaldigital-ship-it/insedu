import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PIE_GROUP_LABEL, PIE_NEED_LABEL, PIE_PLACE_LABEL, PIE_SECTIONS, sectionsOf, type PieGroup } from "@insedu/domain";
import { PrintButton } from "@/components/PrintButton";
import { courseById, fullName, school, studentById } from "@/lib/demo";
import { canReadPie, entriesOf, nominaOf, teamOf } from "@/lib/pie";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { findPerson } from "@/lib/store";

export const metadata = { title: "Registro PIE" };
export const dynamic = "force-dynamic";

const nameOf = (id: string) => findPerson(id)?.name ?? id;
const studentName = (id: string) => {
  const st = studentById(id);
  return st ? fullName(st) : id;
};

/** Vista completa e imprimible: el Mineduc recomienda mantener también un respaldo impreso. */
export default async function PieRegister({ params }: { params: Promise<{ courseId: string }> }) {
  await readState();
  const { courseId } = await params;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=/pie/${courseId}/registro`);
  const course = courseById(courseId);
  if (!course) notFound();
  if (!canReadPie(session, courseId)) redirect("/pie");
  const entries = [...entriesOf(courseId)].reverse();
  const s = school();
  return (
    <main className="wrap pie-register" style={{ maxWidth: 860 }}>
      <p className="no-print"><Link href={`/pie/${courseId}`} className="muted">← Libro PIE del curso</Link></p>
      <p className="muted">{s.name} · RBD {s.rbd}</p>
      <h1>Registro de planificación y evaluación PIE · {course.name}</h1>

      <h2>Nómina</h2>
      {nominaOf(courseId).length === 0 ? <p className="muted">Sin estudiantes.</p> : <ul>{nominaOf(courseId).map((p) => <li key={p.id}>{studentName(p.id)} · {PIE_NEED_LABEL[p.need]} · desde {p.since}</li>)}</ul>}

      <h2>{PIE_GROUP_LABEL.equipo}: integrantes</h2>
      {teamOf(courseId).length === 0 ? <p className="muted">Sin integrantes.</p> : <ul>{teamOf(courseId).map((m) => <li key={m.id}>{nameOf(m.personId)} · {m.role}{m.weeklyHours != null ? ` · ${m.weeklyHours} horas semanales` : ""}</li>)}</ul>}

      {(Object.keys(PIE_GROUP_LABEL) as PieGroup[]).map((g) => (
        <section key={g}>
          <h2>{PIE_GROUP_LABEL[g]}</h2>
          {sectionsOf(g).map((sec) => {
            const of = entries.filter((e) => e.section === sec);
            return (
              <div key={sec}>
                <h3 className="form-group">{PIE_SECTIONS[sec].label}</h3>
                {of.length === 0 ? <p className="muted">Sin registros.</p> : of.map((e) => (
                  <div key={e.id} className="pie-print-entry">
                    <strong>{e.date}.</strong> {e.text}
                    {e.studentIds.length > 0 && <> Estudiantes: {e.studentIds.map(studentName).join(", ")}.</>}
                    {e.participantIds.length > 0 && <> Participantes: {e.participantIds.map(nameOf).join(", ")}.</>}
                    {e.minutes && <> {e.minutes} minutos{e.place ? `, ${PIE_PLACE_LABEL[e.place]}` : ""}.</>}
                    {" "}<em>{e.signatures.length ? `Firmado por ${e.signatures.map((x) => nameOf(x.by)).join(" y ")}.` : "Sin firmar."}</em>
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      ))}
      <p className="no-print section"><PrintButton /></p>
    </main>
  );
}
