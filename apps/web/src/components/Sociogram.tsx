import { circleOrder, STATUS_LABEL, type SociogramResult, type SociometricStatus } from "@insedu/domain";

/** Color de cada estado: los que requieren atención en tonos cálidos. */
export const STATUS_COLOR: Record<SociometricStatus, string> = {
  popular: "#1b7a34",
  integrado: "#4a90c2",
  sin_reciprocidad: "#e3b341",
  aislado: "#ee9441",
  rechazado: "#b4441b",
  controvertido: "#8e44ad",
  sin_datos: "#9a9a9a",
};

/**
 * Sociograma circular: cada estudiante es un punto; las flechas son elecciones positivas
 * (más gruesas si son mutuas) y, opcionalmente, las menciones de dificultad en línea cortada.
 */
export function Sociogram({ result, labels, showNegative }: { result: SociogramResult; labels: Record<string, string>; showNegative: boolean }) {
  const size = 640;
  const c = size / 2;
  const R = c - 110;
  const order = circleOrder(result.students.map((s) => s.id), result.positiveEdges);
  const pos = new Map(order.map((id, i) => {
    const a = (2 * Math.PI * i) / order.length - Math.PI / 2;
    return [id, { x: c + R * Math.cos(a), y: c + R * Math.sin(a), a }];
  }));
  const status = new Map(result.students.map((s) => [s.id, s]));
  const radius = (id: string) => 7 + Math.min(10, (status.get(id)?.positive ?? 0) * 1.2);
  const line = (from: string, to: string) => {
    const p = pos.get(from)!;
    const q = pos.get(to)!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const r = radius(to) + 3;
    return { x1: p.x, y1: p.y, x2: q.x - (dx / len) * r, y2: q.y - (dy / len) * r };
  };
  const drawn = new Set<string>();

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="sociogram" role="img" aria-label="Sociograma del curso. El detalle por estudiante está en la tabla siguiente.">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#8a8a8a" />
        </marker>
        <marker id="arrow-neg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#b4441b" />
        </marker>
      </defs>
      {result.positiveEdges.map((e) => {
        if (e.mutual) {
          const key = [e.from, e.to].sort().join("|");
          if (drawn.has(key)) return null;
          drawn.add(key);
          const p = pos.get(e.from)!;
          const q = pos.get(e.to)!;
          return <line key={key} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="edge mutual" />;
        }
        return <line key={`${e.from}>${e.to}`} {...line(e.from, e.to)} className="edge" markerEnd="url(#arrow)" />;
      })}
      {showNegative && result.negativeEdges.map((e) => <line key={`n${e.from}>${e.to}`} {...line(e.from, e.to)} className="edge negative" markerEnd="url(#arrow-neg)" />)}
      {order.map((id) => {
        const p = pos.get(id)!;
        const s = status.get(id)!;
        const lx = c + (R + 22) * Math.cos(p.a);
        const ly = c + (R + 22) * Math.sin(p.a);
        return (
          <g key={id}>
            <circle cx={p.x} cy={p.y} r={radius(id)} fill={STATUS_COLOR[s.status]} stroke="#fff" strokeWidth={2} strokeDasharray={s.answered ? undefined : "3 2"}>
              <title>{`${labels[id]}: ${STATUS_LABEL[s.status]} · ${s.positive} elecciones · ${s.mutual} mutuas${s.answered ? "" : " · no respondió"}`}</title>
            </circle>
            <text x={lx} y={ly} textAnchor={Math.cos(p.a) > 0.2 ? "start" : Math.cos(p.a) < -0.2 ? "end" : "middle"} dominantBaseline="middle" className="node-label">
              {labels[id]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
