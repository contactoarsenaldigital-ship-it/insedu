/** Tipos compartidos del dominio INSEDU. Identificadores como string (UUIDv7). */

export type Role =
  | "platform_admin"
  | "school_admin"
  | "director"
  | "teacher"
  | "head_teacher"
  | "inspector"
  | "gatekeeper"
  | "psychologist"
  | "counselor"
  | "social_worker"
  | "nurse"
  | "safeguarding_lead"
  | "guardian_academic"
  | "guardian_financial"
  | "student";

export const ROLE_LABEL: Record<Role, string> = {
  platform_admin: "Administrador de plataforma",
  school_admin: "Administrador del establecimiento",
  director: "Dirección",
  teacher: "Docente",
  head_teacher: "Profesor jefe",
  inspector: "Inspectoría",
  gatekeeper: "Portería",
  psychologist: "Psicología",
  counselor: "Orientación",
  social_worker: "Trabajo social",
  nurse: "Enfermería",
  safeguarding_lead: "Encargado de Salvaguarda",
  guardian_academic: "Apoderado académico",
  guardian_financial: "Apoderado financiero",
  student: "Estudiante",
};

export type Student = {
  id: string;
  tenantId: string;
  rut: string; // normalizado, sin puntos ni guion
  firstName: string;
  lastName: string;
  courseId: string;
  photoUrl?: string;
};

export type Course = {
  id: string;
  tenantId: string;
  name: string; // "7° Básico A"
  level: string;
  headTeacherId: string;
  /** Hora de inicio de jornada local, "08:00" */
  startTime: string;
};

export type AttendanceStatus = "present" | "late" | "absent" | "justified";

export type AttendanceRecord = {
  id: string;
  tenantId: string;
  studentId: string;
  date: string; // YYYY-MM-DD local
  status: AttendanceStatus;
  arrivedAt?: string; // ISO
  source: "credential_scan" | "teacher" | "import";
  recordedBy: string;
};

export type GradeRecord = {
  id: string;
  studentId: string;
  subject: string;
  date: string;
  /** Escala chilena 1,0 a 7,0 */
  value: number;
};

export type ConductKind = "positive" | "negative" | "commendation";

export type ConductRecord = {
  id: string;
  studentId: string;
  date: string;
  kind: ConductKind;
  /** Gravedad para anotaciones negativas: leve | grave | gravisima */
  severity?: "leve" | "grave" | "gravisima";
  description: string;
  recordedBy: string;
};

export type HealthVisit = {
  id: string;
  studentId: string;
  date: string;
  reason: string;
  sentHome: boolean;
  action?: string;
  nurseId?: string;
  at?: string; // ISO, cuando se registra desde la app
};
