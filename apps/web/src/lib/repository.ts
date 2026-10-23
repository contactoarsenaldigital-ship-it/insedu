/**
 * Puerto de datos del libro de clases. Las pantallas y acciones solo conocen esta interfaz.
 * Etapa 1: implementación en memoria (store.ts) sobre el colegio sintético.
 * Siguiente paso: implementación Supabase con el mismo contrato (tablas app.lessons,
 * app.lesson_attendance, app.evaluations, app.grades, app.conduct_records, app.corrections).
 */
import type {
  ConductRecord,
  Correction,
  Course,
  Evaluation,
  GradeEntry,
  Lesson,
  LessonStatus,
  Role,
  Student,
} from "@insedu/domain";

export type Subject = { id: string; courseId: string; name: string; teacherId: string };

export type Person = {
  id: string;
  name: string;
  roles: Role[];
  description: string;
  /** Apoderados: estudiantes a cargo */
  wards?: string[];
};

export interface LibroRepository {
  // Lectura
  courses(): Course[];
  course(id: string): Course | undefined;
  subjects(): Subject[];
  subject(id: string): Subject | undefined;
  studentsOf(courseId: string): Student[];
  person(id: string): Person | undefined;
  evaluationsOf(subjectId: string): Evaluation[];
  gradesOf(subjectId: string): GradeEntry[];
  lessonsOf(subjectId: string): Lesson[];
  lesson(id: string): Lesson | undefined;
  conductOf(courseId: string): ConductRecord[];
  correctionsOf(courseId: string): Correction[];

  // Escritura (las acciones validan permisos antes de llamar)
  addEvaluation(e: Omit<Evaluation, "id">): Evaluation;
  setGrade(g: GradeEntry, by: string): void;
  addLesson(l: Omit<Lesson, "id">): Lesson;
  updateLesson(id: string, patch: Partial<Pick<Lesson, "objective" | "content" | "attendance" | "signedAt">>): void;
  addConduct(c: Omit<ConductRecord, "id">): ConductRecord;
  addCorrection(c: Omit<Correction, "id" | "at"> & { courseId: string }): Correction;
}

export type { LessonStatus };
