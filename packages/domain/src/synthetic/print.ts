import { courseReport } from "../analytics";
import { formatRut } from "../rut";
import { generateSchool } from "./generator";

const school = generateSchool();
console.log(`${school.name} · RBD ${school.rbd}`);
console.log(
  `${school.courses.length} cursos · ${school.students.length} estudiantes · ${school.schoolDays.length} días · ` +
    `${school.attendance.length} registros de asistencia · ${school.grades.length} notas`,
);
for (const c of school.courses) {
  const r = courseReport(school, c.id);
  const top = r.ranking[0]!;
  const st = school.students.find((s) => s.id === top.studentId)!;
  console.log(
    `\n${c.name}: asistencia ${(r.summary.avgAttendance * 100).toFixed(1)} %, promedio ${r.summary.avgGrade?.toFixed(2)}, ` +
      `${r.summary.studentsWithAlerts} con alertas (${(r.summary.shareWithAlerts * 100).toFixed(0)} %)`,
  );
  console.log(`  Lidera el ranking de progreso: ${st.firstName} ${st.lastName} (${formatRut(st.rut)}) · ${top.score}`);
  for (const a of r.alerts.slice(0, 3)) console.log(`  [${a.severity}] ${a.studentId} ${a.dimension}: ${a.reason}`);
}
