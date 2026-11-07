import { NextResponse } from "next/server";
import { AiBlockedError, aiFailureMessage, AiProviderError, buildCopilotRequest, type CopilotInput } from "@insedu/domain";
import { aiGateway } from "@/lib/ai";
import { fullName, school } from "@/lib/demo";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";

// Da tiempo a los reintentos y modelos de respaldo (hasta 55 s, ver GeminiProvider).
export const maxDuration = 60;

const KINDS: CopilotInput["kind"][] = ["guia", "prueba", "rubrica", "planificacion"];

export async function POST(req: Request) {
  await readState();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Ingrese como docente para usar el Copiloto." }, { status: 401 });
  if (!session.person.roles.includes("teacher")) {
    return NextResponse.json({ error: "El Copiloto está disponible solo para docentes." }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Partial<CopilotInput> | null;
  if (!body || !KINDS.includes(body.kind as CopilotInput["kind"]) || !body.subject || !body.level || !body.objective) {
    return NextResponse.json({ error: "Complete tipo, asignatura, nivel y objetivo." }, { status: 400 });
  }
  if (body.objective.length > 1500) {
    return NextResponse.json({ error: "El objetivo es demasiado extenso." }, { status: 400 });
  }
  const built = buildCopilotRequest({
    kind: body.kind as CopilotInput["kind"],
    subject: String(body.subject).slice(0, 60),
    level: String(body.level).slice(0, 40),
    objective: body.objective,
    items: Math.min(Math.max(Number(body.items) || 10, 3), 30),
    difficulty: body.difficulty,
  });
  try {
    const out = await aiGateway().run({
      task: built.task,
      tenantId: school().tenantId,
      userId: session.person.id,
      role: "teacher",
      system: built.system,
      prompt: built.prompt,
      knownNames: school().students.map(fullName),
    });
    return NextResponse.json({ draft: out.text, model: out.model, provider: out.provider, promptVersion: built.promptVersion });
  } catch (e) {
    if (e instanceof AiBlockedError) return NextResponse.json({ error: e.message, code: e.code }, { status: 422 });
    // Solo la causa técnica: nunca el contenido de la solicitud.
    if (e instanceof AiProviderError) console.error("Copiloto: falla de IA", { kind: e.kind, status: e.status, detail: e.message, attempts: e.attempts });
    else console.error("Copiloto: error inesperado", e);
    return NextResponse.json({ error: aiFailureMessage(e) }, { status: 503 });
  }
}
