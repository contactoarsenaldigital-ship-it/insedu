import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  can,
  evaluationStats,
  formatGrade,
  formatRut,
  weightedAverage,
  type Evaluation,
  type GradeEntry,
  type Lesson,
  type LessonStatus,
  type Student,
} from "@insedu/domain";
import { getSession, type Session } from "@/lib/session";
import { repo } from "@/lib/store";
import type { Subject } from "@/lib/repository";
import { addConduct, addEvaluation, createLesson, saveGrades, signLesson, updateLessonAttendance } from "../actions";
import { readState } from "@/lib/state";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<LessonStatus, string> = { present: "Presente", late: "Atraso", absent: "Ausente", justified: "Justificado" };
const STATUS_SHORT: Record<LessonStatus, string> = { present: "P", late: "T", absent: "A", justified: "J" };
const BLOCKS = ["1-2", "3-4", "5-6", "7-8", "9-10"];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
const fullName = (s: Student) => `${s.lastName}, ${s.firstName}`;

type Search = { tab?: string; ok?: string; error?: string; eval?: string };

export async function generateMetadata({ params }: { params: Promise<{ subjectId: string }> }) {
  const s = repo.subject(decodeURIComponent((await params).subjectId));
  return { title: s ? `${s.name} · ${repo.course(s.courseId)?.name}` : "Libro de clases" };
}

export default async function SubjectBook({ params, searchParams }: { params: Promise<{ subjectId: string }>; searchParams: Promise<Search> }) {
  await readState();
  const subjectId = decodeURIComponent((await params).subjectId);
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=${encodeURIComponent(`/libro/${subjectId}`)}`);
  const subject = repo.subject(subjectId);
  if (!subject) notFound();
  const course = repo.course(subject.courseId)!;
  const target = { subjectId, courseId: subject.courseId };
  const allowed = (a: Parameters<typeof can>[1]) => can(session.person.roles, a, session.scope, target);
  if (!allowed("course.read")) {
    return (
      <main className="wrap"><h1>Sin acceso</h1><p className="notice warn">Su perfil no tiene acceso a este libro.</p><Link className="btn" href="/libro">Volver</Link></main>
    );
  }

  const tabs = [
    { id: "clases", label: "Clases y asistencia" },
    { id: "notas", label: "Calificaciones" },
    { id: "anotaciones", label: "Anotaciones" },
    ...(allowed("corrections.read") || allowed("record.correct") ? [{ id: "correcciones", label: "Correcciones" }] : []),
  ];
  const tab = tabs.some((t) => t.id === sp.tab) ? sp.tab! : "clases";
  const students = repo.studentsOf(subject.courseId);

  return (
    <main className="wrap">
      <Link href="/libro" className="muted">← Libro de clases</Link>
      <h1 style={{ marginTop: 8 }}>{subject.name} · {course.name}</h1>
      <p className="muted">
        Docente: {repo.person(subject.teacherId)?.name} · Profesor jefe: {repo.person(course.headTeacherId)?.name} · {students.length} estudiantes
        {!allowed("grade.write") && " · Solo lectura"}
      </p>

      <nav className="tabs" aria-label="Secciones del libro">
        {tabs.map((t) => (
          <Link key={t.id} href={`/libro/${subjectId}?tab=${t.id}`} aria-current={t.id === tab ? "page" : undefined}>{t.label}</Link>
        ))}
      </nav>

      {sp.ok && <p className="notice ok" role="status">{sp.ok}</p>}
      {sp.error && <p className="notice warn" role="alert">{sp.error}</p>}

      {tab === "clases" && <Lessons subject={subject} students={students} session={session} canWrite={allowed("lesson.write")} canCorrect={allowed("record.correct")} />}
      {tab === "notas" && <Grades subject={subject} students={students} canWrite={allowed("grade.write")} canCorrect={allowed("record.correct")} selected={sp.eval} />}
      {tab === "anotaciones" && <Conduct subject={subject} students={students} canWrite={allowed("conduct.write")} />}
      {tab === "correcciones" && <Corrections courseId={subject.courseId} students={students} />}
    </main>
  );
}

// ───────────────────────────── Clases ─────────────────────────────

function Lessons({ subject, students, session, canWrite, canCorrect }: { subject: Subject; students: Student[]; session: Session; canWrite: boolean; canCorrect: boolean }) {
  const lessons = repo.lessonsOf(subject.id);
  return (
    <>
      {canWrite && (
        <section className="section">
          <h2>Registrar clase</h2>
          <form action={createLesson} className="card">
            <input type="hidden" name="subjectId" value={subject.id} />
            <div className="grid">
              <div className="field"><label htmlFor="date">Fecha</label><input id="date" name="date" type="date" defaultValue={today()} required /></div>
              <div className="field">
                <label htmlFor="block">Bloque</label>
                <select id="block" name="block">{BLOCKS.map((b) => <option key={b}>{b}</option>)}</select>
              </div>
              <div className="field"><label htmlFor="objective">Objetivo de aprendizaje</label><input id="objective" name="objective" placeholder="OA 3" /></div>
            </div>
            <div className="field">
              <label htmlFor="content">Actividad realizada (leccionario)</label>
              <textarea id="content" name="content" rows={3} required minLength={10} placeholder="Ej.: Resolución guiada de problemas con fracciones y trabajo en parejas." />
            </div>
            <h3>Asistencia de la clase</h3>
            <p className="muted">Todos parten como presentes: marque solo las excepciones.</p>
            <div className="table-scroll">
              <table className="data att">
                <thead><tr><th>Estudiante</th>{(Object.keys(STATUS_LABEL) as LessonStatus[]).map((s) => <th key={s} title={STATUS_LABEL[s]}>{STATUS_SHORT[s]}</th>)}</tr></thead>
                <tbody>
                  {students.map((st) => (
                    <tr key={st.id}>
                      <td>{fullName(st)}</td>
                      {(Object.keys(STATUS_LABEL) as LessonStatus[]).map((s) => (
                        <td key={s}>
                          <input type="radio" name={`att_${st.id}`} value={s} defaultChecked={s === "present"} aria-label={`${fullName(st)}: ${STATUS_LABEL[s]}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
              <input type="checkbox" name="sign" value="1" /> Firmar al guardar (después, cualquier cambio requiere corrección con motivo)
            </label>
            <button className="btn primary">Guardar clase</button>
          </form>
        </section>
      )}

      <section className="section">
        <h2>Clases registradas</h2>
        {!lessons.length && <p className="muted">Aún no hay clases registradas en esta asignatura.</p>}
        {lessons.map((l) => <LessonCard key={l.id} lesson={l} students={students} subject={subject} canWrite={canWrite} canCorrect={canCorrect} isAuthor={l.teacherId === session.person.id} />)}
      </section>
    </>
  );
}

