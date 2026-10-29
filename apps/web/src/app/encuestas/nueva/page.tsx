import Link from "next/link";
import { redirect } from "next/navigation";
import { SOCIOMETRIC_QUESTIONS } from "@insedu/domain";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { repo } from "@/lib/store";
import { canCreate, CONSENT_TEXT } from "@/lib/surveys";
import { CreateForm } from "./CreateForm";

export const metadata = { title: "Nueva encuesta" };
export const dynamic = "force-dynamic";

export default async function NewSurvey() {
  await readState();
  const s = await getSession();
  if (!s) redirect("/ingresar?next=/encuestas/nueva");
  const kinds = (["sociometrica", "general"] as const).filter((k) => canCreate(s.person, k));
  if (!kinds.length) {
    return <main className="wrap"><h1>Nueva encuesta</h1><p className="notice warn">Su perfil no permite crear encuestas. Las crean dirección, administración, profesores jefe y el equipo de convivencia; las sociométricas, solo psicología, orientación y Salvaguarda.</p></main>;
  }
  return (
    <main className="wrap" style={{ maxWidth: 760 }}>
      <p className="muted"><Link href="/encuestas">Encuestas</Link></p>
      <h1>Nueva encuesta</h1>
      <CreateForm kinds={[...kinds]} courses={repo.courses().map((c) => ({ id: c.id, name: c.name }))} sociometric={SOCIOMETRIC_QUESTIONS} consentText={CONSENT_TEXT} />
    </main>
  );
}
