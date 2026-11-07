import Link from "next/link";
import { redirect } from "next/navigation";
import { PIE_GROUP_LABEL, type PieGroup } from "@insedu/domain";
import { school } from "@/lib/demo";
import { canOpenPie, canReadPie, statusOf } from "@/lib/pie";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";

export const metadata = { title: "Libro PIE" };
export const dynamic = "force-dynamic";

const GROUPS = Object.keys(PIE_GROUP_LABEL) as PieGroup[];

export default async function PieOverview() {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/pie");
  if (!canOpenPie(session)) {
    return <main className="wrap"><h1>Libro PIE</h1><p className="notice warn">El Libro PIE es para el equipo de aula, el equipo de apoyo, dirección y administración.</p></main>;
  }
  const courses = school().courses.filter((c) => canReadPie(session, c.id));
  return (
    <main className="wrap" style={{ maxWidth: 1040 }}>
      <h1>Libro PIE</h1>
      <p>Registro de planificación y evaluación del Programa de Integración Escolar. Es parte obligatoria del libro de clases de los cursos con estudiantes en el programa.</p>
      <p className="notice">Este registro no guarda diagnósticos: la nómina indica solo si la necesidad es permanente o transitoria. El diagnóstico sigue en el expediente de cada estudiante.</p>
      {courses.length === 0 ? <p className="muted section">No tiene cursos asignados en el programa.</p> : (
        <div className="table-scroll section">
          <table className="data">
            <thead><tr><th>Curso</th><th>Nómina</th><th>Equipo</th>{GROUPS.map((g) => <th key={g}>{PIE_GROUP_LABEL[g]}</th>)}<th>Sin firma</th><th>Apoyo, 7 días</th></tr></thead>
            <tbody>
              {courses.map((c) => {
                const s = statusOf(c.id);
                return (
                  <tr key={c.id}>
                    <td><Link href={`/pie/${c.id}`}><strong>{c.name}</strong></Link></td>
                    <td>{s.students}</td>
                    <td>{s.team}</td>
                    {GROUPS.map((g) => <td key={g}>{s.entriesByGroup[g]}</td>)}
                    <td>{s.unsigned > 0 ? <span className="tag media">{s.unsigned}</span> : "0"}</td>
                    <td>{s.weeklySupportHours} h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted section">Las horas se expresan en horas pedagógicas de 45 minutos. Estas cifras muestran si hay registros, no evalúan su calidad ni el cumplimiento normativo.</p>
    </main>
  );
}
