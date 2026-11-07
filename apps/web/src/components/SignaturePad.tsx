"use client";
import { useEffect, useRef, useState } from "react";

const WIDTH = 480;
const HEIGHT = 160;

/** Firma con el dedo o el mouse. Entrega un PNG en un campo oculto del formulario. */
export function SignaturePad({ name = "signature", label }: { name?: string; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#151515";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * WIDTH, y: ((e.clientY - r.top) / r.height) * HEIGHT };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasInk.current = true;
    setSigned(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (input.current && canvas.current && hasInk.current) input.current.value = canvas.current.toDataURL("image/png");
  };

  const clear = () => {
    canvas.current?.getContext("2d")?.clearRect(0, 0, WIDTH, HEIGHT);
    if (input.current) input.current.value = "";
    hasInk.current = false;
    setSigned(false);
  };

  return (
    <div className="field">
      <span id={`${name}-label`} style={{ fontWeight: 500, fontSize: ".88rem" }}>{label}</span>
      <canvas ref={canvas} width={WIDTH} height={HEIGHT} className="signature-pad" role="img" aria-labelledby={`${name}-label`} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      <input ref={input} type="hidden" name={name} />
      <div className="req-actions" style={{ alignItems: "center" }}>
        <button type="button" className="btn secondary small" onClick={clear}>Borrar firma</button>
        <span className="muted" aria-live="polite">{signed ? "Firma capturada" : "Firme en el recuadro"}</span>
      </div>
    </div>
  );
}
