import { credentialPayload, formatRut } from "@insedu/domain";
import { fullName, school } from "@/lib/demo";
import { Scanner } from "./Scanner";
import { canScan, getSession } from "@/lib/session";
import { readState } from "@/lib/state";

export const metadata = { title: "Escanear credenciales" };

/**
 * La página queda disponible sin sesión (el service worker la guarda para usarla sin conexión),
 * pero el registro exige sesión de docente, inspectoría o portería: lo verifica /api/attendance/scan.
 */
export default async function ScanPage() {
  await readState();
  const session = await getSession();
  const allowed = !!session && canScan(session);
  const samples = school().students.slice(0, 3);
  return (
    <main className="wrap" style={{ maxWidth: 640 }}>
      <span className="muted">Portería · Inspectoría · Docentes</span>
      <h1>Escanear credenciales</h1>
      <p>Apunte la cámara al código de barras de la credencial. El código contiene el RUT del estudiante.</p>
      {!allowed && (
        <p className="notice warn">
          {session ? "Su perfil no registra asistencia." : "Para registrar asistencia debe ingresar."} Pueden escanear docentes, inspectoría y portería.{" "}
          <a href="/ingresar?next=/escanear">Ingresar</a>
        </p>
      )}
      <Scanner />
      {allowed && <details className="section">
        <summary>RUT de prueba del colegio ficticio</summary>
        <ul>
          {samples.map((s) => (
            <li key={s.id}>
              {fullName(s)} · {formatRut(s.rut)} · contenido del código: <code>{credentialPayload(s.rut)}</code>
            </li>
          ))}
        </ul>
      </details>}
    </main>
  );
}
