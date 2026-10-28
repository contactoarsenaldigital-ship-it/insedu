import Link from "next/link";
import { FACTOR_LABEL, PATTERN_LABEL, type StudentRisk } from "@insedu/domain";

const PRIORITY_LABEL = { alta: "Prioridad alta", media: "Prioridad media", seguimiento: "Seguimiento" } as const;
const TREND = { empeora: "▲ Empeora", estable: "= Estable", mejora: "▼ Mejora" } as const;

export function PriorityTag({ risk }: { risk: StudentRisk }) {
  if (!risk.priority) return <span className="muted">Sin factores</span>;
  return <span className={`tag risk-tag ${risk.priority}`}>{PRIORITY_LABEL[risk.priority]}</span>;
}

export function TrendTag({ risk }: { risk: StudentRisk }) {
  return <span className={`trend ${risk.trend}`}>{TREND[risk.trend]}</span>;
}

/** Factores actuales (último mes) y, si corresponde, el patrón detectado. */
export function FactorChips({ risk, reasons = false }: { risk: StudentRisk; reasons?: boolean }) {
  return (
    <div className="factor-chips">
      {risk.pattern && <strong className="pattern">{PATTERN_LABEL[risk.pattern]}</strong>}
      {risk.current.map((f) => (
        <span key={f.factor} className={`chip ${f.factor}`} title={f.reason}>
          {FACTOR_LABEL[f.factor]}{reasons ? `: ${f.reason}` : ""}
        </span>
      ))}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav className="breadcrumb" aria-label="Ruta">
      {items.map((it, i) => (
        <span key={it.label}>
          {i > 0 && " / "}
          {it.href ? <Link href={it.href}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function RiskNoAccess() {
  return (
    <main className="wrap" style={{ maxWidth: 720 }}>
      <h1>Tablero de indicadores</h1>
      <p className="notice warn">Este tablero reúne datos de rendimiento, conducta y salud: lo ve solo quien ejerce hoy como Encargado de Salvaguarda.</p>
      <p className="muted">En la demostración, <Link href="/ingresar?next=/salvaguarda/indicadores">ingrese como Verónica Díaz</Link> (Encargada de Salvaguarda).</p>
    </main>
  );
}

export const RISK_DISCLAIMER =
  "Los indicadores apoyan el criterio profesional: no son diagnósticos ni sanciones. Cada factor muestra su valor y su umbral; las acciones son sugerencias que el equipo evalúa según el Reglamento Interno y los protocolos.";
