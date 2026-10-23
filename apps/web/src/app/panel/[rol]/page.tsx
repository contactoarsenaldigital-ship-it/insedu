import { notFound, redirect } from "next/navigation";
import { formatRut, maskRut, attendanceRate, recognize, currentStreak, type Alert } from "@insedu/domain";
import { courseById, dec, fullName, pct, reportFor, school, studentById } from "@/lib/demo";
import { readState } from "@/lib/state";

export const dynamic = "force-dynamic";

type Params = { rol: string };

const DIM_ICON: Record<Alert["dimension"], string> = { asistencia: "◷", academica: "✎", conducta: "◆", salud: "✚" };

export default async function Panel({ params }: { params: Promise<Params> }) {
  await readState();
  const { rol } = await params;
  switch (rol) {
    case "profesor-jefe":
      return <HeadTeacher />;
    case "estudiante":
      return <StudentView />;
    case "apoderado":
      return <GuardianView />;
    case "direccion":
      return <DirectorView />;
    case "salvaguarda":
      redirect("/salvaguarda");
    default:
      notFound();
  }
}

function HeadTeacher() {
  const course = school().courses[0]!;
  const r = reportFor(course.id);
  const byStudent = new Map<string, Alert[]>();
  for (const a of r.alerts) byStudent.set(a.studentId, [...(byStudent.get(a.studentId) ?? []), a]);
  return (
    <main className="wrap">
      <span className="muted">Profesor jefe · {course.name}</span>
      <h1>¿Quién necesita atención?</h1>
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
        <h2>Indicadores deficitarios priorizados</h2>
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
        <h2>Ranking de progreso del curso</h2>
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

function suggest(alerts: Alert[]) {
  if (alerts.some((a) => a.dimension === "conducta" && a.severity === "alta")) return "Coordinar con inspectoría y citar al apoderado.";
  if (alerts.some((a) => a.dimension === "asistencia")) return "Contactar al apoderado y revisar causas de inasistencia.";
  if (alerts.some((a) => a.dimension === "academica")) return "Plan de reforzamiento con docentes de asignatura.";
  return "Derivar a orientación o enfermería según corresponda.";
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

function pickStudent() {
  // El estudiante que lidera el ranking de mejora del primer curso: muestra el valor del ranking de progreso.
  const course = school().courses[0]!;
  const top = reportFor(course.id).ranking[0]!;
  return { st: studentById(top.studentId)!, rank: top, course };
}

function StudentView() {
  const { st, rank, course } = pickStudent();
  const att = school().attendance.filter((a) => a.studentId === st.id);
  const streak = currentStreak(att.map((a) => a.status));
  const conduct = school().conduct.filter((c) => c.studentId === st.id && c.kind !== "negative").slice(-4).reverse();
  const recognitions = conduct.map((c) => ({ date: c.date, r: recognize({ type: "conduct", kind: c.kind, date: c.date })! }));
  return (
    <main className="wrap">
      <span className="muted">Estudiante · {course.name}</span>
      <h1>Hola, {st.firstName}.</h1>
      <p>Vas en el lugar <strong>{rank.position}</strong> del ranking de mejora de tu curso. Este ranking compara tu avance contigo mismo: todos pueden subir.</p>
      <div className="grid section">
        <Kpi label="Tu progreso" value={rank.score.toFixed(1).replace(".", ",")} hint="50 = igual que antes; más alto = mejoraste" />
        <Kpi label="Días seguidos asistiendo" value={String(streak)} hint="Próxima insignia de constancia en 5, 10, 20 y 40 días" />
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

function GuardianView() {
  const { st, course } = pickStudent();
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
      <h1>¿Cómo está el colegio?</h1>
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
