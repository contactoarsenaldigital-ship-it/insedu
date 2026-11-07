import { demoSignCode } from "@/lib/verifier";
import type { Session } from "@/lib/session";

/** Solo maqueta: muestra rotulado el código vigente del verificador para poder firmar. */
export function DemoCode({ session }: { session: Session }) {
  const code = demoSignCode(session);
  if (!code) return null;
  return <p className="notice">Demostración: su código vigente es <strong>{code}</strong> (cambia cada 30 segundos). En el piloto se firma con la app vinculada en tramites.mineduc.cl.</p>;
}
