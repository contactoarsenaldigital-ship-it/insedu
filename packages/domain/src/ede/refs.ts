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
  | "calendarEvent.suspension"
  | "orgType.codigoEnsenanza" | "orgType.grado"
  | "assessmentType.formativa" | "assessmentType.sumativa" | "scoreMetric.nota" | "assessmentStaffRole.estudiante"
  | "incidentBehavior.positiva" | "incidentBehavior.negativa" | "incidentPersonType.estudiante" | "incidentPersonType.docente"
  | "incidentPersonRole.estudiante" | "incidentReporterType.docente" | "incidentTime.horaClases"
  | "incidentPersonRole.registra" | "incidentPersonType.profesional" | "incidentPersonType.apoderado"
  | "incidentBehavior.entrevista" | "incidentBehavior.reunion"
  | "incidentPersonRole.entrevistado" | "incidentPersonRole.entrevistador" | "incidentPersonRole.asisteReunion" | "incidentPersonRole.dirigeReunion"
  | "relationship.apoderado" | "role.apoderado"
  | "attEvent.establecimiento" | "attStatus.earlyDeparture" | "roleStatus.enrolled" | "role.retira" | "role.funcionario"
  | "relationship.autorizadoRetiro" | "personStatus.retirado" | "incidentBehavior.entregaRetiro" | "incidentBehavior.entregaContinuidad"
  | "incidentPersonType.administrativo" | "incidentPersonType.otro" | "incidentPersonRole.entrega" | "incidentPersonRole.recibe"
  | "language.spanish" | "incidentBehavior.interesGeneral"
  | "personStatus.pie" | "personLocation.physical" | "orgRelationship.internal"
  | "orgType.modalidad" | "orgType.jornada" | "orgType.nivel" | "orgType.rama" | "orgType.sector" | "orgType.especialidad" | "orgType.tipoCurso"
  | "enrollmentStatus.current" | "orgIdentifierType.school"
  | "country.chile" | "emailType.home" | "emailType.organizational" | "personPhone.mobile" | "institutionPhone.main" | "orgLocationType.physical"
  | "degreeType.profesional" | "degreeType.magister" | "accreditation.national" | "accreditation.none" | "verification.copia_titulo" | "verification.certificado_oficial"
  | `academicSubject.${EdeSubjectArea}`
  | `disciplinaryAction.${DisciplinaryMeasureType}`;

import { MEASURE_LABEL, type DisciplinaryMeasureType } from "../discipline";

export type EdeSubjectArea = "matematica" | "lenguaje" | "idioma" | "historia" | "ciencias" | "artes" | "otra";

/** Área de RefAcademicSubject que corresponde a una asignatura, según su nombre. */
export function subjectArea(name: string): EdeSubjectArea {
  const n = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/matemat/.test(n)) return "matematica";
  if (/lenguaje|lengua y|comunicacion/.test(n)) return "lenguaje";
  if (/ingles|idioma|frances|aleman/.test(n)) return "idioma";
  if (/historia|geografia|sociales|ciudadan/.test(n)) return "historia";
  if (/ciencia|biologia|fisica(?! )|quimica/.test(n) && !/educacion fisica|ed\. fisica/.test(n)) return "ciencias";
  if (/arte|musica/.test(n)) return "artes";
  return "otra";
}

export type EdeRefSource = { lookup: string; observed?: number; inferred?: number; note?: string };

const disciplinarySources = Object.fromEntries(
  (Object.keys(MEASURE_LABEL) as DisciplinaryMeasureType[]).map((k) => [`disciplinaryAction.${k}`, { lookup: `RefDisciplinaryActionTaken («${MEASURE_LABEL[k]}»): por confirmar` }]),
) as Record<`disciplinaryAction.${DisciplinaryMeasureType}`, EdeRefSource>;

