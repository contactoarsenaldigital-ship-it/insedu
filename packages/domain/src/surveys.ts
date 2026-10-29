/**
 * Encuestas a la comunidad y encuesta sociométrica de curso.
 *
 * La encuesta sociométrica (test de Moreno adaptado) la aplica psicología u orientación con
 * autorización de las familias. Por cuidado de los estudiantes:
 * - las preguntas se formulan en positivo; la única negativa es opcional y se pregunta por
 *   «con quién te cuesta trabajar», nunca por excluir a alguien del curso;
 * - los resultados son confidenciales y no se comparten con estudiantes ni se usan para sancionar.
 */

export type QuestionType = "escala" | "opcion" | "texto" | "companeros";

/** Para preguntas «companeros»: si la elección suma vínculo, lo resta o marca amistad cercana. */
export type Valence = "positiva" | "negativa" | "amistad";

export type Question = {
  id: string;
  text: string;
  type: QuestionType;
  required: boolean;
  /** Opción única. */
  options?: string[];
  /** Compañeros: máximo de elecciones. */
  max?: number;
  valence?: Valence;
  help?: string;
};

export const SCALE_LABELS = ["Muy en desacuerdo", "En desacuerdo", "Ni de acuerdo ni en desacuerdo", "De acuerdo", "Muy de acuerdo"];

export const SOCIOMETRIC_QUESTIONS: Question[] = [
  { id: "trabajo", text: "¿Con qué compañeros o compañeras te gusta más trabajar en clases?", type: "companeros", max: 3, required: true, valence: "positiva", help: "Elige hasta 3." },
  { id: "recreo", text: "¿Con quiénes te gusta compartir en los recreos?", type: "companeros", max: 3, required: true, valence: "positiva", help: "Elige hasta 3." },
  { id: "amistad", text: "¿Quién consideras tu mejor amigo o amiga del curso?", type: "companeros", max: 1, required: false, valence: "amistad", help: "Puedes dejarla en blanco." },
  { id: "ayuda", text: "Si tuvieras un problema, ¿a quién del curso le pedirías ayuda?", type: "companeros", max: 2, required: false, valence: "positiva", help: "Elige hasta 2 o déjala en blanco." },
  { id: "cuesta", text: "¿Con quiénes te cuesta más trabajar en equipo?", type: "companeros", max: 2, required: false, valence: "negativa", help: "Opcional. Nadie del curso sabrá tu respuesta; sirve para armar mejores grupos de trabajo." },
];

export type Answer = string | string[] | number;
export type Answers = Record<string, Answer>;

/** Problemas de una respuesta; lista vacía = válida. `classmates`: ids que se pueden elegir. */
export function answerIssues(questions: Question[], answers: Answers, classmates: string[] = []): string[] {
  const issues: string[] = [];
  for (const q of questions) {
    const a = answers[q.id];
    const empty = a === undefined || a === "" || (Array.isArray(a) && a.length === 0);
    if (empty) {
      if (q.required) issues.push(`Responda: «${q.text}»`);
      continue;
    }
    if (q.type === "escala" && !(typeof a === "number" && Number.isInteger(a) && a >= 1 && a <= 5)) issues.push(`Elija un valor de 1 a 5 en «${q.text}»`);
    if (q.type === "opcion" && !(typeof a === "string" && q.options?.includes(a))) issues.push(`Elija una opción en «${q.text}»`);
    if (q.type === "texto" && !(typeof a === "string" && a.length <= 1000)) issues.push(`La respuesta a «${q.text}» es demasiado larga`);
    if (q.type === "companeros") {
      const list = Array.isArray(a) ? a : [];
      if (list.length > (q.max ?? 3)) issues.push(`Elija como máximo ${q.max ?? 3} en «${q.text}»`);
      if (list.some((id) => !classmates.includes(id))) issues.push(`Elección no válida en «${q.text}»`);
      if (new Set(list).size !== list.length) issues.push(`Hay elecciones repetidas en «${q.text}»`);
    }
  }
  return issues;
}

// ───────────────────────── Sociograma ─────────────────────────

export type SociometricStatus = "popular" | "integrado" | "sin_reciprocidad" | "aislado" | "rechazado" | "controvertido" | "sin_datos";

export const STATUS_LABEL: Record<SociometricStatus, string> = {
  popular: "Muy elegido",
  integrado: "Integrado",
  sin_reciprocidad: "Elegido, sin vínculos recíprocos",
  aislado: "Sin elecciones recibidas",
  rechazado: "Señalado con dificultades de trabajo",
  controvertido: "Muy elegido y también señalado",
  sin_datos: "Sin datos",
};

/** Estados que conviene revisar con la profesora jefe y la familia. */
export const ATTENTION: SociometricStatus[] = ["aislado", "rechazado", "controvertido", "sin_reciprocidad"];

export type StudentIndex = {
  id: string;
  answered: boolean;
  /** Elecciones positivas recibidas (sin contar repetidas de la misma persona). */
  positive: number;
  negative: number;
  /** Personas con quienes la elección positiva es mutua. */
  mutual: number;
  bestFriendOf: number;
  bestFriendMutual: boolean;
  status: SociometricStatus;
};

export type Edge = { from: string; to: string; weight: number; mutual: boolean };

export type SociogramResult = {
  students: StudentIndex[];
  positiveEdges: Edge[];
  negativeEdges: Edge[];
  respondents: number;
  /** Pares recíprocos / pares posibles entre quienes respondieron (0..1). */
  cohesion: number;
  thresholds: { popular: number; rejected: number };
};

