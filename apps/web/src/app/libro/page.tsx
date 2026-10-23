import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@insedu/domain";
import { getSession } from "@/lib/session";
import { repo } from "@/lib/store";
import { studentById } from "@/lib/demo";
import { studentLabel } from "@/lib/format";
import { forPerson } from "@/lib/instructions";
import { acknowledgeInstruction } from "./instructions-actions";
import { readState } from "@/lib/state";

export const metadata = { title: "Libro de clases" };
export const dynamic = "force-dynamic";

export default async function LibroIndex() {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/libro");
  const { person, scope } = session;

  const visible = repo
    .subjects()
    .filter((s) => can(person.roles, "course.read", scope, { subjectId: s.id, courseId: s.courseId }));
  const mine = new Set(scope.subjectIds);
  const instructions = forPerson(person.id, person.roles, scope.headOfCourseIds, (sid) => studentById(sid)?.courseId);

  return (
    <main className="wrap">
      <span className="muted">{person.name} · {person.description}</span>
      <h1>Libro de clases</h1>
      <p>Registre una sola vez la asistencia de la clase, el leccionario, las notas y las anotaciones. INSEDU genera los archivos para la carga en los sistemas del MINEDUC.</p>

      {instructions.length > 0 && (
        <section className="section">
          <h2>Instrucciones de protección vigentes</h2>
          <p className="muted">Emitidas por Salvaguarda. Indican solo lo que usted debe hacer; los antecedentes son confidenciales.</p>
          <div className="grid">
            {instructions.map((i) => (
              <form key={i.id} action={acknowledgeInstruction} className="card instruction">
                <input type="hidden" name="id" value={i.id} />
                <span className="eyebrow">{studentLabel(i.studentId)} · hasta {i.validUntil}</span>
                <h3>{i.action}</h3>
                <span className="muted">Retorno: {i.returnChannel}</span>
                {i.acknowledgedAt ? <span className="tag ok">✓ Recibida</span> : <button className="btn small">Confirmar recepción</button>}
              </form>
            ))}
          </div>
        </section>
      )}

      {repo.courses().map((c) => {
        const subjects = visible.filter((s) => s.courseId === c.id);
        if (!subjects.length) return null;
        const head = scope.headOfCourseIds.includes(c.id);
        return (
          <section key={c.id} className="section">
            <h2>{c.name} {head && <span className="tag ok">Profesor jefe</span>}</h2>
            <div className="grid">
              {subjects.map((s) => (
                <Link key={s.id} href={`/libro/${s.id}`} className={mine.has(s.id) ? "card mine" : "card"}>
                  <span className="eyebrow">{mine.has(s.id) ? "Su asignatura" : "Solo lectura"}</span>
                  <h3>{s.name}</h3>
                  <span className="muted">
                    {repo.person(s.teacherId)?.name} · {repo.evaluationsOf(s.id).length} evaluaciones · {repo.lessonsOf(s.id).length} clases registradas
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      {!visible.length && <p className="notice warn">Su perfil no tiene acceso al libro de clases.</p>}
    </main>
  );
}
