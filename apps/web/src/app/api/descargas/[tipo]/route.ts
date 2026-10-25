import { NextResponse } from "next/server";
import { fileSlug, sheetToCsv } from "@insedu/domain";
import { EXPORTS } from "@/lib/exports";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { sheetsToXlsx } from "@/lib/xlsx";

/**
 * Descarga de planillas en Excel (.xlsx) o CSV. Exige sesión y aplica en el servidor la misma
 * regla de acceso que la pantalla de origen (ver lib/exports.ts).
 */
export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  await readState();
  const { tipo } = await params;
  const url = new URL(req.url);
  const def = EXPORTS[tipo];
  if (!def) return NextResponse.json({ error: "Tipo de descarga no reconocido" }, { status: 404 });

  const session = await getSession();
  if (!session) {
    const back = req.headers.get("referer") ? new URL(req.headers.get("referer")!).pathname : "/libro";
    return NextResponse.redirect(new URL(`/ingresar?next=${encodeURIComponent(back)}`, url));
  }

  const p = { subjectId: url.searchParams.get("asignatura") ?? undefined, courseId: url.searchParams.get("curso") ?? undefined };
  if (!def.allowed(session, p)) return NextResponse.json({ error: "Su perfil no tiene acceso a esta información." }, { status: 403 });
  const sheet = def.build(p);
  if (!sheet) return NextResponse.json({ error: "No se encontró la información solicitada." }, { status: 404 });

  const name = fileSlug(sheet.title.split(" (")[0]!);
  const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (url.searchParams.get("formato") === "csv") {
    // BOM para que Excel reconozca UTF-8 (tildes y eñes).
    return new NextResponse("﻿" + sheetToCsv(sheet), {
      headers: { ...headers, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"` },
    });
  }
  const when = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }).format(new Date());
  const xlsx = await sheetsToXlsx([sheet], `INSEDU · Descargado por ${session.person.name} el ${when} · Datos ficticios de demostración`);
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      ...headers,
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}.xlsx"`,
    },
  });
}