export function analyzeSociogram(
  studentIds: string[],
  responses: { respondentId: string; answers: Answers }[],
  questions: Question[] = SOCIOMETRIC_QUESTIONS,
): SociogramResult {
  const ids = new Set(studentIds);
  const valence = new Map(questions.filter((q) => q.type === "companeros").map((q) => [q.id, q.valence ?? "positiva"]));
  const pos = new Map<string, Map<string, number>>(); // from → to → peso
  const neg = new Map<string, Map<string, number>>();
  const best = new Map<string, string>();
  const answered = new Set<string>();

  for (const r of responses) {
    if (!ids.has(r.respondentId)) continue;
    answered.add(r.respondentId);
    for (const [qid, v] of valence) {
      const chosen = r.answers[qid];
      if (!Array.isArray(chosen)) continue;
      for (const to of chosen) {
        if (!ids.has(to) || to === r.respondentId) continue;
        if (v === "negativa") bump(neg, r.respondentId, to);
        else bump(pos, r.respondentId, to);
        if (v === "amistad") best.set(r.respondentId, to);
      }
    }
  }

  const receivedFrom = (m: Map<string, Map<string, number>>, id: string) => [...m].filter(([, tos]) => tos.has(id)).map(([from]) => from);
  const chose = (m: Map<string, Map<string, number>>, a: string, b: string) => m.get(a)?.has(b) ?? false;

  const base = studentIds.map((id) => {
    const positiveFrom = receivedFrom(pos, id);
    return {
      id,
      answered: answered.has(id),
      positive: positiveFrom.length,
      negative: receivedFrom(neg, id).length,
      mutual: positiveFrom.filter((from) => chose(pos, id, from)).length,
      bestFriendOf: [...best.values()].filter((to) => to === id).length,
      bestFriendMutual: best.has(id) && best.get(best.get(id)!) === id,
    };
  });

  const n = answered.size;
  const values = base.map((b) => b.positive);
  const mean = values.reduce((s, x) => s + x, 0) / Math.max(1, values.length);
  const sd = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, values.length));
  const popular = Math.max(4, Math.ceil(mean + sd));
  const rejected = Math.max(2, Math.ceil(n * 0.15));

  const students: StudentIndex[] = base.map((b) => {
    let status: SociometricStatus;
    if (n === 0) status = "sin_datos";
    else if (b.negative >= rejected && b.positive >= popular) status = "controvertido";
    else if (b.negative >= rejected) status = "rechazado";
    else if (b.positive === 0) status = "aislado";
    else if (b.positive >= popular) status = "popular";
    else if (b.mutual === 0 && b.answered) status = "sin_reciprocidad"; // sin responder no puede haber mutuas
    else status = "integrado";
    return { ...b, status };
  });

  const edges = (m: Map<string, Map<string, number>>): Edge[] =>
    [...m].flatMap(([from, tos]) => [...tos].map(([to, weight]) => ({ from, to, weight, mutual: chose(m, to, from) })));

  const mutualPairs = edges(pos).filter((e) => e.mutual).length / 2;
  const possible = (n * (n - 1)) / 2;

  return {
    students,
    positiveEdges: edges(pos),
    negativeEdges: edges(neg),
    respondents: n,
    cohesion: possible ? mutualPairs / possible : 0,
    thresholds: { popular, rejected },
  };
}

function bump(m: Map<string, Map<string, number>>, from: string, to: string) {
  const tos = m.get(from) ?? new Map<string, number>();
  tos.set(to, (tos.get(to) ?? 0) + 1);
  m.set(from, tos);
}

/**
 * Orden circular que deja juntos a quienes se eligen: recorre los vínculos positivos
 * empezando por los más elegidos. Los nodos sin vínculos quedan al final.
 */
export function circleOrder(ids: string[], edges: Edge[]): string[] {
  const adj = new Map(ids.map((id) => [id, new Map<string, number>()]));
  for (const e of edges) {
    const w = e.weight + (e.mutual ? 2 : 0);
    adj.get(e.from)?.set(e.to, (adj.get(e.from)?.get(e.to) ?? 0) + w);
    adj.get(e.to)?.set(e.from, (adj.get(e.to)?.get(e.from) ?? 0) + w);
  }
  const degree = (id: string) => [...(adj.get(id)?.values() ?? [])].reduce((s, x) => s + x, 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const start of [...ids].sort((a, b) => degree(b) - degree(a))) {
    if (seen.has(start) || degree(start) === 0) continue;
    const stack = [start];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      const next = [...(adj.get(id) ?? [])].filter(([n]) => !seen.has(n)).sort((a, b) => a[1] - b[1]).map(([n]) => n);
      stack.push(...next);
    }
  }
  return [...out, ...ids.filter((id) => !seen.has(id))];
}

// ───────────────────────── Encuestas generales ─────────────────────────

export type QuestionSummary =
  | { type: "escala"; count: number; average: number | null; distribution: number[] }
  | { type: "opcion"; count: number; counts: { option: string; n: number }[] }
  | { type: "texto"; count: number; texts: string[] }
  | { type: "companeros"; count: number };

export function summarize(q: Question, answers: Answers[]): QuestionSummary {
  const given = answers.map((a) => a[q.id]).filter((a) => a !== undefined && a !== "" && !(Array.isArray(a) && a.length === 0));
  if (q.type === "escala") {
    const nums = given.filter((a): a is number => typeof a === "number");
    const distribution = [1, 2, 3, 4, 5].map((v) => nums.filter((x) => x === v).length);
    return { type: "escala", count: nums.length, average: nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : null, distribution };
  }
  if (q.type === "opcion") {
    return { type: "opcion", count: given.length, counts: (q.options ?? []).map((option) => ({ option, n: given.filter((a) => a === option).length })) };
  }
  if (q.type === "texto") return { type: "texto", count: given.length, texts: given.map(String) };
  return { type: "companeros", count: given.length };
}
