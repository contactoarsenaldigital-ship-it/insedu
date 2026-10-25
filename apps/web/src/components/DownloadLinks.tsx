import { EXPORTS, exportHref, type ExportParams } from "@/lib/exports";
import { getSession } from "@/lib/session";
import { Icon } from "./Icon";

/** Enlaces Excel y CSV de una planilla; no se muestran si la persona no puede descargarla. */
export async function DownloadLinks({ tipo, params = {}, caption }: { tipo: keyof typeof EXPORTS; params?: ExportParams; caption?: string }) {
  const session = await getSession();
  const def = EXPORTS[tipo];
  if (!session || !def?.allowed(session, params)) return null;
  return (
    <span className="downloads" role="group" aria-label={`Descargar ${def.label.toLowerCase()}`}>
      <Icon name="download" size={18} />
      {caption && <span>{caption}</span>}
      <a className="btn small secondary" href={exportHref(tipo, "xlsx", params)} download>Excel</a>
      <a className="btn small secondary" href={exportHref(tipo, "csv", params)} download>CSV</a>
    </span>
  );
}
