/**
 * Matriz de permisos del libro de clases y la convivencia (RBAC + vínculo).
 * El servidor la evalúa en cada operación; la interfaz solo la usa para ocultar acciones.
 * En la Etapa 2 la misma regla se refuerza con las políticas RLS de la base de datos.
 */
import type { Role } from "./types";

export type Action =
  | "lesson.write" // registrar leccionario y asistencia de su clase
  | "lesson.sign"
  | "grade.write" // ingresar notas en sus asignaturas
  | "record.correct" // corregir registro oficial con motivo
  | "conduct.write" // registrar anotaciones
  | "course.read" // ver el libro del curso
  | "corrections.read"; // ver historial de correcciones

export type Scope = {
  /** Asignaturas que dicta la persona. */
  subjectIds: string[];
  /** Cursos donde es profesor jefe. */
  headOfCourseIds: string[];
};

export type Target = { subjectId?: string; courseId?: string };

const STAFF_READ: Role[] = ["director", "school_admin", "inspector", "psychologist", "counselor", "social_worker"];

export function can(roles: Role[], action: Action, scope: Scope, target: Target): boolean {
  const teachesSubject = target.subjectId != null && scope.subjectIds.includes(target.subjectId);
  const headsCourse = target.courseId != null && scope.headOfCourseIds.includes(target.courseId);
  const has = (r: Role) => roles.includes(r);

  switch (action) {
    case "lesson.write":
    case "lesson.sign":
    case "grade.write":
      return (has("teacher") || has("head_teacher")) && teachesSubject;
    case "record.correct":
      // El docente corrige lo propio; el profesor jefe e inspectoría, lo de su curso; administración, todo.
      return (
        ((has("teacher") || has("head_teacher")) && teachesSubject) ||
        (has("head_teacher") && headsCourse) ||
        has("school_admin")
      );
    case "conduct.write":
      return ((has("teacher") || has("head_teacher")) && (teachesSubject || headsCourse)) || has("inspector");
    case "course.read":
      return teachesSubject || headsCourse || roles.some((r) => STAFF_READ.includes(r));
    case "corrections.read":
      return headsCourse || has("director") || has("school_admin") || has("inspector");
  }
}
