import { NextResponse } from "next/server";
import { AiBlockedError, buildCopilotRequest, type CopilotInput } from "@insedu/domain";
import { aiGateway } from "@/lib/ai";
import { fullName, school } from "@/lib/demo";
import { readState } from "@/lib/state";

const KINDS: CopilotInput["kind"][] = ["guia", "prueba", "rubrica", "planificacion"];

export async function POST(req: Request) {
  await readState();
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
      userId: "teacher-demo", // E1-F1: usuario de la sesión autenticada
      role: "teacher",
      system: built.system,
      prompt: built.prompt,
      knownNames: school().students.map(fullName),
    });
    return NextResponse.json({ draft: out.text, model: out.model, provider: out.provider, promptVersion: built.promptVersion });
  } catch (e) {
    if (e instanceof AiBlockedError) return NextResponse.json({ error: e.message, code: e.code }, { status: 422 });
    return NextResponse.json({ error: "El servicio de IA no respondió. Intente nuevamente en unos minutos." }, { status: 503 });
  }
}
