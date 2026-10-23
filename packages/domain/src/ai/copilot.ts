/**
 * Copiloto Docente: plantillas institucionales versionadas. Todo resultado es un BORRADOR
 * que el docente revisa, edita y aprueba antes de publicarlo (Plan Maestro 4.10.B).
 */
import type { AiTask } from "./gateway";

export const PROMPT_VERSION = "2026-10-15.1";

export type CopilotInput = {
  kind: "guia" | "prueba" | "rubrica" | "planificacion";
  subject: string;
  level: string; // "7° Básico"
  objective: string; // OA de Bases Curriculares o descripción
  items?: number;
  difficulty?: "baja" | "media" | "alta";
};

const SYSTEM = [
  "Eres un asistente pedagógico para docentes de establecimientos chilenos.",
  "Alineas el contenido con las Bases Curriculares del Mineduc para el nivel indicado.",
  "Escribes en español neutro, claro y adecuado a la edad de los estudiantes.",
  "Aplicas práctica de recuperación, ejemplos concretos y retroalimentación explicativa.",
  "Nunca incluyes datos personales. El resultado es un borrador para revisión docente.",
].join(" ");

const TASK: Record<CopilotInput["kind"], AiTask> = {
  guia: "generate.material",
  planificacion: "generate.material",
  prueba: "generate.assessment",
  rubrica: "generate.rubric",
};

export function buildCopilotRequest(i: CopilotInput) {
  const header = `Asignatura: ${i.subject}\nNivel: ${i.level}\nObjetivo de aprendizaje: ${i.objective}\nDificultad: ${i.difficulty ?? "media"}`;
  const body: Record<CopilotInput["kind"], string> = {
    guia: "Elabora una guía de estudio con: introducción breve, explicación con ejemplos, 6 actividades graduadas y solucionario.",
    prueba: `Elabora una prueba de ${i.items ?? 10} preguntas (selección múltiple con 4 alternativas y 2 de desarrollo), con clave, explicación de cada respuesta y pauta de corrección con puntajes.`,
    rubrica: "Elabora una rúbrica analítica con 4 criterios y 4 niveles de desempeño (Logrado, Casi logrado, En desarrollo, Inicial), con descriptores observables.",
    planificacion: "Elabora una planificación de 4 clases de 90 minutos con inicio, desarrollo, cierre, recursos y evaluación formativa.",
  };
  return {
    task: TASK[i.kind],
    system: SYSTEM,
    prompt: `${header}\n\n${body[i.kind]}\n\nFormato: Markdown con títulos claros.`,
    promptVersion: PROMPT_VERSION,
  };
}
