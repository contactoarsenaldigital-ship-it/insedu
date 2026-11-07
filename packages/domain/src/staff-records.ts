/**
 * Datos del establecimiento que pide el Estándar de Datos para la Educación y que no viven en el libro:
 * - Capacidad autorizada de cada curso (CourseSection.MaximumCapacity; validación fn9F1).
 * - Títulos de los docentes y profesionales (PersonDegreeOrCertificate; validación fn9F0).
 */

export type CourseCapacity = { id: string; courseId: string; capacity: number; by: string; at: string };

export type StaffDegree = {
  id: string;
  personId: string;
  title: string;
  institution: string;
  /** Fecha de titulación, AAAA-MM-DD. */
  awardDate?: string;
  /** Habilitado para la docencia sin título de profesor (idoneidad docente). */
  idoneidad: boolean;
  by: string;
  at: string;
};

export function capacityIssues(value: string): string | null {
  if (!/^\d{1,3}$/.test(value.trim())) return "La capacidad debe ser un número entero";
  const n = Number(value);
  return n >= 1 && n <= 60 ? null : "La capacidad autorizada debe estar entre 1 y 60";
}

export function degreeIssues(d: { personId: string; title: string; institution: string; awardDate?: string }, ctx: { today: string; staffIds: string[] }): string[] {
  const issues: string[] = [];
  if (!ctx.staffIds.includes(d.personId)) issues.push("Seleccione a un docente o profesional");
  if (d.title.trim().length < 5) issues.push("Escriba el título o certificado (mínimo 5 caracteres)");
  if (d.institution.trim().length < 3) issues.push("Escriba la institución que lo otorgó");
  if (d.awardDate && (!/^\d{4}-\d{2}-\d{2}$/.test(d.awardDate) || d.awardDate > ctx.today)) issues.push("La fecha de titulación no es válida");
  return issues;
}
