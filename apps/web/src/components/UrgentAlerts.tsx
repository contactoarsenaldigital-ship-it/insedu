import Link from "next/link";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { actorOf, vaultService } from "@/lib/vault";

/**
 * Aviso en todas las pantallas para quien ejerce hoy como Encargado de Salvaguarda, mientras tenga
 * alertas urgentes sin revisar. Solo muestra cuántas son: ni el estudiante ni el contenido.
 */
export async function UrgentAlerts() {
  await readState();
  const session = await getSession();
  if (!session) return null;
  const count = (await vaultService()).pendingUrgentCount(actorOf(session));
  if (!count) return null;
  return (
    <div className="urgent-strip" role="alert">
      <span>{count === 1 ? "Hay 1 alerta urgente sin revisar en Salvaguarda." : `Hay ${count} alertas urgentes sin revisar en Salvaguarda.`}</span>
      <Link href="/salvaguarda" className="btn small">Revisar ahora</Link>
    </div>
  );
}
