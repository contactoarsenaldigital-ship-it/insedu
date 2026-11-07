import { NextResponse } from "next/server";
import { zipFiles } from "@insedu/domain/server";
import { edeExport } from "@/lib/ede";
import { canExportMineduc, getSession } from "@/lib/session";
import { readState, saveState } from "@/lib/state";
import { logEvent } from "@/lib/store";

/**
 * json.zip para el contenedor oficial edemineduc/etl (comandos parse, insert y check).
 * Con ?informe=1 devuelve solo el informe de lo que falta, sin datos personales.
 */
export async function GET(req: Request) {
  await readState();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Ingrese para descargar." }, { status: 401 });
  if (!canExportMineduc(session)) return NextResponse.json({ error: "Solo dirección y administración exportan al EDE." }, { status: 403 });
  const { json, issues, counts } = edeExport();
  if (new URL(req.url).searchParams.get("informe")) return NextResponse.json({ issues, counts }, { headers: { "cache-control": "no-store" } });

  const zip = zipFiles([{ name: "ede.json", content: Buffer.from(JSON.stringify(json), "utf8") }]);
  logEvent({ actor: session.person.id, action: "exportar", entity: "ede", recordId: new Date().toISOString(), after: { counts, problemas: issues.length } });
  await saveState();
  return new NextResponse(new Uint8Array(zip), {
    headers: { "content-type": "application/zip", "content-disposition": 'attachment; filename="json.zip"', "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