function LessonCard({ lesson, students, subject, canWrite, canCorrect, isAuthor }: { lesson: Lesson; students: Student[]; subject: Subject; canWrite: boolean; canCorrect: boolean; isAuthor: boolean }) {
  const counts = (Object.keys(STATUS_LABEL) as LessonStatus[]).map((s) => `${STATUS_LABEL[s]}: ${Object.values(lesson.attendance).filter((x) => x === s).length}`);
  const editable = lesson.signedAt ? canCorrect : canWrite;
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <span className="eyebrow">{lesson.date} · bloque {lesson.block}{lesson.objective && ` · ${lesson.objective}`}</span>
      <p style={{ margin: 0 }}>{lesson.content}</p>
      <span className="muted">{counts.join(" · ")}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {lesson.signedAt ? (
          <span className="tag ok">✓ Firmada {new Date(lesson.signedAt).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</span>
        ) : (
          <>
            <span className="tag media">Borrador sin firmar</span>
            {canWrite && isAuthor && (
              <form action={signLesson}>
                <input type="hidden" name="subjectId" value={subject.id} />
                <input type="hidden" name="lessonId" value={lesson.id} />
                <button className="btn">Firmar clase</button>
              </form>
            )}
          </>
        )}
      </div>
      <details>
        <summary>Asistencia detallada{editable ? (lesson.signedAt ? " y correcciones" : " y edición") : ""}</summary>
        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table className="data">
            <thead><tr><th>Estudiante</th><th>Estado</th>{editable && <th>{lesson.signedAt ? "Corregir (requiere motivo)" : "Cambiar"}</th>}</tr></thead>
            <tbody>
              {students.map((st) => (
                <tr key={st.id}>
                  <td>{fullName(st)}</td>
                  <td>{lesson.attendance[st.id] ? STATUS_LABEL[lesson.attendance[st.id]!] : "—"}</td>
                  {editable && (
                    <td>
                      <form action={updateLessonAttendance} className="inline-form">
                        <input type="hidden" name="subjectId" value={subject.id} />
                        <input type="hidden" name="lessonId" value={lesson.id} />
                        <input type="hidden" name="studentId" value={st.id} />
                        <select name="status" defaultValue={lesson.attendance[st.id] ?? "present"} aria-label={`Nuevo estado de ${fullName(st)}`}>
                          {(Object.keys(STATUS_LABEL) as LessonStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                        {lesson.signedAt && <input name="reason" placeholder="Motivo de la corrección" minLength={10} required aria-label="Motivo" />}
                        <button className="btn secondary small">Guardar</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ───────────────────────────── Calificaciones ─────────────────────────────

function Grades({ subject, students, canWrite, canCorrect, selected }: { subject: Subject; students: Student[]; canWrite: boolean; canCorrect: boolean; selected?: string }) {
  const evals = repo.evaluationsOf(subject.id);
  const grades = repo.gradesOf(subject.id);
  const value = (e: Evaluation, st: Student) => grades.find((g) => g.evaluationId === e.id && g.studentId === st.id)?.value;
  const editing = canWrite ? evals.find((e) => e.id === selected) : undefined;

  return (
    <>
      {editing && <GradeEditor subject={subject} evaluation={editing} students={students} grades={grades} canCorrect={canCorrect} />}

      <section className="section">
        <h2>Planilla de notas</h2>
        <p className="muted">Promedio ponderado aproximado a la décima (0,05 sube). Notas bajo 4,0 marcadas con ▼.</p>
        <div className="table-scroll">
          <table className="data grades">
            <thead>
              <tr>
                <th>Estudiante</th>
                {evals.map((e) => (
                  <th key={e.id} title={`${e.date} · ponderación ${e.weight}`}>
                    {e.title}
                    <br />
                    <span className="muted" style={{ textTransform: "none" }}>{e.date.slice(5).split("-").reverse().join("/")} · ×{String(e.weight).replace(".", ",")}</span>
                    {canWrite && <><br /><Link href={`/libro/${subject.id}?tab=notas&eval=${e.id}`}>Ingresar / corregir</Link></>}
                  </th>
                ))}
                <th>Promedio</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st) => {
                const avg = weightedAverage(evals, grades, st.id);
                return (
                  <tr key={st.id}>
                    <td>{fullName(st)}</td>
                    {evals.map((e) => {
                      const v = value(e, st);
                      return <td key={e.id} className={v != null && v < 4 ? "low" : undefined}>{v != null && v < 4 ? "▼ " : ""}{formatGrade(v)}</td>;
                    })}
                    <td className={avg != null && avg < 4 ? "low" : undefined}><strong>{formatGrade(avg)}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {canWrite && (
        <section className="section">
          <h2>Nueva evaluación</h2>
          <form action={addEvaluation} className="card">
            <input type="hidden" name="subjectId" value={subject.id} />
            <div className="grid">
              <div className="field"><label htmlFor="title">Nombre</label><input id="title" name="title" required placeholder="Prueba de fracciones" /></div>
              <div className="field"><label htmlFor="edate">Fecha</label><input id="edate" name="date" type="date" defaultValue={today()} required /></div>
              <div className="field"><label htmlFor="weight">Ponderación</label><input id="weight" name="weight" defaultValue="1" inputMode="decimal" required /></div>
            </div>
            <button className="btn">Crear evaluación</button>
          </form>
        </section>
      )}
    </>
  );
}

function GradeEditor({ subject, evaluation, students, grades, canCorrect }: { subject: Subject; evaluation: Evaluation; students: Student[]; grades: GradeEntry[]; canCorrect: boolean }) {
  const stats = evaluationStats(evaluation, grades);
  const current = (st: Student) => grades.find((g) => g.evaluationId === evaluation.id && g.studentId === st.id)?.value;
  return (
    <section className="section">
      <h2>{evaluation.title} · {evaluation.date}</h2>
      <p className="muted">
        {stats.count} notas · promedio {formatGrade(stats.average)} · {stats.failing} bajo 4,0 ({Math.round(stats.failingShare * 100)} %).
        Puede escribir 5,5 · 5.5 · 55.
      </p>
      <form action={saveGrades} className="card">
        <input type="hidden" name="subjectId" value={subject.id} />
        <input type="hidden" name="evaluationId" value={evaluation.id} />
        <div className="grade-inputs">
          {students.map((st) => (
            <label key={st.id} className="grade-input">
              <span>{fullName(st)}</span>
              <input name={`g_${st.id}`} defaultValue={current(st) != null ? formatGrade(current(st)) : ""} inputMode="decimal" autoComplete="off" maxLength={3} aria-label={`Nota de ${fullName(st)}`} />
            </label>
          ))}
        </div>
        {canCorrect && (
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="reason">Motivo (obligatorio solo si modifica notas ya registradas)</label>
            <input id="reason" name="reason" placeholder="Ej.: Error de digitación al traspasar desde la prueba" />
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn primary">Guardar notas</button>
          <Link className="btn secondary" href={`/libro/${subject.id}?tab=notas`}>Cancelar</Link>
        </div>
      </form>
    </section>
  );
}

// ───────────────────────────── Anotaciones ─────────────────────────────

const KIND_LABEL = { positive: "Positiva", negative: "Negativa", commendation: "Felicitación" } as const;

function Conduct({ subject, students, canWrite }: { subject: Subject; students: Student[]; canWrite: boolean }) {
  const records = repo.conductOf(subject.courseId).slice(0, 40);
  const byId = new Map(students.map((s) => [s.id, s]));
  return (
    <>
      {canWrite && (
        <section className="section">
          <h2>Registrar anotación</h2>
          <form action={addConduct} className="card">
            <input type="hidden" name="subjectId" value={subject.id} />
            <div className="grid">
              <div className="field">
                <label htmlFor="studentId">Estudiante</label>
                <select id="studentId" name="studentId" required defaultValue="">
                  <option value="" disabled>Seleccione…</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="kind">Tipo</label>
                <select id="kind" name="kind" defaultValue="positive">
                  <option value="positive">Positiva</option>
                  <option value="commendation">Felicitación</option>
                  <option value="negative">Negativa</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="severity">Gravedad (solo negativas)</label>
                <select id="severity" name="severity" defaultValue="leve">
                  <option value="leve">Leve</option><option value="grave">Grave</option><option value="gravisima">Gravísima</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="description">Hecho observado</label>
              <textarea id="description" name="description" rows={2} required minLength={10} maxLength={500} placeholder="Describa la conducta concreta, sin juicios sobre la persona." />
            </div>
            <button className="btn primary">Registrar</button>
          </form>
        </section>
      )}
      <section className="section">
        <h2>Anotaciones del curso</h2>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Fecha</th><th>Estudiante</th><th>Tipo</th><th>Hecho</th><th>Registrado por</th></tr></thead>
            <tbody>
              {records.map((r) => {
                const st = byId.get(r.studentId);
                return (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{st ? fullName(st) : "—"}</td>
                    <td><span className={`tag ${r.kind === "negative" ? (r.severity === "leve" ? "media" : "alta") : "ok"}`}>{KIND_LABEL[r.kind]}{r.severity ? ` · ${r.severity === "gravisima" ? "gravísima" : r.severity}` : ""}</span></td>
                    <td>{r.description}</td>
                    <td className="muted">{repo.person(r.recordedBy)?.name ?? "Docente"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ───────────────────────────── Correcciones ─────────────────────────────

const TARGET_LABEL = { grade: "Nota", lesson_attendance: "Asistencia de clase", lesson_content: "Leccionario", daily_attendance: "Asistencia diaria" } as const;

function Corrections({ courseId, students }: { courseId: string; students: Student[] }) {
  const items = repo.correctionsOf(courseId);
  const byId = new Map(students.map((s) => [s.id, s]));
  return (
    <section className="section">
      <h2>Historial de correcciones del curso</h2>
      <p className="muted">Ningún registro oficial se sobrescribe: cada cambio queda con valor anterior, motivo, autor y fecha.</p>
      {!items.length && <p className="muted">Sin correcciones registradas.</p>}
      {items.length > 0 && (
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Fecha</th><th>Registro</th><th>Estudiante</th><th>Cambio</th><th>Motivo</th><th>Autor</th></tr></thead>
            <tbody>
              {items.map((c) => {
                const st = c.studentId ? byId.get(c.studentId) : undefined;
                return (
                  <tr key={c.id}>
                    <td>{new Date(c.at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</td>
                    <td>{TARGET_LABEL[c.target]}</td>
                    <td>{st ? <>{fullName(st)}<br /><span className="muted">{formatRut(st.rut)}</span></> : "—"}</td>
                    <td>{fmt(c.before)} → <strong>{fmt(c.after)}</strong></td>
                    <td>{c.reason}</td>
                    <td className="muted">{repo.person(c.by)?.name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const fmt = (v: unknown) => (typeof v === "string" && v in STATUS_LABEL ? STATUS_LABEL[v as LessonStatus] : v == null ? "—" : String(v));
