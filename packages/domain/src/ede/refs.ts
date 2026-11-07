/**
 * Códigos numéricos de las tablas de referencia del Estándar de Datos para la Educación (EDE).
 *
 * Los números válidos viven en la base plantilla del validador oficial (ceds-nds-v7_1, cifrada). Las reglas
 * del validador a veces usan el número fijo y a veces lo buscan por nombre. Aquí se anota cada código con:
 * - `lookup`: tabla, columna y texto con que se busca en la base oficial (para generar el diccionario real).
 * - `observed`: número que aparece fijo en una regla del validador (Admin-EDE/DockerEdeCode).
 * - `inferred`: número deducido (por ejemplo, del orden estándar de CEDS). Debe confirmarse.
 * El exportador solo usa códigos presentes en el diccionario que recibe; los faltantes se informan.
 */

export type EdeRefKey =
  | "role.estudiante" | "role.docente" | "role.profesorJefe"
  | "orgType.school" | "orgType.course" | "orgType.courseSection"
  | "orgIdSystem.rbd"
  | "idSystem.run" | "idSystem.ipe" | "idSystem.listNumber" | "idSystem.schoolNumber"
  | "sex.male" | "sex.female"
  | "attEvent.daily" | "attEvent.classSection"
  | "attStatus.present" | "attStatus.excusedAbsence" | "attStatus.unexcusedAbsence" | "attStatus.tardy"
  | "personStatus.asignadoCurso" | "personStatus.matriculaDefinitiva"
  | "calendarEvent.suspension";

export type EdeRefSource = { lookup: string; observed?: number; inferred?: number; note?: string };

export const EDE_REF_SOURCES: Record<EdeRefKey, EdeRefSource> = {
  "role.estudiante": { lookup: "Role.Name = 'Estudiante'", observed: 6, note: "fn28A, fn6C0, fn6E0" },
  "role.docente": { lookup: "Role.Name = 'Docente'" },
  "role.profesorJefe": { lookup: "Role.Name = 'Profesor(a) Jefe'" },
  "orgType.school": { lookup: "RefOrganizationType.Code = 'K12School'" },
  "orgType.course": { lookup: "RefOrganizationType.Code = 'Course'", inferred: 21, note: "fn6C0 filtra estudiantes en tipo 21" },
  "orgType.courseSection": { lookup: "RefOrganizationType.Code = 'CourseSection'", inferred: 22, note: "fn6E0 busca horarios en tipo 22" },
  "orgIdSystem.rbd": { lookup: "RefOrganizationIdentificationSystem.Code = 'RBD'" },
  "idSystem.run": { lookup: "RefPersonIdentificationSystem.Code = 'RUN'" },
  "idSystem.ipe": { lookup: "RefPersonIdentificationSystem.Code = 'IPE'", inferred: 52, note: "fn28A identifica migrantes con el sistema 52" },
  "idSystem.listNumber": { lookup: "RefPersonIdentificationSystem.Code = 'listNumber'" },
  "idSystem.schoolNumber": { lookup: "RefPersonIdentificationSystem.Code = 'SchoolNumber'" },
  "sex.male": { lookup: "RefSex.Definition = 'Male'" },
  "sex.female": { lookup: "RefSex.Definition = 'Female'" },
  "attEvent.daily": { lookup: "RefAttendanceEventType.Code = 'DailyAttendance'" },
  "attEvent.classSection": { lookup: "RefAttendanceEventType.Code = 'ClassSectionAttendance'", observed: 2, note: "fn5E0" },
  "attStatus.present": { lookup: "RefAttendanceStatus.Code = 'Present'", observed: 1, note: "fn5E0: 1 presente" },
  "attStatus.excusedAbsence": { lookup: "RefAttendanceStatus.Code = 'ExcusedAbsence'", inferred: 2, note: "fn5E0: 2 o 3 ausente; orden CEDS" },
  "attStatus.unexcusedAbsence": { lookup: "RefAttendanceStatus.Code = 'UnexcusedAbsence'", inferred: 3, note: "fn5E0: 2 o 3 ausente; orden CEDS" },
  "attStatus.tardy": { lookup: "RefAttendanceStatus.Code = 'Tardy'", observed: 4, note: "fn5E0: 4 atrasado" },
  "personStatus.asignadoCurso": { lookup: "RefPersonStatusType.Description = 'Estudiante asignado a un curso, se crea número de lista'" },
  "personStatus.matriculaDefinitiva": { lookup: "RefPersonStatusType.Description = 'Estudiante con matrícula definitiva'" },
  "calendarEvent.suspension": { lookup: "RefCalendarEventType (suspensión de clases): descripción por confirmar" },
};

export type EdeRefs = Partial<Record<EdeRefKey, number>>;

/** Diccionario provisional: solo los números vistos o deducidos en las reglas. No reemplaza al oficial. */
export function provisionalRefs(): EdeRefs {
  const out: EdeRefs = {};
  for (const [k, v] of Object.entries(EDE_REF_SOURCES) as [EdeRefKey, EdeRefSource][]) {
    const n = v.observed ?? v.inferred;
    if (n != null) out[k] = n;
  }
  return out;
}
