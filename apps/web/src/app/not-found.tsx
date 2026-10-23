import Link from "next/link";

export const metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <main className="wrap empty-state">
      <div className="code" aria-hidden="true">4<span>0</span>4</div>
      <h1>No encontramos esta página</h1>
      <p className="muted">Es posible que la dirección esté incompleta o que la sección ya no exista.</p>
      <div className="hero-actions" style={{ justifyContent: "center" }}>
        <Link href="/" className="btn">Ir al inicio</Link>
        <Link href="/ingresar" className="btn secondary">Cambiar de usuario</Link>
      </div>
    </main>
  );
}
