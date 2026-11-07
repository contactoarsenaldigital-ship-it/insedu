/**
 * Libro PIE: registro de planificación y evaluación de actividades del Programa de Integración
 * Escolar (Circular de registros, numeral 6.2.f). Es parte integral y obligatoria del libro del curso,
 * y está a cargo del docente de educación especial junto con los docentes de aula.
 *
 * Por resguardo de datos de menores no guarda diagnósticos: la nómina solo indica si la necesidad
 * es permanente o transitoria. El diagnóstico sigue en el expediente del estudiante.
 */
export type PieNeed = "permanente" | "transitoria";

export const PIE_NEED_LABEL: Record<PieNeed, string> = { permanente: "NEE permanente", transitoria: "NEE transitoria" };

/** Estudiante en la nómina del programa. El id es el del estudiante. */
export type PieStudent = { id: string; need: PieNeed; since: string; until?: string; endReason?: string; by: string };

export type PieTeamMember = { id: string; courseId: string; personId: string; role: string; weeklyHours?: number; active: boolean };

export type PieGroup = "equipo" | "planificacion" | "implementacion" | "familia";

export const PIE_GROUP_LABEL: Record<PieGroup, string> = {
  equipo: "Equipo de aula",
  planificacion: "Planificación del proceso educativo",
  implementacion: "Implementación y evaluación",
  familia: "Familia y comunidad",
};

export type PieSection =
  | "coordinacion" | "estrategias" | "colaborativo" | "diversidad" | "plan_individual" | "familia_plan"
  | "evaluacion" | "apoyo" | "logros" | "familia" | "comunidad" | "actas";

type SectionRule = { label: string; group: PieGroup; needsStudents?: boolean; needsMinutes?: boolean; needsParticipants?: boolean };

/** Los ítems que enumera la Circular, en su mismo orden. */
export const PIE_SECTIONS: Record<PieSection, SectionRule> = {
  coordinacion: { label: "Reunión de coordinación", group: "equipo", needsParticipants: true },
  estrategias: { label: "Estrategias diversificadas", group: "planificacion" },
  colaborativo: { label: "Trabajo colaborativo", group: "planificacion" },
  diversidad: { label: "Respuesta a la diversidad y adecuaciones curriculares", group: "planificacion" },
  plan_individual: { label: "Plan de apoyo individual", group: "planificacion", needsStudents: true },
  familia_plan: { label: "Estrategias de trabajo con la familia y la comunidad", group: "planificacion" },
  evaluacion: { label: "Aplicación y evaluación de estrategias", group: "implementacion" },
  apoyo: { label: "Apoyo a estudiante o grupo", group: "implementacion", needsStudents: true, needsMinutes: true },
  logros: { label: "Logros de aprendizaje", group: "implementacion", needsStudents: true },
  familia: { label: "Trabajo con la familia, apoderados o estudiante", group: "familia" },
  comunidad: { label: "Trabajo con la comunidad y el entorno escolar", group: "familia" },
  actas: { label: "Acta de reunión", group: "familia", needsParticipants: true },
};

export const sectionsOf = (group: PieGroup) => (Object.keys(PIE_SECTIONS) as PieSection[]).filter((s) => PIE_SECTIONS[s].group === group);

export type PiePlace = "aula_comun" | "aula_recursos" | "otro";

export const PIE_PLACE_LABEL: Record<PiePlace, string> = { aula_comun: "Aula común", aula_recursos: "Aula de recursos", otro: "Otro espacio" };

export type PieSignature = { by: string; at: string; method: "mineduc" | "interno"; rut?: string };

export type PieEntry = {
  id: string;
  courseId: string;
  section: PieSection;
  date: string;
  text: string;
  studentIds: string[];
  participantIds: string[];
  minutes?: number;
  place?: PiePlace;
  /** Plan individual: aprobación del estudiante y del apoderado, cuando se obtuvo. */
  approvedByStudent?: boolean;
  approvedByGuardian?: boolean;
  createdBy: string;
  createdAt: string;
  /** Firmas del equipo; un apoyo en codocencia lleva más de una. */
  signatures: PieSignature[];
};

export type PieDraft = Pick<PieEntry, "section" | "date" | "text" | "studentIds" | "participantIds" | "minutes" | "place">;

export function pieEntryIssues(d: PieDraft, ctx: { today: string; nominated: string[]; team: string[] }): string[] {
  const rule = PIE_SECTIONS[d.section];
  if (!rule) return ["Elija el tipo de registro"];
  const issues: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) issues.push("Indique la fecha");
  else if (d.date > ctx.today) issues.push("La fecha no puede ser futura");
  if (d.text.trim().length < 10) issues.push("Describa lo registrado (mínimo 10 caracteres)");
  if (d.text.length > 3000) issues.push("El texto es demasiado extenso");
  if (rule.needsStudents && d.studentIds.length === 0) issues.push("Elija al menos un estudiante de la nómina");
  if (d.studentIds.some((id) => !ctx.nominated.includes(id))) issues.push("Hay estudiantes que no están en la nómina PIE del curso");
  if (rule.needsParticipants && d.participantIds.length === 0) issues.push("Indique quiénes participaron");
  if (d.participantIds.some((id) => !ctx.team.includes(id))) issues.push("Hay participantes que no son del equipo de aula");
  if (rule.needsMinutes) {
    if (!d.minutes || d.minutes < 5 || d.minutes > 480) issues.push("Indique la duración del apoyo en minutos (5 a 480)");
    if (!d.place) issues.push("Indique dónde se realizó el apoyo");
  }
  return issues;
}

/** Puede firmar: integrante del equipo que aún no firma ese registro. */
export function pieSignIssues(e: PieEntry, personId: string, team: string[]): string[] {
  if (!team.includes(personId)) return ["Solo el equipo de aula del curso puede firmar este registro"];
  if (e.signatures.some((s) => s.by === personId)) return ["Usted ya firmó este registro"];
  return [];
}

export type PieCourseStatus = {
  students: number;
  team: number;
  entriesByGroup: Record<PieGroup, number>;
  unsigned: number;
  /** Partes del registro todavía sin ninguna anotación. */
  emptyGroups: PieGroup[];
  /** Horas pedagógicas (45 min) de apoyo en los últimos 7 días. */
  weeklySupportHours: number;
};

export function pieCourseStatus(entries: PieEntry[], students: number, team: number, today: string): PieCourseStatus {
  const groups = Object.keys(PIE_GROUP_LABEL) as PieGroup[];
  const entriesByGroup = Object.fromEntries(groups.map((g) => [g, entries.filter((e) => PIE_SECTIONS[e.section].group === g).length])) as Record<PieGroup, number>;
  const from = new Date(`${today}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 7);
  const since = from.toISOString().slice(0, 10);
  const minutes = entries.filter((e) => e.section === "apoyo" && e.date > since && e.date <= today).reduce((sum, e) => sum + (e.minutes ?? 0), 0);
  return {
    students,
    team,
    entriesByGroup,
    unsigned: entries.filter((e) => e.signatures.length === 0).length,
    emptyGroups: groups.filter((g) => entriesByGroup[g] === 0 && !(g === "equipo" && team > 0)),
    weeklySupportHours: Math.round((minutes / 45) * 10) / 10,
  };
}
