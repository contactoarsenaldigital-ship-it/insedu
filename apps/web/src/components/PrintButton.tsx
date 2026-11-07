"use client";

export function PrintButton() {
  return <button type="button" className="btn primary" onClick={() => window.print()}>Imprimir o guardar en PDF</button>;
}