export const EDE_REF_SOURCES: Record<EdeRefKey, EdeRefSource> = {
  ...disciplinarySources,
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
  "orgType.codigoEnsenanza": { lookup: "RefOrganizationType del código de enseñanza (p. ej. «110:Enseñanza Básica»): por confirmar", note: "fn7F1 sube del curso al grado y al código de enseñanza por OrganizationRelationship" },
  "orgType.grado": { lookup: "RefOrganizationType del grado (p. ej. «110.05:5º Básico»): por confirmar" },
  "assessmentType.formativa": { lookup: "RefAssessmentType (evaluación formativa)", observed: 28, note: "fn7F0: 28 o 29" },
  "assessmentType.sumativa": { lookup: "RefAssessmentType (evaluación sumativa)", observed: 29, note: "fn7F1: notas 1,0 a 7,0 con tipo 29" },
  "scoreMetric.nota": { lookup: "RefScoreMetricType (nota de 1,0 a 7,0)", inferred: 1, note: "fn7F1 acepta 1 o 2" },
  "assessmentStaffRole.estudiante": { lookup: "RefAssessmentSessionStaffRoleType", observed: 6, note: "fn7F0-F2 unen AssessmentSessionStaffRole tipo 6 con el rol Estudiante" },
  "incidentBehavior.positiva": { lookup: "RefIncidentBehavior.Description = 'Anotación positiva'" },
  "incidentBehavior.negativa": { lookup: "RefIncidentBehavior (conducta negativa): catálogo por confirmar" },
  "incidentPersonType.estudiante": { lookup: "RefIncidentPersonType.Description = 'Estudiante' (por confirmar)" },
  "incidentPersonType.docente": { lookup: "RefIncidentPersonType.Description = 'Docente'", observed: 44, note: "fn8F2; fn1FA usa 44 con el comentario «docente»" },
  "incidentPersonRole.estudiante": { lookup: "RefIncidentPersonRoleType del estudiante anotado: por confirmar" },
  "incidentReporterType.docente": { lookup: "RefIncidentReporterType del docente que registra: por confirmar" },
  "incidentTime.horaClases": { lookup: "RefIncidentTimeDescriptionCode (durante la jornada): por confirmar", note: "fn8F2 lo exige" },
  "incidentPersonRole.registra": { lookup: "RefIncidentPersonRoleType de quien registra la anotación: por confirmar", note: "fn8F2 exige el rol en cada IncidentPerson" },
  "incidentPersonType.profesional": { lookup: "RefIncidentPersonType.Description = 'Profesional de la educación'", note: "fn8F2" },
  "incidentPersonType.apoderado": { lookup: "RefIncidentPersonType.Description = 'Apoderado'", observed: 43, note: "fn8F2, fn8F3; fn1FA usa 43 con el comentario «apoderado»" },
  "incidentBehavior.entrevista": { lookup: "RefIncidentBehavior.Description = 'Entrevista'", note: "fn8F0, fn8F2, fn8F3" },
  "incidentBehavior.reunion": { lookup: "RefIncidentBehavior.Description = 'Reunión con apoderados'", note: "fn8F0, fn8F2, fn8F3" },
  "incidentPersonRole.entrevistado": { lookup: "RefIncidentPersonRoleType.Description = 'Entrevistado'", note: "fn8F2" },
  "incidentPersonRole.entrevistador": { lookup: "RefIncidentPersonRoleType.Description = 'Entrevistador'", note: "fn8F2" },
  "incidentPersonRole.asisteReunion": { lookup: "RefIncidentPersonRoleType.Description = 'Asiste a reunión de apoderados'", note: "fn8F2" },
  "incidentPersonRole.dirigeReunion": { lookup: "RefIncidentPersonRoleType.Description = 'Dirige reunión de apoderados'", note: "fn8F2" },
  "relationship.apoderado": { lookup: "RefPersonRelationship.Code = 'Apoderado(a)/Tutor(a)'", inferred: 31, note: "fn8F3, fn1FB; fn1FA filtra la relación 31" },
  "role.apoderado": { lookup: "Role.Name = 'Padre, madre o apoderado'", inferred: 15, note: "fn8F3, fn0FB; fn1FA filtra el rol 15" },
  "attEvent.establecimiento": { lookup: "RefAttendanceEventType.Code = 'AsistenciaEstablecimiento'", note: "fn0FB: salida del establecimiento" },
  "attStatus.earlyDeparture": { lookup: "RefAttendanceStatus.Code = 'EarlyDeparture'", note: "fn0FB" },
  "roleStatus.enrolled": { lookup: "RefRoleStatus.Code = 'Enrolled'", note: "fn0FB exige el estado vigente del estudiante en la asignatura" },
  "role.retira": { lookup: "Role.Name = 'Persona que retira al estudiante'", note: "fn0FB" },
  "role.funcionario": { lookup: "Role del funcionario que ratifica un retiro (inspectoría, portería): por confirmar", note: "fn0FB exige oprIdRatificador" },
  "relationship.autorizadoRetiro": { lookup: "RefPersonRelationship de la persona autorizada a retirar: por confirmar", note: "fn0FA y fn0FB miran RetirarEstudianteIndicador" },
  "personStatus.retirado": { lookup: "RefPersonStatusType.Description = 'Estudiante retirado definitivamente'", observed: 30, note: "fn1FA, fn1FC" },
  "incidentBehavior.entregaRetiro": { lookup: "RefIncidentBehavior.Description = 'Entrega de documentos retiro de un estudiante'", observed: 33, note: "fn1FA" },
  "incidentBehavior.entregaContinuidad": { lookup: "RefIncidentBehavior.Description = 'Entrega de información para continuidad de estudios'", note: "fn1FC" },
  "incidentPersonType.administrativo": { lookup: "RefIncidentPersonType.Description = 'Personal Administrativo'", note: "fn8F2" },
  "incidentPersonType.otro": { lookup: "RefIncidentPersonType.Description = 'Adulto responsable o conocido del estudiante'", note: "fn8F2" },
  "incidentPersonRole.entrega": { lookup: "RefIncidentPersonRoleType de quien entrega documentos: por confirmar" },
  "incidentPersonRole.recibe": { lookup: "RefIncidentPersonRoleType de quien recibe documentos: por confirmar" },
  "language.spanish": { lookup: "RefLanguage del español (código 'spa'): por confirmar", note: "fn9F1 exige CourseSection.RefInstructionLanguageId" },
  "incidentBehavior.interesGeneral": { lookup: "RefIncidentBehavior.Description = 'Entrega de documentos de interés general'", note: "fn1FB" },
  "personStatus.pie": { lookup: "RefPersonStatusType.Description = 'Estudiante PIE'", note: "RefParticipationType no tiene PIE. Ninguna regla del validador revisa el PIE" },
  "orgType.modalidad": { lookup: "RefOrganizationType.Code = 'Modalidad'", note: "jerarquiasList" },
  "orgType.jornada": { lookup: "RefOrganizationType.Code = 'Jornada'" },
  "orgType.nivel": { lookup: "RefOrganizationType.Code = 'Nivel'" },
  "orgType.rama": { lookup: "RefOrganizationType.Code = 'Rama'" },
  "orgType.sector": { lookup: "RefOrganizationType.Code = 'Sector'" },
  "orgType.especialidad": { lookup: "RefOrganizationType.Code = 'Especialidad'" },
  "orgType.tipoCurso": { lookup: "RefOrganizationType.Code = 'TipoCurso'" },
  "orgIdentifierType.school": { lookup: "RefOrganizationIdentifierType.Code = 'MINEDUC'", note: "jerarquiasList identifica al establecimiento por este tipo" },
  "enrollmentStatus.current": { lookup: "RefEnrollmentStatus.Description = 'Currently enrolled'", note: "fn2FA" },
  "personLocation.physical": { lookup: "RefPersonLocationType.Code = 'Physical'" },
  "country.chile": { lookup: "RefCountry.Code = 'CL'", note: "fn2EA, fn3C3" },
  "emailType.home": { lookup: "RefEmailType.Code = 'Home'", note: "fn3FC" },
  "emailType.organizational": { lookup: "RefEmailType.Code = 'Organizational'", note: "fn3FC" },
  "personPhone.mobile": { lookup: "RefPersonTelephoneNumberType.Code = 'Mobile'", note: "fn3FD" },
  "institutionPhone.main": { lookup: "RefInstitutionTelephoneType.Code = 'Main'", note: "fn3FD" },
  "orgLocationType.physical": { lookup: "RefOrganizationLocationType.Code = 'Physical'", note: "fn3C3" },
  "degreeType.profesional": { lookup: "RefDegreeOrCertificateType.Code = '01051'", note: "fn3E1" },
  "degreeType.magister": { lookup: "RefDegreeOrCertificateType.Code = '01054'", note: "fn3E1" },
  "accreditation.national": { lookup: "RefHigherEducationInstitutionAccreditationStatus.Code = 'National'", note: "fn3E1" },
  "accreditation.none": { lookup: "RefHigherEducationInstitutionAccreditationStatus.Code = 'NotAccredited'", note: "fn3E1" },
  "verification.copia_titulo": { lookup: "RefEducationVerificationMethod.Code = 'DegreeCopy'", note: "fn3E1" },
  "verification.certificado_oficial": { lookup: "RefEducationVerificationMethod.Code = 'OfficialTranscript'", note: "fn3E1" },
  "orgRelationship.internal": { lookup: "RefOrganizationRelationship.Code = 'InternalOrganization'" },
  "academicSubject.matematica": { lookup: "RefAcademicSubject.Description = 'Mathematics'" },
  "academicSubject.lenguaje": { lookup: "RefAcademicSubject.Description = 'Reading/Language Arts'" },
  "academicSubject.idioma": { lookup: "RefAcademicSubject.Description = 'Foreign Languages'" },
  "academicSubject.historia": { lookup: "RefAcademicSubject.Description = 'Social Sciences'" },
  "academicSubject.ciencias": { lookup: "RefAcademicSubject.Description = 'Science'" },
  "academicSubject.artes": { lookup: "RefAcademicSubject.Description = 'Arts'" },
  "academicSubject.otra": { lookup: "RefAcademicSubject.Description = 'Other'" },
};

