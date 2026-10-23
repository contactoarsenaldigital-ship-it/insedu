import { Copilot } from "./Copilot";
import { readState } from "@/lib/state";
export const dynamic = "force-dynamic";

export const metadata = { title: "Copiloto Docente" };

export default async function CopilotPage() {
  await readState();
  const live = Boolean(process.env.GEMINI_API_KEY);
  return (
    <main className="wrap" style={{ maxWidth: 860 }}>
      <span className="muted">Docente</span>
      <h1>Copiloto Docente</h1>
      <p>Genere guías, pruebas con pauta, rúbricas y planificaciones alineadas a las Bases Curriculares. Todo resultado es un borrador que usted revisa y aprueba.</p>
      {!live && <p className="notice">Modo demostración sin conexión a Gemini: configure GEMINI_API_KEY en el servidor para generar contenido real.</p>}
      <Copilot />
    </main>
  );
}
