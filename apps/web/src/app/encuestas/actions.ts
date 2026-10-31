"use server";
import { redirect } from "next/navigation";
import { answerIssues, SOCIOMETRIC_QUESTIONS, type Answers, type Question, type QuestionType } from "@insedu/domain";
import { getSession } from "@/lib/session";
import { withState } from "@/lib/state";
import { repo } from "@/lib/store";
import { canAnswer, canCreate, canSeeResults, classmatesOf, compactResponses, CONSENT_TEXT, createSurvey, fillDemoResponses, saveResponse, surveyById, type Audience } from "@/lib/surveys";
import { showDemoSecrets } from "@/lib/accounts";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ───────────── Crear ─────────────

export type CreateState = { error?: string };

async function createImpl(f: FormData): Promise<CreateState> {
  const s = await getSession();
  if (!s) redirect("/ingresar?next=/encuestas/nueva");
  const kind = str(f, "kind") === "sociometrica" ? "sociometrica" : "general";
  if (!canCreate(s.person, kind)) return { error: "Su perfil no permite crear este tipo de encuesta." };
  const title = str(f, "title");
  if (title.length < 5 || title.length > 120) return { error: "El título debe tener entre 5 y 120 caracteres." };
  const intro = str(f, "intro").slice(0, 600);
  const closesOn = /^\d{4}-\d{2}-\d{2}$/.test(str(f, "closesOn")) ? str(f, "closesOn") : undefined;

  if (kind === "sociometrica") {
    const courseId = str(f, "courseId");
    if (!repo.course(courseId)) return { error: "Elija el curso." };
    if (f.get("consent") !== "1") return { error: "Confirme que las familias fueron informadas y autorizaron la encuesta." };
    const optional = new Set(f.getAll("optional").map(String));
    const questions = SOCIOMETRIC_QUESTIONS.filter((q) => q.required || optional.has(q.id));
    const survey = createSurvey({
      kind, title, intro, closesOn, courseId, questions, audience: "estudiantes", anonymous: false, createdBy: s.person.id,
      consent: { by: s.person.id, at: new Date().toISOString(), text: CONSENT_TEXT },
    });
    redirect(`/encuestas/${survey.id}`);
  }

  const audience = (["estudiantes", "apoderados", "funcionarios"] as Audience[]).find((a) => a === str(f, "audience")) ?? "estudiantes";
  const courseId = audience !== "funcionarios" && repo.course(str(f, "courseId")) ? str(f, "courseId") : null;
  const questions: Question[] = [];
  for (let i = 0; i < 8; i++) {
    const text = str(f, `q${i}-text`);
    if (!text) continue;
    const type = (["escala", "opcion", "texto"] as QuestionType[]).find((t) => t === str(f, `q${i}-type`)) ?? "escala";
    const options = type === "opcion" ? str(f, `q${i}-options`).split(/[;\n]/).map((o) => o.trim()).filter(Boolean).slice(0, 10) : undefined;
    if (type === "opcion" && (options?.length ?? 0) < 2) return { error: `La pregunta ${i + 1} necesita al menos dos opciones separadas por punto y coma.` };
    questions.push({ id: `q${i}`, text: text.slice(0, 200), type, options, required: f.get(`q${i}-required`) === "1" });
  }
  if (!questions.length) return { error: "Agregue al menos una pregunta." };
  const survey = createSurvey({ kind, title, intro, closesOn, courseId, questions, audience, anonymous: f.get("anonymous") === "1", createdBy: s.person.id });
  redirect(`/encuestas/${survey.id}`);
}

export async function createSurveyAction(_prev: CreateState, f: FormData) {
  return withState(() => createImpl(f));
}

// ───────────── Responder ─────────────

export type AnswerState = { issues?: string[]; answers?: Answers; attempt?: number };

async function answerImpl(f: FormData): Promise<AnswerState> {
  const s = await getSession();
  const survey = surveyById(str(f, "surveyId"));
  if (!s || !survey) redirect("/encuestas");
  if (!canAnswer(s.person, survey)) return { issues: ["Esta encuesta no está disponible para usted."] };
  const answers: Answers = {};
  for (const q of survey.questions) {
    if (q.type === "companeros") answers[q.id] = f.getAll(q.id).map(String);
    else if (q.type === "escala") {
      const v = Number(f.get(q.id));
      if (v) answers[q.id] = v;
    } else if (str(f, q.id)) answers[q.id] = str(f, q.id);
  }
  const classmates = survey.kind === "sociometrica" ? classmatesOf(s.person.id).map((c) => c.id) : [];
  const issues = answerIssues(survey.questions, answers, classmates);
  if (issues.length) return { issues, answers, attempt: Date.now() };
  saveResponse(survey.id, s.person.id, answers);
  redirect(`/encuestas/${survey.id}?enviada=1`);
}

export async function answerSurvey(_prev: AnswerState, f: FormData) {
  return withState(() => answerImpl(f));
}

// ───────────── Cerrar o reabrir ─────────────

async function toggleImpl(f: FormData) {
  const s = await getSession();
  const survey = surveyById(str(f, "surveyId"));
  if (!s || !survey) redirect("/encuestas");
  if (canSeeResults(s.person, survey)) {
    survey.status = survey.status === "abierta" ? "cerrada" : "abierta";
    compactResponses(survey.id);
  }
  redirect(`/encuestas/${survey.id}`);
}

export async function toggleSurvey(f: FormData) {
  return withState(() => toggleImpl(f));
}
// ───────────── Solo maqueta: completar con respuestas ficticias ─────────────

async function fillImpl(f: FormData) {
  const s = await getSession();
  const survey = surveyById(str(f, "surveyId"));
  if (!s || !survey) redirect("/encuestas");
  if (!showDemoSecrets() || !canSeeResults(s.person, survey)) redirect(`/encuestas/${survey.id}`);
  const n = fillDemoResponses(survey);
  redirect(`/encuestas/${survey.id}?completada=${n}`);
}

export async function fillDemoSurvey(f: FormData) {
  return withState(() => fillImpl(f));
}
