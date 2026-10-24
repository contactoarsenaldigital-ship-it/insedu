import { redirect } from "next/navigation";
import { Copilot } from "./Copilot";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
export const dynamic = "force-dynamic";

export const metadata = { title: "Copiloto Docente" };

export default async function CopilotPage() {
  await readState();
  const session = await getSession();
  if (!session) redirect("/ingresar?next=/copiloto");
  const isTeacher = session.person.roles.includes("teacher");
  const live = Boolean(process.env.GEMINI_API_KEY);
  return (
    <main className="wrap" style={{ maxWidth: 860 }}>
      <span className="muted">Docente</span>
      <h1>Copiloto Docente</h1>
      <p>Genere guías, pruebas con pauta, rúbricas y planificaciones alineadas a las Bases Curriculares. Todo resultado es un borrador que usted revisa y aprueba.</p>
      {!live && <p className="notice">Modo demostración sin conexión a Gemini: configure GEMINI_API_KEY en el servidor para generar contenido real.</p>}
      {isTeacher ? (
        <Copilot />
      ) : (
        <p className="notice warn">El Copiloto está disponible solo para docentes. Ingrese, por ejemplo, como Carolina Fuentes.</p>
      )}
    </main>
  );
}