export type EdeRefs = Partial<Record<EdeRefKey, number>>;

/**
 * Diccionario tomado de los catálogos Ref* y Role de la plantilla en blanco del validador (ceds-nds-v7_1, Admin-EDE/DockerEdeCode).
 * Los marcados «interpretación» no tienen un código exacto en el catálogo: conviene confirmarlos con la Superintendencia.
 */
export const OFFICIAL_REFS: EdeRefs = {
  "role.estudiante": 6, "role.docente": 5, "role.profesorJefe": 4, "role.apoderado": 15, "role.retira": 18,
  "role.funcionario": 11, // interpretación: Personal administrativo
  "orgType.school": 10, "orgType.course": 21, "orgType.courseSection": 22, "orgType.codigoEnsenanza": 45, "orgType.grado": 46,
  "orgType.modalidad": 38, "orgType.jornada": 39, "orgType.nivel": 40, "orgType.rama": 41, "orgType.sector": 42, "orgType.especialidad": 43, "orgType.tipoCurso": 44,
  "enrollmentStatus.current": 2, "orgIdentifierType.school": 17,
  "country.chile": 45, "emailType.home": 1, "emailType.organizational": 3, "personPhone.mobile": 3, "institutionPhone.main": 2, "orgLocationType.physical": 2,
  "degreeType.profesional": 3, "degreeType.magister": 10, "accreditation.national": 3, "accreditation.none": 6, "verification.copia_titulo": 3, "verification.certificado_oficial": 1,
  "orgIdSystem.rbd": 48, "orgRelationship.internal": 3,
  "idSystem.run": 51, "idSystem.ipe": 52, "idSystem.listNumber": 54, "idSystem.schoolNumber": 55,
  "sex.male": 1, "sex.female": 2,
  "attEvent.daily": 1, "attEvent.classSection": 2, "attEvent.establecimiento": 5,
  "attStatus.present": 1, "attStatus.excusedAbsence": 2, "attStatus.unexcusedAbsence": 3, "attStatus.tardy": 4, "attStatus.earlyDeparture": 5,
  "personStatus.matriculaDefinitiva": 27, "personStatus.retirado": 30, "personStatus.asignadoCurso": 32, "personStatus.pie": 36,
  "personLocation.physical": 13, "relationship.apoderado": 31,
  "relationship.autorizadoRetiro": 23, // interpretación: Other
  "roleStatus.enrolled": 26,
  "calendarEvent.suspension": 1, // interpretación: EmergencyDay; fn6F0 solo descuenta días de ese tipo
  "assessmentType.formativa": 28, "assessmentType.sumativa": 29, "scoreMetric.nota": 1, "assessmentStaffRole.estudiante": 6,
  "incidentBehavior.entrevista": 31, "incidentBehavior.reunion": 32, "incidentBehavior.entregaRetiro": 33, "incidentBehavior.positiva": 34,
  "incidentBehavior.interesGeneral": 35, "incidentBehavior.entregaContinuidad": 36,
  "incidentBehavior.negativa": 29, // interpretación: Violation of School Rules
  "incidentPersonType.apoderado": 43, "incidentPersonType.docente": 44, "incidentPersonType.estudiante": 45,
  "incidentPersonType.profesional": 47, "incidentPersonType.otro": 48, "incidentPersonType.administrativo": 49,
  "incidentPersonRole.registra": 4, "incidentPersonRole.entrevistado": 5, "incidentPersonRole.entrevistador": 6, "incidentPersonRole.dirigeReunion": 7, "incidentPersonRole.asisteReunion": 8,
  "incidentPersonRole.estudiante": 2, // interpretación: Perpetrator; el catálogo no tiene un rol neutro para el estudiante anotado
  "incidentPersonRole.entrega": 4, // interpretación: Reporter
  "incidentPersonRole.recibe": 8, // interpretación: Participante
  "incidentReporterType.docente": 7,
  "incidentTime.horaClases": 9, // Other time during school hours: sirve para anotaciones, entrevistas y entregas
  "language.spanish": 400,
  "academicSubject.matematica": 9, "academicSubject.lenguaje": 11, "academicSubject.idioma": 5, "academicSubject.historia": 15, "academicSubject.ciencias": 12, "academicSubject.artes": 1, "academicSubject.otra": 18,
  // Interpretación: el catálogo es el de CEDS; se eligió la acción más cercana a cada medida del reglamento.
  "disciplinaryAction.dialogo_formativo": 7, "disciplinaryAction.amonestacion_verbal": 29, "disciplinaryAction.amonestacion_escrita": 29, "disciplinaryAction.citacion_apoderado": 8,
  "disciplinaryAction.medida_reparatoria": 30, "disciplinaryAction.servicio_comunitario": 6, "disciplinaryAction.suspension": 41, "disciplinaryAction.condicionalidad": 32,
  "disciplinaryAction.cancelacion_matricula": 25, "disciplinaryAction.expulsion": 17,
};

/** Diccionario provisional: solo los números vistos o deducidos en las reglas. No reemplaza al oficial. */
export function provisionalRefs(): EdeRefs {
  const out: EdeRefs = {};
  for (const [k, v] of Object.entries(EDE_REF_SOURCES) as [EdeRefKey, EdeRefSource][]) {
    const n = v.observed ?? v.inferred;
    if (n != null) out[k] = n;
  }
  return out;
}
