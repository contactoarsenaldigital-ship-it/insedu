import { credentialPayload, formatRut } from "@insedu/domain";
import { fullName, school } from "@/lib/demo";
import { Scanner } from "./Scanner";
import { readState } from "@/lib/state";

export const metadata = { title: "Escanear credenciales" };

export default async function ScanPage() {
  await readState();
  const samples = school().students.slice(0, 3);
  return (
    <main className="wrap" style={{ maxWidth: 640 }}>
      <span className="muted">Portería · Inspectoría · Docentes</span>
      <h1>Escanear credenciales</h1>
      <p>Apunte la cámara al código de barras de la credencial. El código contiene el RUT del estudiante.</p>
      <Scanner />
      <details className="section">
        <summary>RUT de prueba del colegio ficticio</summary>
        <ul>
          {samples.map((s) => (
            <li key={s.id}>
              {fullName(s)} · {formatRut(s.rut)} · contenido del código: <code>{credentialPayload(s.rut)}</code>
            </li>
          ))}
        </ul>
      </details>
    </main>
  );
}
