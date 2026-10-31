import "server-only";
import { mulberry32, SOCIOMETRIC_QUESTIONS, uuidv7, type Answers, type Question, type Role } from "@insedu/domain";
import { school } from "./demo";
import type { Person } from "./repository";
import { STAFF } from "./store";

/**
 * Encuestas: generales (a estudiantes, apoderados o funcionarios) y sociométricas de curso.
 * Las sociométricas solo las crean y ven psicología, orientación y Salvaguarda.
 */

export type Audience = "estudiantes" | "apoderados" | "funcionarios";

export type Survey = {
  id: string;
  kind: "general" | "sociometrica";
  title: string;
  intro: string;
  audience: Audience;
  /** null = todo el establecimiento (no aplica a sociométricas). */
  courseId: string | null;
  questions: Question[];
  /** Las respuestas no se muestran con nombre (las sociométricas nunca son anónimas). */
  anonymous: boolean;
  status: "abierta" | "cerrada";
  createdBy: string;
  createdAt: string;
  closesOn?: string; // AAAA-MM-DD
  /** Sociométrica: constancia de que las familias fueron informadas y autorizaron. */
  consent?: { by: string; at: string; text: string };
};

export type SurveyResponse = { id: string; surveyId: string; respondentId: string; at: string; answers: Answers };

type State = { surveys: Survey[]; responses: SurveyResponse[] };

const g = globalThis as unknown as { __insedu_surveys?: State };
export const surveyState = (): State => (g.__insedu_surveys ??= initSurveys());

export const CONSENT_TEXT =
  "Las familias del curso fueron informadas del objetivo de la encuesta y la autorizaron según el reglamento interno. Los estudiantes pueden no responder.";

// ───────────────────────── Permisos ─────────────────────────

const SOCIO_ROLES: Role[] = ["psychologist", "counselor", "safeguarding_lead"];
const GENERAL_ROLES: Role[] = [...SOCIO_ROLES, "director", "school_admin", "head_teacher"];
const STAFF_ROLES: Role[] = ["teacher", "head_teacher", "inspector", "gatekeeper", "psychologist", "counselor", "social_worker", "nurse", "safeguarding_lead", "director", "school_admin"];

const has = (p: Person, roles: Role[]) => p.roles.some((r) => roles.includes(r));

export const canCreate = (p: Person, kind: Survey["kind"]) => has(p, kind === "sociometrica" ? SOCIO_ROLES : GENERAL_ROLES);

/** Resultados: quien la creó; sociométricas, el equipo de convivencia; generales, también dirección. */
export function canSeeResults(p: Person, s: Survey) {
  if (s.createdBy === p.id) return true;
  return s.kind === "sociometrica" ? has(p, SOCIO_ROLES) : has(p, ["director", "school_admin"]);
}

export function canAnswer(p: Person, s: Survey) {
  if (s.status !== "abierta") return false;
  const inCourse = (studentId: string) => s.courseId === null || school().students.find((x) => x.id === studentId)?.courseId === s.courseId;
  if (s.audience === "estudiantes") return p.roles.includes("student") && inCourse(p.id);
  if (s.audience === "apoderados") return p.roles.includes("guardian_academic") && (p.wards ?? []).some(inCourse);
  return has(p, STAFF_ROLES);
}

export const surveyById = (id: string) => surveyState().surveys.find((s) => s.id === id);

/** Una respuesta por persona y encuesta: la clave fija hace que reenviar sobrescriba en vez de duplicar. */
const responseId = (surveyId: string, respondentId: string) => `${surveyId}:${respondentId}`;

/**
 * Respuestas válidas: la más reciente de cada persona y, en encuestas a estudiantes, solo de
 * estudiantes del curso. Corrige datos antiguos con respuestas duplicadas.
 */
export function responsesOf(surveyId: string): SurveyResponse[] {
  const s = surveyById(surveyId);
  const eligible = s?.audience === "estudiantes" ? new Set(eligibleIds(s)) : null;
  const latest = new Map<string, SurveyResponse>();
  for (const r of surveyState().responses) {
    if (r.surveyId !== surveyId || (eligible && !eligible.has(r.respondentId))) continue;
    const prev = latest.get(r.respondentId);
    if (!prev || r.at >= prev.at) latest.set(r.respondentId, r);
  }
  return [...latest.values()];
}

export const responseOf = (surveyId: string, personId: string) => responsesOf(surveyId).find((r) => r.respondentId === personId);

