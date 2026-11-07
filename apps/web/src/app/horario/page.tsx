import { redirect } from "next/navigation";
import { WEEKDAY_LABEL, WEEKDAYS } from "@insedu/domain";
import { studentById } from "@/lib/demo";
import { bells, canEditTimetable, slotsOf } from "@/lib/horario";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { repo, timetableState } from "@/lib/store";
import { loadExampleSchedule, saveBells, saveCourseSchedule } from "./actions";

export const metadata = { title: "Horario" };
export const dynamic = "force-dynamic";

export default async function Timetable({ searchParams }: { searchParams: Promise<{ curso?: string; ok?: string; error?: string }> }) {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/horario");
  const sp = await searchParams;
  const edit = canEditTimetable(session);
  const { bells: day, configured } = bells();
  const courses = repo.courses();
  const roles = session.person.roles;

  // Curso por omisión: el propio (estudiante o apoderado), el de jefatura, o el primero.
  const own = roles.includes("student") ? studentById(session.person.id)?.courseId : roles.includes("guardian_academic") ? studentById(session.person.wards?.[0] ?? "")?.courseId : session.scope.headOfCourseIds[0];
  const course = courses.find((c) => c.id === sp.curso) ?? courses.find((c) => c.id === own) ?? courses[0];
  const teaching = repo.subjects().filter((x) => x.teacherId === session.person.id).map((x) => x.id);
  const mine = timetableState().slots.filter((x) => teaching.includes(x.subjectId));
  const cell = (slots: ReturnType<typeof slotsOf>, weekday: number, period: number) => slots.find((x) => x.weekday === weekday && x.period === period);
  const label = (subjectId: string) => repo.subject(subjectId)?.name ?? "";

  return (
    <main className="wrap" style={{ maxWidth: 1100 }}>
      <h1>Horario</h1>
      <p>Jornada y asignaturas de cada curso. El libro lo usa para el bloque de cada clase y para revisar que la firma ocurra durante la clase, como exige el validador del Mineduc.</p>
      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}
      {!configured && <p className="notice warn">La jornada aún no se configura: se muestra la de ejemplo.</p>}

      {mine.length > 0 && (
        <section className="section">
          <h2>Mis clases</h2>
          <div className="table-scroll">
            <table className="data timetable">
              <thead><tr><th>Hora</th>{WEEKDAYS.map((d) => <th key={d}>{WEEKDAY_LABEL[d]}</th>)}</tr></thead>
              <tbody>
                {day.map((b) => (
                  <tr key={b.number}>
                    <th>{b.number}ª · {b.start}–{b.end}</th>
                    {WEEKDAYS.map((d) => {
                      const x = cell(mine, d, b.number);
                      return <td key={d}>{x ? `${label(x.subjectId)} · ${repo.course(x.courseId)?.name}` : ""}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {course && (
        <section className="section">
          <h2>Horario de {course.name}</h2>
          <form method="get" className="req-actions" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="curso">Curso</label>
              <select id="curso" name="curso" defaultValue={course.id}>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </div>
            <button className="btn secondary">Ver</button>
          </form>
          {/* La clave cambia con lo guardado: así React no conserva valores anteriores de los selectores. */}
          <form action={saveCourseSchedule} key={`${course.id}:${slotsOf(course.id).map((x) => `${x.weekday}${x.period}${x.subjectId}`).join(",")}`}>
            <input type="hidden" name="courseId" value={course.id} />
            <div className="table-scroll section">
              <table className="data timetable">
                <thead><tr><th>Hora</th>{WEEKDAYS.map((d) => <th key={d}>{WEEKDAY_LABEL[d]}</th>)}</tr></thead>
                <tbody>
                  {day.map((b) => (
                    <tr key={b.number}>
                      <th>{b.number}ª · {b.start}–{b.end}</th>
                      {WEEKDAYS.map((d) => {
                        const x = cell(slotsOf(course.id), d, b.number);
                        return (
                          <td key={d}>
                            {edit ? (
                              <select name={`slot_${d}_${b.number}`} defaultValue={x?.subjectId ?? ""} aria-label={`${WEEKDAY_LABEL[d]}, hora ${b.number}`}>
                                <option value="">—</option>
                                {repo.subjects().filter((s) => s.courseId === course.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            ) : x ? label(x.subjectId) : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {edit && <button className="btn primary">Guardar horario del curso</button>}
          </form>
        </section>
      )}

      {edit && (
        <section className="section">
          <h2>Jornada</h2>
          <p className="muted">Inicio y término de cada hora de clases. El término de la segunda hora define la asistencia válida para la subvención.</p>
          <form action={saveBells} className="card" style={{ maxWidth: 520 }} key={day.map((b) => `${b.start}${b.end}`).join(",")}>
            <input type="hidden" name="count" value={day.length} />
            {day.map((b) => (
              <div key={b.number} className="req-actions" style={{ alignItems: "center" }}>
                <strong style={{ width: 70 }}>{b.number}ª hora</strong>
                <input name={`start_${b.number}`} type="time" defaultValue={b.start} required aria-label={`Inicio hora ${b.number}`} />
                <input name={`end_${b.number}`} type="time" defaultValue={b.end} required aria-label={`Término hora ${b.number}`} />
              </div>
            ))}
            <button className="btn">Guardar jornada</button>
          </form>
          {timetableState().slots.length === 0 && process.env.INSEDU_DATA_MODE !== "real" && (
            <form action={loadExampleSchedule} className="section">
              <button className="btn secondary">Cargar horario de ejemplo (colegio ficticio)</button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
