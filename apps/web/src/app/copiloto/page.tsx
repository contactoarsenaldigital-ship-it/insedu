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
      <span className="muted no-print">Docente</span>
      <h1 className="no-print">Copiloto Docente</h1>
      <p className="no-print">Genere guías, pruebas con pauta, rúbricas y planificaciones alineadas a las Bases Curriculares, para todas las asignaturas de 1° Básico a 4° Medio. Todo resultado es un borrador que usted revisa, aprueba y descarga en Word o PDF.</p>
      {!live && <p className="notice no-print">Modo demostración sin conexión a Gemini: configure GEMINI_API_KEY en el servidor para generar contenido real.</p>}
      {isTeacher ? (
        <Copilot />
      ) : (
        <p className="notice warn">El Copiloto está disponible solo para docentes. Ingrese, por ejemplo, como Carolina Fuentes.</p>
      )}
    </main>
  );
}
