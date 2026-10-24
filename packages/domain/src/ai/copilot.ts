/**
 * Copiloto Docente: plantillas institucionales versionadas. Todo resultado es un BORRADOR
 * que el docente revisa, edita y aprueba antes de publicarlo (Plan Maestro 4.10.B).
 */
import type { AiTask } from "./gateway";

export const PROMPT_VERSION = "2026-10-25.1";

export type CopilotInput = {
  kind: "guia" | "prueba" | "rubrica" | "planificacion";
  subject: string;
  level: string; // "7° Básico"
  objective: string; // OA de Bases Curriculares o descripción
  items?: number;
  difficulty?: "baja" | "media" | "alta";
};

export const COPILOT_KINDS: Record<CopilotInput["kind"], string> = {
  guia: "Guía de estudio",
  prueba: "Prueba con pauta",
  rubrica: "Rúbrica",
  planificacion: "Planificación",
};

// ───────────── Niveles y asignaturas (Bases Curriculares) ─────────────

export const SCHOOL_LEVELS = [
  "1° Básico", "2° Básico", "3° Básico", "4° Básico", "5° Básico", "6° Básico", "7° Básico", "8° Básico",
  "1° Medio", "2° Medio", "3° Medio", "4° Medio",
] as const;

const COMMON = ["Inglés", "Artes Visuales", "Música", "Educación Física y Salud", "Religión"];
const HISTORIA = "Historia, Geografía y Ciencias Sociales";

/** Asignaturas del plan de estudio por nivel (formación general en 3° y 4° Medio). */
export function subjectsFor(level: string): string[] {
  const i = SCHOOL_LEVELS.indexOf(level as (typeof SCHOOL_LEVELS)[number]);
  if (i < 0) return [];
  if (i <= 5) return ["Lenguaje y Comunicación", "Matemática", HISTORIA, "Ciencias Naturales", ...COMMON, "Tecnología", "Orientación"];
  if (i <= 7) return ["Lengua y Literatura", "Matemática", HISTORIA, "Ciencias Naturales", ...COMMON, "Tecnología", "Orientación"];
  if (i <= 9) return ["Lengua y Literatura", "Matemática", HISTORIA, "Ciencias Naturales", "Biología", "Física", "Química", ...COMMON, "Tecnología", "Orientación"];
  return ["Lengua y Literatura", "Matemática", "Educación Ciudadana", "Filosofía", "Ciencias para la Ciudadanía", HISTORIA, "Biología", "Física", "Química", ...COMMON];
}

// ───────────── Solicitud al modelo ─────────────

const SYSTEM = [
  "Eres un asistente pedagógico para docentes de establecimientos chilenos.",
  "Alineas el contenido con las Bases Curriculares del Mineduc para el nivel y la asignatura indicados.",
  "Escribes en español de Chile, claro y adecuado a la edad de los estudiantes.",
  "Aplicas práctica de recuperación, ejemplos concretos y retroalimentación explicativa.",
  "Nunca incluyes datos personales. El resultado es un borrador para revisión docente.",
].join(" ");

/** Reglas de formato: el resultado se muestra formateado y se exporta a PDF y Word. */
const FORMAT = [
  "Formato de salida (obligatorio):",
  "- Markdown. Comienza directamente con un título de nivel 1 (#), sin saludos ni comentarios previos.",
  "- Secciones con títulos ## y ###, listas numeradas para actividades y preguntas, **negrita** para destacar.",
  "- Rúbricas, pautas de corrección y tablas de puntaje como tablas Markdown.",
  "- Alternativas de selección múltiple como lista con A), B), C) y D), una por línea.",
  "- Fórmulas y expresiones matemáticas en LaTeX: dentro del texto con \\( ... \\) y destacadas en línea propia con \\[ ... \\].",
  "- No uses el signo $ para fórmulas; úsalo solo para montos en pesos (por ejemplo, $5.000).",
  "- No uses HTML ni bloques de código.",
].join("\n");

const TASK: Record<CopilotInput["kind"], AiTask> = {
  guia: "generate.material",
  planificacion: "generate.material",
  prueba: "generate.assessment",
  rubrica: "generate.rubric",
};

export function buildCopilotRequest(i: CopilotInput) {
  const header = `Asignatura: ${i.subject}\nNivel: ${i.level}\nObjetivo de aprendizaje: ${i.objective}\nDificultad: ${i.difficulty ?? "media"}`;
  const items = i.items ?? 10;
  const body: Record<CopilotInput["kind"], string> = {
    guia: "Elabora una guía de estudio con: introducción breve, explicación con ejemplos, 6 actividades graduadas y solucionario.",
    prueba: `Elabora una prueba de ${items} preguntas: ${Math.max(items - 2, 1)} de selección múltiple con 4 alternativas y 2 de desarrollo. Incluye clave de respuestas, explicación de cada respuesta y pauta de corrección con puntajes.`,
    rubrica: "Elabora una rúbrica analítica con 4 criterios y 4 niveles de desempeño (Logrado, Casi logrado, En desarrollo, Inicial), con descriptores observables.",
    planificacion: "Elabora una planificación de 4 clases de 90 minutos con inicio, desarrollo, cierre, recursos y evaluación formativa.",
  };
  return {
    task: TASK[i.kind],
    system: SYSTEM,
    prompt: `${header}\n\n${body[i.kind]}\n\n${FORMAT}`,
    promptVersion: PROMPT_VERSION,
  };
}

/**
 * Lleva las fórmulas del modelo a la sintaxis que interpreta la vista (remark-math sin "$" simple):
 * \( x \) → $$x$$ en línea; \[ x \] y una línea con solo $$x$$ → bloque; $x^2$ → $$x^2$$ solo si
 * parece LaTeX, para no confundir montos en pesos ("$5.000 y $3.000").
 */
export function normalizeMath(md: string): string {
  return md
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) => `\n\n$$\n${tex.trim()}\n$$\n\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) => `$$${tex.trim()}$$`)
    .replace(/^[ \t]*\$\$([^\n$]+?)\$\$[ \t]*$/gm, (_, tex: string) => `$$\n${tex.trim()}\n$$`)
    .replace(/(?<![$\\])\$(?!\$)([^$\n]+?)(?<!\\)\$(?!\$)/g, (m, tex: string) => (/[\\^_{}]/.test(tex) ? `$$${tex.trim()}$$` : m))
    .replace(/\n{3,}/g, "\n\n");
}
