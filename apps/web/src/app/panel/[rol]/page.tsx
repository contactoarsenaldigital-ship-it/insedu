import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can, formatRut, maskRut, attendanceRate, recognize, currentStreak, type Alert } from "@insedu/domain";
import { courseById, dec, fullName, pct, reportFor, school, studentById } from "@/lib/demo";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { suggest } from "@/lib/exports";
import { DownloadLinks } from "@/components/DownloadLinks";

export const dynamic = "force-dynamic";

type Params = { rol: string };

const DIM_ICON: Record<Alert["dimension"], string> = { asistencia: "◷", academica: "✎", conducta: "◆", salud: "✚" };

/** Cada panel exige sesión y muestra solo lo que corresponde a quien ingresó. */
export default async function Panel({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ curso?: string }> }) {
  await readState();
  const { rol } = await params;
  if (rol === "salvaguarda") redirect("/salvaguarda");
  if (!["profesor-jefe", "estudiante", "apoderado", "direccion"].includes(rol)) notFound();
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=${encodeURIComponent(`/panel/${rol}`)}`);
  const { person, scope } = session;

  switch (rol) {
    case "profesor-jefe": {
      // Profesor jefe: su curso. Dirección, inspectoría y equipo de apoyo: cualquier curso, con selector.
      const courses = school().courses.filter((c) => can(person.roles, "course.read", scope, { courseId: c.id }));
      if (!courses.length) return <NoAccess text="Este panel es para profesores jefe, dirección, inspectoría y el equipo de apoyo." hint="Carolina Fuentes (profesora jefe de 5° Básico A)" />;
      const wanted = (await searchParams).curso;
      const course = courses.find((c) => c.id === wanted) ?? courses.find((c) => scope.headOfCourseIds.includes(c.id)) ?? courses[0]!;
      return <HeadTeacher courseId={course.id} choices={courses.length > 1 ? courses.map((c) => ({ id: c.id, name: c.name })) : []} />;
    }
    case "estudiante":
      if (!person.roles.includes("student")) return <NoAccess text="Este panel muestra el avance de cada estudiante y solo lo ve el propio estudiante." hint="Trinidad Valenzuela (estudiante)" />;
      return <StudentView studentId={person.id} />;
    case "apoderado":
      if (!person.wards?.length) return <NoAccess text="Este resumen semanal es para el apoderado de cada estudiante." hint="el apoderado de Trinidad Valenzuela" />;
      return <GuardianView studentId={person.wards[0]!} />;
    default:
      if (!person.roles.some((r) => r === "director" || r === "school_admin")) return <NoAccess text="Este panel es para dirección y administración del establecimiento." hint="Jorge Valenzuela (director)" />;
      return <DirectorView />;
  }
}

function NoAccess({ text, hint }: { text: string; hint: string }) {
  return (
    <main className="wrap" style={{ maxWidth: 720 }}>
      <h1>Panel no disponible para su perfil</h1>
      <p className="notice warn">{text}</p>
      <p className="muted">Para verlo en la demostración, <Link href="/ingresar">cambie de usuario</Link> e ingrese, por ejemplo, como {hint}.</p>
    </main>
  );
}

function HeadTeacher({ courseId, choices }: { courseId: string; choices: { id: string; name: string }[] }) {
  const course = courseById(courseId)!;
  const r = reportFor(course.id);
  const byStudent = new Map<string, Alert[]>();
  for (const a of r.alerts) byStudent.set(a.studentId, [...(byStudent.get(a.studentId) ?? []), a]);
  return (
    <main className="wrap">
      <span className="muted">Profesor jefe · {course.name}</span>
      <h1>¿Quién necesita atención?</h1>
      {choices.length > 0 && (
        <nav className="tabs" aria-label="Curso">
          {choices.map((c) => <Link key={c.id} href={`/panel/profesor-jefe?curso=${c.id}`} aria-current={c.id === course.id ? "page" : undefined}>{c.name}</Link>)}
        </nav>
      )}
      <div className="grid section">
        <Kpi label="Asistencia del curso" value={pct(r.summary.avgAttendance)} />
        <Kpi label="Promedio del curso" value={dec(r.summary.avgGrade)} />
        <Kpi label="Estudiantes con alertas" value={`${r.summary.studentsWithAlerts} de ${r.summary.students}`} />
        <Kpi
          label="Alertas por dimensión"
          value={`${r.summary.byDimension.asistencia} · ${r.summary.byDimension.academica} · ${r.summary.byDimension.conducta} · ${r.summary.byDimension.salud}`}
          hint="Asistencia · Académica · Conducta · Salud"
        />
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Indicadores deficitarios priorizados</h2>
          <DownloadLinks tipo="alertas" params={{ courseId: course.id }} />
        </div>
        <p className="muted">Cada alerta indica el valor y el umbral configurado por el colegio. Las alertas apoyan su decisión; no diagnostican ni sancionan.</p>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Estudiante</th><th>Alertas</th><th>Acción sugerida</th></tr></thead>
            <tbody>
              {[...byStudent.entries()].map(([sid, alerts]) => {
                const st = studentById(sid)!;
                return (
                  <tr key={sid}>
                    <td><strong>{fullName(st)}</strong><br /><span className="muted">{maskRut(st.rut)}</span></td>
                    <td>
                      {alerts.map((a) => (
                        <div key={a.code} style={{ marginBottom: 4 }}>
                          <span className={`tag ${a.severity}`}>{DIM_ICON[a.dimension]} {a.dimension} · {a.severity}</span>{" "}
                          {a.reason}
                        </div>
                      ))}
                    </td>
                    <td className="muted">{suggest(alerts)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Ranking de progreso del curso</h2>
          <DownloadLinks tipo="ranking" params={{ courseId: course.id }} caption="Curso completo" />
        </div>
        <p className="muted">Ordena por mejora respecto de la propia línea base de cada estudiante; 50 = sin cambio.</p>
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>#</th><th>Estudiante</th><th>Progreso</th><th>Asistencia</th><th>Notas</th><th>Conducta</th></tr></thead>
            <tbody>
              {r.ranking.slice(0, 10).map((p) => (
                <tr key={p.studentId}>
                  <td>{p.position}</td>
                  <td>{fullName(studentById(p.studentId)!)}</td>
                  <td style={{ minWidth: 140 }}>
                    <strong>{p.score.toFixed(1).replace(".", ",")}</strong>
                    <div className="bar"><i style={{ width: `${p.score}%` }} /></div>
                  </td>
                  <td>{arrow(p.components.attendance)}</td>
                  <td>{arrow(p.components.grades)}</td>
                  <td>{arrow(p.components.conduct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}


const arrow = (x: number) => (x > 0.05 ? <span className="tag ok">▲ mejora</span> : x < -0.05 ? <span className="tag alta">▼ baja</span> : <span className="muted">= estable</span>);

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <span className="eyebrow">{label}</span>
      <span className="kpi">{value}</span>
      {hint && <span className="muted">{hint}</span>}
    </div>
  );
}

function studentContext(studentId: string) {
  const st = studentById(studentId)!;
  const course = courseById(st.courseId)!;
  const rank = reportFor(course.id).ranking.find((p) => p.studentId === st.id);
  return { st, course, rank };
}

function StudentView({ studentId }: { studentId: string }) {
  const { st, rank, course } = studentContext(studentId);
  const att = school().attendance.filter((a) => a.studentId === st.id);
  const streak = currentStreak(att.map((a) => a.status));
  const conduct = school().conduct.filter((c) => c.studentId === st.id && c.kind !== "negative").slice(-4).reverse();
  const recognitions = conduct.map((c) => ({ date: c.date, r: recognize({ type: "conduct", kind: c.kind, date: c.date })! }));
  return (
    <main className="wrap">
      <span className="muted">Estudiante · {course.name}</span>
      <h1>Hola, {st.firstName}.</h1>
      {rank && <p>Vas en el lugar <strong>{rank.position}</strong> del ranking de mejora de tu curso. Este ranking compara tu avance contigo mismo: todos pueden subir.</p>}
      <div className="grid section">
        {rank && <Kpi label="Tu progreso" value={rank.score.toFixed(1).replace(".", ",")} hint="50 = igual que antes; más alto = mejoraste" />}
        <Kpi label="Días seguidos asistiendo" value={String(streak)} hint="Insignias de constancia a los 5, 10, 20, 40 y 60 días" />
        <Kpi label="Tu asistencia" value={pct(attendanceRate(att.map((a) => a.status)))} />
      </div>
      <section className="section">
        <h2>Tus últimos reconocimientos</h2>
        <div className="grid">
          {recognitions.length === 0 && <p className="muted">Aún no hay reconocimientos en este periodo.</p>}
          {recognitions.map(({ date, r }, i) => (
            <div key={i} className="card">
              <span className="eyebrow">{date}</span>
              <h3>{r.message}</h3>
              <span className="tag ok">+{r.points} puntos{r.badge ? ` · insignia ${r.badge}` : ""}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function GuardianView({ studentId }: { studentId: string }) {
  const { st, course } = studentContext(studentId);
  const s = school();
  const lastWeek = s.schoolDays.slice(-5);
  const att = s.attendance.filter((a) => a.studentId === st.id && lastWeek.includes(a.date));
  const grades = s.grades.filter((g) => g.studentId === st.id).slice(-4);
  const positives = s.conduct.filter((c) => c.studentId === st.id && lastWeek.includes(c.date));
  return (
    <main className="wrap">
      <span className="muted">Apoderado de {fullName(st)} · {course.name}</span>
      <h1>Resumen de la semana</h1>
      <div className="grid section">
        <Kpi label="Asistencia de la semana" value={`${att.filter((a) => a.status === "present" || a.status === "late").length} de ${att.length} días`} hint={`${att.filter((a) => a.status === "late").length} atraso(s)`} />
        <Kpi label="Últimas notas" value={grades.map((g) => dec(g.value)).join(" · ") || "—"} hint={grades.map((g) => g.subject).join(", ")} />
        <Kpi label="Anotaciones de la semana" value={String(positives.length)} hint={positives.map((p) => p.description).join(" · ") || "Sin anotaciones"} />
      </div>
      <p className="notice">Si tiene dudas, escriba al profesor jefe desde Mensajes. Horario de respuesta: lunes a viernes, 08:00 a 18:00.</p>
    </main>
  );
}

function DirectorView() {
  const s = school();
  return (
    <main className="wrap">
      <span className="muted">Dirección · {s.name}</span>
      <div className="section-head">
        <h1>¿Cómo está el colegio?</h1>
        <DownloadLinks tipo="cursos" />
      </div>
      <div className="table-scroll section">
        <table className="data">
          <thead><tr><th>Curso</th><th>Asistencia</th><th>Promedio</th><th>Con alertas</th><th>Asistencia · Académica · Conducta · Salud</th></tr></thead>
          <tbody>
            {s.courses.map((c) => {
              const r = reportFor(c.id);
              return (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{pct(r.summary.avgAttendance)}</td>
                  <td>{dec(r.summary.avgGrade)}</td>
                  <td>{r.summary.studentsWithAlerts} ({pct(r.summary.shareWithAlerts)})</td>
                  <td>{r.summary.byDimension.asistencia} · {r.summary.byDimension.academica} · {r.summary.byDimension.conducta} · {r.summary.byDimension.salud}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">Dirección ve indicadores y estado de casos sin contenido confidencial. El expediente de Salvaguarda no es accesible por jerarquía.</p>
    </main>
  );
}