/** Deja guardadas solo las respuestas válidas de una encuesta (borra duplicados en la base). */
export function compactResponses(surveyId: string): number {
  const st = surveyState();
  const keep = new Set(responsesOf(surveyId).map((r) => r.id));
  const before = st.responses.length;
  st.responses = st.responses.filter((r) => r.surveyId !== surveyId || keep.has(r.id));
  return before - st.responses.length;
}

/** Cuántas personas pueden responder (para la tasa de participación). */
export function eligibleCount(s: Survey): number {
  return eligibleIds(s).length; // un apoderado por estudiante en el colegio ficticio
}

export function classmatesOf(studentId: string) {
  const courseId = school().students.find((x) => x.id === studentId)?.courseId;
  return school().students.filter((x) => x.courseId === courseId && x.id !== studentId).sort((a, b) => a.lastName.localeCompare(b.lastName, "es"));
}

export function createSurvey(s: Omit<Survey, "id" | "createdAt" | "status">): Survey {
  const survey: Survey = { ...s, id: uuidv7(), createdAt: new Date().toISOString(), status: "abierta" };
  surveyState().surveys.push(survey);
  return survey;
}

export function saveResponse(surveyId: string, respondentId: string, answers: Answers) {
  const st = surveyState();
  st.responses = st.responses.filter((r) => !(r.surveyId === surveyId && r.respondentId === respondentId));
  st.responses.push({ id: responseId(surveyId, respondentId), surveyId, respondentId, at: new Date().toISOString(), answers });
}

// ───────────────────────── Datos de demostración ─────────────────────────

const CLIMATE: Question[] = [
  { id: "seguro", text: "Me siento seguro o segura en el colegio", type: "escala", required: true },
  { id: "respeto", text: "En mi curso nos tratamos con respeto", type: "escala", required: true },
  { id: "adulto", text: "Si tengo un problema, hay un adulto del colegio a quien puedo acudir", type: "escala", required: true },
  { id: "lugar", text: "¿Dónde ocurren más conflictos?", type: "opcion", required: false, options: ["Sala de clases", "Patio y recreos", "Baños", "Redes sociales", "Trayecto al colegio"] },
  { id: "idea", text: "¿Qué cambiarías para mejorar la convivencia?", type: "texto", required: false },
];

const IDEAS = [
  "Más actividades en los recreos",
  "Que los profesores intervengan antes cuando hay burlas",
  "Talleres sobre uso de redes sociales",
  "Más espacios con sombra en el patio",
  "Que haya un buzón para contar problemas",
];

const COMMENTS = [
  "Me parece bien como está",
  "Más actividades en grupo",
  "Que se avise con más anticipación",
  "Más tiempo para conversar en el curso",
  "Me gustaría participar más",
];

/**
 * Generador de respuestas sociométricas coherentes: el curso se divide en grupos de amistad,
 * la mayoría elige dentro de su grupo, dos estudiantes no reciben elecciones y uno es
 * señalado por varios en «te cuesta trabajar».
 */
function sociometricGenerator(course: string[], rnd: () => number) {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const n = course.length;
  const isolated = n >= 8 ? [course[Math.floor(n * 0.4)]!, course[Math.floor(n * 0.85)]!] : [];
  const flagged = course[Math.floor(n * 0.25)];
  const size = Math.ceil(n / 4);
  const groups = [0, 1, 2, 3].map((k) => course.slice(k * size, (k + 1) * size));
  const choosable = (id: string) => course.filter((x) => x !== id && !isolated.includes(x));
  const choose = (id: string, k: number) => {
    const own = (groups.find((g) => g.includes(id)) ?? []).filter((x) => x !== id && !isolated.includes(x));
    const all = choosable(id);
    const out = new Set<string>();
    while (out.size < Math.min(k, all.length)) out.add(rnd() < 0.8 && own.length ? pick(own) : pick(all));
    return [...out];
  };
  return (id: string, questions: Question[]): Answers => {
    const answers: Answers = {};
    for (const q of questions) {
      if (q.type !== "companeros") continue;
      if (q.valence === "negativa") {
        if (flagged && id !== flagged && rnd() < 0.45) answers[q.id] = rnd() < 0.85 ? [flagged] : choose(id, 1);
      } else if (q.valence === "amistad") {
        if (rnd() < 0.85) answers[q.id] = choose(id, 1);
      } else if (q.required || rnd() < 0.6) {
        answers[q.id] = choose(id, q.max ?? 3);
      }
    }
    return answers;
  };
}

