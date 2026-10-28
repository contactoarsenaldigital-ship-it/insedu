/**
 * Gráficos del tablero de Salvaguarda, dibujados en el servidor como SVG.
 * Cada gráfico incluye sus datos en una tabla oculta para lectores de pantalla.
 */

type Bin = { period: { label: string; from: string }; uno: number; dos: number; tresOMas: number };

const SERIES = [
  { key: "tresOMas", label: "3 o más factores", className: "risk-3" },
  { key: "dos", label: "2 factores", className: "risk-2" },
  { key: "uno", label: "1 factor", className: "risk-1" },
] as const;

const short = (d: string) => d.slice(5).split("-").reverse().join("-");

/** Histograma apilado: estudiantes con 1, 2 y 3 o más factores en cada quincena. */
export function RiskHistogram({ data, compact = false, caption }: { data: Bin[]; compact?: boolean; caption: string }) {
  const W = 600;
  const H = compact ? 110 : 230;
  const pad = { top: compact ? 14 : 22, right: 8, bottom: compact ? 20 : 30, left: compact ? 8 : 34 };
  const totals = data.map((d) => d.uno + d.dos + d.tresOMas);
  const max = Math.max(1, ...totals);
  const step = max > 20 ? 10 : max > 8 ? 5 : max > 4 ? 2 : 1;
  const top = Math.ceil(max / step) * step;
  const plotH = H - pad.top - pad.bottom;
  const slot = (W - pad.left - pad.right) / data.length;
  const barW = Math.min(64, slot * 0.6);
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;

  return (
    <figure className={`risk-chart${compact ? " compact" : ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${caption}. ${data.map((d, i) => `${d.period.label}: ${totals[i]} estudiantes`).join("; ")}.`}>
        {!compact &&
          Array.from({ length: top / step + 1 }, (_, i) => i * step).map((t) => (
            <g key={t}>
              <line className="gridline" x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} />
              <text className="axis" x={pad.left - 6} y={y(t) + 4} textAnchor="end">{t}</text>
            </g>
          ))}
        {data.map((d, i) => {
          const x = pad.left + slot * i + (slot - barW) / 2;
          let acc = 0;
          return (
            <g key={d.period.from}>
              {SERIES.map((s) => {
                const v = d[s.key];
                if (!v) return null;
                const y0 = y(acc + v);
                const h = y(acc) - y0;
                acc += v;
                return (
                  <rect key={s.key} className={s.className} x={x} y={y0} width={barW} height={Math.max(h - 1, 0)} rx={3}>
                    <title>{`${d.period.label} · ${s.label}: ${v}`}</title>
                  </rect>
                );
              })}
              <text className="value" x={x + barW / 2} y={y(totals[i]!) - 5} textAnchor="middle">{totals[i] || ""}</text>
              <text className="axis" x={x + barW / 2} y={H - (compact ? 5 : 9)} textAnchor="middle">{short(d.period.from)}</text>
            </g>
          );
        })}
      </svg>
      {!compact && (
        <figcaption>
          <span>{caption}</span>
          <span className="risk-legend">
            {[...SERIES].reverse().map((s) => <span key={s.key}><i className={s.className} />{s.label}</span>)}
          </span>
        </figcaption>
      )}
      {/* Envuelta en un div: una tabla ignora el ancho de 1 px y ensancharía la página en el teléfono. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead><tr><th>Quincena</th><th>1 factor</th><th>2 factores</th><th>3 o más</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.period.from}><td>{d.period.label}</td><td>{d.uno}</td><td>{d.dos}</td><td>{d.tresOMas}</td></tr>)}</tbody>
        </table>
      </div>
    </figure>
  );
}

/** Mini histograma de un indicador por quincena, con su umbral. */
export function IndicatorBars({
  title,
  values,
  labels,
  max,
  threshold,
  thresholdLabel,
  isBad,
  format,
}: {
  title: string;
  values: (number | null)[];
  labels: string[];
  max: number;
  threshold: number;
  thresholdLabel: string;
  isBad: (v: number) => boolean;
  format: (v: number) => string;
}) {
  const W = 300;
  const H = 140;
  const pad = { top: 18, right: 6, bottom: 22, left: 6 };
  const plotH = H - pad.top - pad.bottom;
  const slot = (W - pad.left - pad.right) / values.length;
  const barW = Math.min(36, slot * 0.6);
  const y = (v: number) => pad.top + plotH - (Math.min(v, max) / max) * plotH;
  return (
    <figure className="indicator-chart">
      <figcaption>{title} <span className="threshold-note">- - umbral {thresholdLabel}</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${values.map((v, i) => `${labels[i]} ${v == null ? "sin datos" : format(v)}`).join("; ")}. Umbral ${thresholdLabel}.`}>
        <line className="threshold" x1={pad.left} x2={W - pad.right} y1={y(threshold)} y2={y(threshold)} />
        {values.map((v, i) => {
          const x = pad.left + slot * i + (slot - barW) / 2;
          return (
            <g key={labels[i]}>
              {v != null && (
                <rect className={isBad(v) ? "ind-bar bad" : "ind-bar"} x={x} y={y(v)} width={barW} height={Math.max(y(0) - y(v), 1.5)} rx={3}>
                  <title>{`${labels[i]}: ${format(v)}`}</title>
                </rect>
              )}
              <text className="value" x={x + barW / 2} y={v == null ? y(0) - 4 : y(v) - 4} textAnchor="middle">{v == null ? "—" : format(v)}</text>
              <text className="axis" x={x + barW / 2} y={H - 6} textAnchor="middle">{labels[i]}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
