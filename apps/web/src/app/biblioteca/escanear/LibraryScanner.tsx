"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readLibraryCode } from "@insedu/domain";

/** Lee el código de barras con la cámara trasera del teléfono o lo recibe tecleado. */
export function LibraryScanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const doneRef = useRef(false);
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "error">("off");
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const handle = useCallback(
    (raw: string) => {
      if (doneRef.current) return;
      const read = readLibraryCode(raw);
      if (!read) {
        setError("Ese código no se pudo leer. Intente de nuevo o escríbalo.");
        return;
      }
      doneRef.current = true;
      stop();
      navigator.vibrate?.(60);
      router.push(`/biblioteca/nuevo?codigo=${encodeURIComponent(read.code)}`);
    },
    [router, stop],
  );

  async function start() {
    setError("");
    setCamera("starting");
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        videoRef.current!,
        (result) => {
          if (result) handle(result.getText());
        },
      );
      stopRef.current = () => controls.stop();
      setCamera("on");
    } catch {
      setCamera("error");
    }
  }

  return (
    <div>
      <video ref={videoRef} className="scan-video" muted playsInline hidden={camera !== "on"} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        {camera === "on" ? (
          <button className="btn secondary" onClick={() => { stop(); setCamera("off"); }}>Detener cámara</button>
        ) : (
          <button className="btn primary" onClick={start} disabled={camera === "starting"}>{camera === "starting" ? "Abriendo cámara…" : "Activar cámara"}</button>
        )}
      </div>
      {camera === "on" && <p className="muted" aria-live="polite">Acerque el código de barras hasta que se vea nítido. Se lee solo.</p>}
      {camera === "error" && <p className="notice warn" role="alert">No se pudo usar la cámara. Revise el permiso del navegador o escriba el código.</p>}
      {error && <p className="notice warn" role="alert">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); handle(manual); }} className="field">
        <label htmlFor="manual-code">O escriba el ISBN, ISSN o código</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input id="manual-code" value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" inputMode="text" style={{ flex: 1 }} maxLength={40} placeholder="978-956-…" />
          <button className="btn" type="submit">Buscar</button>
        </div>
      </form>
    </div>
  );
}
