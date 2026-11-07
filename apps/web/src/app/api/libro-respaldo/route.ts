import { NextResponse } from "next/server";
import { libroSheets } from "@/lib/libro-backup";
import { canExportMineduc, getSession } from "@/lib/session";
import { withState } from "@/lib/state";
import { logEvent, repo } from "@/lib/store";
import { sheetsToXlsx } from "@/lib/xlsx";

/** Respaldo del libro para fiscalización. Solo dirección y administración; queda en la bitácora. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  return withState(async () => {
    const session = await getSession();
    if (!session) return NextResponse.redirect(new URL("/ingresar?next=/informatica", url));
    if (!canExportMineduc(session)) return NextResponse.json({ error: "Su perfil no tiene acceso a esta información." }, { status: 403 });
    const courseId = url.searchParams.get("curso") || undefined;
    if (courseId && !repo.course(courseId)) return NextResponse.json({ error: "Curso no encontrado." }, { status: 404 });

    logEvent({ actor: session.person.id, action: "exportar", entity: "libro", recordId: courseId ?? "todos", courseId, reason: "Respaldo para fiscalización" });
    const when = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }).format(new Date());
    const xlsx = await sheetsToXlsx(libroSheets(courseId), `INSEDU · Respaldo descargado por ${session.person.name} el ${when}`);
    return new NextResponse(new Uint8Array(xlsx), {
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="libro-de-clases-respaldo${courseId ? `-${courseId}` : ""}.xlsx"`,
      },
    });
  });
}
