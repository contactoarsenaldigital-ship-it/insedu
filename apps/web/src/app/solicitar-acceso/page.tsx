import Link from "next/link";
import { RequestForm } from "./RequestForm";

export const metadata = { title: "Solicitar acceso" };

export default function RequestAccess() {
  return (
    <main className="wrap" style={{ maxWidth: 640 }}>
      <h1>Solicitar acceso</h1>
      <p>Complete sus datos. Administración del establecimiento revisará la solicitud, le asignará el perfil que corresponde y le enviará un enlace para crear su clave.</p>
      <RequestForm />
      <p className="muted section">¿Ya tiene cuenta? <Link href="/ingresar">Ingrese aquí</Link>.</p>
    </main>
  );
}
