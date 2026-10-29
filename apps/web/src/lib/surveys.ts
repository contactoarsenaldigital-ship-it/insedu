import "server-only";
import { mulberry32, SOCIOMETRIC_QUESTIONS, uuidv7, type Answers, type Question, type Role } from "@insedu/domain";
import { school } from "./demo";
import type { Person } from "./repository";

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

export const responseOf = (surveyId: string, personId: string) => surveyState().responses.find((r) => r.surveyId === surveyId && r.respondentId === personId);
export const responsesOf = (surveyId: string) => surveyState().responses.filter((r) => r.surveyId === surveyId);
export const surveyById = (id: string) => surveyState().surveys.find((s) => s.id === id);

/** Cuántas personas pueden responder (para la tasa de participación). */
export function eligibleCount(s: Survey): number {
  const students = school().students.filter((x) => s.courseId === null || x.courseId === s.courseId).length;
  return s.audience === "funcionarios" ? 0 : students; // un apoderado por estudiante en el colegio ficticio
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
  st.responses.push({ id: uuidv7(), surveyId, respondentId, at: new Date().toISOString(), answers });
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

/** Colegio ficticio: una sociométrica de 5° Básico A y una encuesta de convivencia. */
export function initSurveys(): State {
  const s = school();
  const rnd = mulberry32(7);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
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

  // Grupos de amistad: la mayoría elige dentro de su grupo. Dos estudiantes no reciben
  // elecciones (nadie los elige) y uno es señalado por varios en «te cuesta trabajar».
  const isolated = [course1[12]!, course1[25]!];
  const flagged = course1[7]!;
  const groups = [course1.slice(0, 7), course1.slice(7, 14), course1.slice(14, 22), course1.slice(22)];
  const groupOf = (id: string) => groups.find((gr) => gr.includes(id))!;
  const choosable = (id: string) => course1.filter((x) => x !== id && !isolated.includes(x));
  const choose = (id: string, n: number) => {
    const own = groupOf(id).filter((x) => x !== id && !isolated.includes(x));
    const out = new Set<string>();
    while (out.size < n) out.add(rnd() < 0.8 && own.length ? pick(own) : pick(choosable(id)));
    return [...out];
  };
  const responses: SurveyResponse[] = [];
  for (const id of course1) {
    if (id === "student-001" || id === course1[19] || id === course1[28]) continue; // aún sin responder
    const trabajo = choose(id, 3);
    const answers: Answers = { trabajo, recreo: choose(id, 3), amistad: rnd() < 0.85 ? [trabajo[0]!] : [], ayuda: rnd() < 0.6 ? choose(id, 1) : [] };
    if (id !== flagged && rnd() < 0.45) answers.cuesta = [rnd() < 0.85 ? flagged : pick(choosable(id))].filter((x) => x !== id);
    responses.push({ id: uuidv7(), surveyId: socio.id, respondentId: id, at: at(90 - responses.length), answers });
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
    const base = 2 + Math.floor(rnd() * 4);
    const scale = () => Math.max(1, Math.min(5, base + Math.round(rnd() * 2 - 1)));
    const answers: Answers = { seguro: scale(), respeto: scale(), adulto: scale(), lugar: pick(CLIMATE[3]!.options!) };
    if (rnd() < 0.3) answers.idea = pick(IDEAS);
    responses.push({ id: uuidv7(), surveyId: climate.id, respondentId: st.id, at: at(100 - (responses.length % 90)), answers });
  }

  return { surveys: [socio, climate], responses };
}
