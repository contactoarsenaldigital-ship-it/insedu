import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <span>
          <span className="brand">INS<span>E</span>DU</span> · Demostración con datos ficticios · © 2026
        </span>
        <nav aria-label="Pie de página">
          <Link href="/privacidad">Privacidad y protección de datos</Link>
          <Link href="/ingresar">Cambiar de usuario</Link>
        </nav>
      </div>
    </footer>
  );
}