/** Respuestas generales verosímiles: cada persona tiene una tendencia y varía un poco por pregunta. */
function generalAnswers(questions: Question[], rnd: () => number, texts = COMMENTS): Answers {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const base = 2 + Math.floor(rnd() * 4);
  const answers: Answers = {};
  for (const q of questions) {
    if (q.type === "escala") answers[q.id] = Math.max(1, Math.min(5, base + Math.round(rnd() * 2 - 1)));
    else if (q.type === "opcion" && q.options?.length && (q.required || rnd() < 0.9)) answers[q.id] = pick(q.options);
    else if (q.type === "texto" && (q.required || rnd() < 0.3)) answers[q.id] = pick(texts);
  }
  return answers;
}

/** Quiénes pueden responder la encuesta en el colegio ficticio. */
export function eligibleIds(s: Survey): string[] {
  const students = school().students.filter((x) => s.courseId === null || x.courseId === s.courseId).map((x) => x.id);
  if (s.audience === "estudiantes") return students;
  if (s.audience === "apoderados") return students.map((id) => `guardian-of-${id}`);
  return STAFF.map((p) => p.id);
}

/**
 * Solo maqueta: completa con respuestas ficticias a todas las personas que aún no responden,
 * para que los gráficos y el sociograma se vean completos. Devuelve cuántas agregó.
 */
export function fillDemoResponses(s: Survey): number {
  compactResponses(s.id); // primero quita duplicados antiguos
  const st = surveyState();
  const answered = new Set(responsesOf(s.id).map((r) => r.respondentId));
  const missing = eligibleIds(s).filter((id) => !answered.has(id));
  const rnd = mulberry32([...s.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7));
  const socio = s.kind === "sociometrica" ? sociometricGenerator(eligibleIds(s), rnd) : undefined;
  const now = Date.now();
  missing.forEach((id, i) => {
    const answers = socio ? socio(id, s.questions) : generalAnswers(s.questions, rnd);
    st.responses.push({ id: responseId(s.id, id), surveyId: s.id, respondentId: id, at: new Date(now - (missing.length - i) * 60_000).toISOString(), answers });
  });
  return missing.length;
}

/** Colegio ficticio: una sociométrica de 5° Básico A y una encuesta de convivencia. */
export function initSurveys(): State {
  const s = school();
  const rnd = mulberry32(7);
  const now = Date.now();
  const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const course1 = s.students.filter((x) => x.courseId === "course-1").map((x) => x.id);

  const socio: Survey = {
    id: "encuesta-socio-demo",
    kind: "sociometrica",
    title: "Convivencia en 5° Básico A",
    intro: "Queremos conocer cómo te llevas con tu curso para armar mejores grupos de trabajo y acompañarte. Tus respuestas son confidenciales: solo las ve la psicóloga del colegio.",
    audience: "estudiantes",
    courseId: "course-1",
    questions: SOCIOMETRIC_QUESTIONS,
    anonymous: false,
    status: "abierta",
    createdBy: "psych-1",
    createdAt: at(96),
    consent: { by: "psych-1", at: at(96), text: CONSENT_TEXT },
  };

  const socioAnswers = sociometricGenerator(course1, rnd);
  const responses: SurveyResponse[] = [];
  for (const id of course1) {
    if (id === "student-001" || id === course1[19] || id === course1[28]) continue; // aún sin responder
    responses.push({ id: responseId(socio.id, id), surveyId: socio.id, respondentId: id, at: at(90 - responses.length), answers: socioAnswers(id, socio.questions) });
  }

  const climate: Survey = {
    id: "encuesta-clima-demo",
    kind: "general",
    title: "Clima de convivencia escolar",
    intro: "Encuesta breve para todos los estudiantes. Es anónima: los resultados se ven sin nombres.",
    audience: "estudiantes",
    courseId: null,
    questions: CLIMATE,
    anonymous: true,
    status: "abierta",
    createdBy: "sg-1",
    createdAt: at(120),
  };
  for (const st of s.students) {
    if (st.id === "student-001" || rnd() > 0.62) continue;
    responses.push({ id: responseId(climate.id, st.id), surveyId: climate.id, respondentId: st.id, at: at(100 - (responses.length % 90)), answers: generalAnswers(CLIMATE, rnd, IDEAS) });
  }

  return { surveys: [socio, climate], responses };
}
