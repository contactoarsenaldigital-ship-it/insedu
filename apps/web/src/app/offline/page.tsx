import Link from "next/link";

export const metadata = { title: "Sin conexión" };

export default function Offline() {
  return (
    <main className="wrap">
      <h1>Sin conexión</h1>
      <p>Esta sección necesita red. El escaneo de credenciales sigue funcionando y se sincronizará al reconectar.</p>
      <Link className="btn" href="/escanear">Ir al escáner</Link>
    </main>
  );
}
