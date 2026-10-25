"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { readCredentialScan, uuidv7, formatRut, type ScanEvent } from "@insedu/domain";
import { deviceId, enqueue, pending, remove } from "@/lib/scan-queue";

type Verified = {
  clientId: string;
  outcome: { kind: string; status?: string; minutesLate?: number; firstScanAt?: string; rut?: string };
  student?: { name: string; course: string; initials: string };
};

const TENANT = "00000000-0000-7000-8000-000000000001"; // colegio de demostración
const SCANNER_USER = "gate-1";

export function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const lastCode = useRef<{ code: string; at: number } | null>(null);
  const [camera, setCamera] = useState<"off" | "on" | "error">("off");
  const [online, setOnline] = useState(true);
  const [queueSize, setQueueSize] = useState(0);
  const [last, setLast] = useState<Verified | { offline: true; rut: string } | { invalid: string } | null>(null);
  const [manual, setManual] = useState("");
  const [accessPoint, setAccessPoint] = useState("Acceso principal");
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshQueue = useCallback(async () => setQueueSize((await pending()).length), []);

  const sync = useCallback(async () => {
    const items = await pending();
    if (items.length === 0 || !navigator.onLine) return;
    try {
      const res = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: items }),
      });
      if (res.status === 401 || res.status === 403) {
        // Sin sesión o sin permiso: los escaneos siguen en la cola del dispositivo hasta que ingrese alguien autorizado.
        setAuthError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "No autorizado para registrar asistencia.");
        return;
      }
      if (!res.ok) return;
      setAuthError(null);
      const data = (await res.json()) as { results: Verified[] };
      for (const r of data.results) await remove(r.clientId);
      const latest = data.results.at(-1);
      if (latest) setLast(latest);
    } finally {
      await refreshQueue();
    }
  }, [refreshQueue]);

  const handleCode = useCallback(
    async (raw: string) => {
      const rut = readCredentialScan(raw);
      if (!rut) {
        setLast({ invalid: raw });
        return;
      }
      // Evita lecturas repetidas del mismo código mientras sigue frente a la cámara.
      const now = Date.now();
      if (lastCode.current && lastCode.current.code === rut && now - lastCode.current.at < 4000) return;
      lastCode.current = { code: rut, at: now };
      navigator.vibrate?.(60);

      const ev: ScanEvent = {
        clientId: uuidv7(),
        tenantId: TENANT,
        rawCode: rut,
        scannedAt: new Date().toISOString(),
        scannedBy: SCANNER_USER,
        deviceId: deviceId(),
        accessPoint,
      };
      await enqueue(ev);
      await refreshQueue();
      if (navigator.onLine) await sync();
      else setLast({ offline: true, rut });
    },
    [accessPoint, refreshQueue, sync],
  );

  useEffect(() => {
    setOnline(navigator.onLine);
    refreshQueue();
    sync(); // al abrir (por ejemplo, recién ingresado) envía lo que quedó en cola
    const on = () => {
      setOnline(true);
      sync();
    };
    const off = () => setOnline(false);
    const vis = () => document.visibilityState === "visible" && sync();
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    document.addEventListener("visibilitychange", vis);
    const timer = setInterval(sync, 15000); // reintento periódico (iOS no tiene Background Sync)
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", vis);
      clearInterval(timer);
      stopRef.current?.();
    };
  }, [refreshQueue, sync]);

  async function startCamera() {
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.PDF_417, BarcodeFormat.QR_CODE]);
      const reader = new BrowserMultiFormatReader(hints);
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result) handleCode(result.getText());
      });
      stopRef.current = () => controls.stop();
      setCamera("on");
    } catch {
      setCamera("error");
    }
  }

  function stopCamera() {
    stopRef.current?.();
    stopRef.current = null;
    setCamera("off");
  }

  return (
    <div>
      <div className="field">
        <label htmlFor="ap">Punto de acceso</label>
        <select id="ap" value={accessPoint} onChange={(e) => setAccessPoint(e.target.value)}>
          <option>Acceso principal</option>
          <option>Portón de estacionamiento</option>
          <option>Acceso de enseñanza básica</option>
        </select>
      </div>

      <p className={`notice ${online ? "" : "warn"}`} aria-live="polite">
        {online ? "Con conexión." : "Sin conexión: los escaneos se guardan y se sincronizan al reconectar."}{" "}
        {queueSize > 0 && <strong>{queueSize} pendiente(s) de enviar.</strong>}
      </p>
      {authError && (
        <p className="notice warn" role="alert">
          {authError} Los escaneos quedan guardados en este dispositivo y se enviarán cuando ingrese un docente, inspectoría o portería.{" "}
          <a href="/ingresar?next=/escanear">Ingresar</a>
        </p>
      )}

      <video ref={videoRef} className="scan-video" muted playsInline hidden={camera !== "on"} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        {camera !== "on" ? (
          <button className="btn primary" onClick={startCamera}>Activar cámara</button>
        ) : (
          <button className="btn secondary" onClick={stopCamera}>Detener cámara</button>
        )}
      </div>
      {camera === "error" && <p className="notice warn">No se pudo usar la cámara. Revise el permiso del navegador o ingrese el RUT manualmente.</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleCode(manual);
          setManual("");
        }}
        className="field"
      >
        <label htmlFor="manual">Ingreso manual del RUT (credencial dañada u olvidada)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input id="manual" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="12.345.678-5" inputMode="text" autoComplete="off" style={{ flex: 1 }} />
          <button className="btn" type="submit">Registrar</button>
        </div>
      </form>

      <section aria-live="assertive">{last && <Result r={last} />}</section>
    </div>
  );
}

function Result({ r }: { r: Verified | { offline: true; rut: string } | { invalid: string } }) {
  if ("invalid" in r) {
    return <div className="scan-result warn"><h3>Código no válido</h3><p className="muted">El contenido leído no es un RUT válido. Pida la credencial o use el ingreso manual.</p></div>;
  }
  if ("offline" in r) {
    return <div className="scan-result"><h3>Guardado sin conexión</h3><p className="muted">RUT {formatRut(r.rut)}. La verificación con foto y nombre se hará al sincronizar.</p></div>;
  }
  const o = r.outcome;
  if (o.kind === "recorded" && r.student) {
    return (
      <div className={`scan-result ${o.status === "late" ? "warn" : "ok"}`}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div className="avatar" aria-hidden>{r.student.initials}</div>
          <div>
            <h3 style={{ margin: 0 }}>{r.student.name}</h3>
            <span className="muted">{r.student.course}</span>
          </div>
        </div>
        <p style={{ marginTop: 10 }}>
          {o.status === "late" ? <span className="tag alta">◷ Atraso de {o.minutesLate} min</span> : <span className="tag ok">✓ A tiempo · reconocimiento enviado</span>}
        </p>
        <p className="muted">Verifique que la persona coincide con la foto y el nombre.</p>
      </div>
    );
  }
  if (o.kind === "duplicate") {
    return <div className="scan-result warn"><h3>Credencial ya registrada hoy</h3><p className="muted">Primer escaneo: {new Date(o.firstScanAt!).toLocaleTimeString("es-CL")}. Verifique identidad: podría tratarse de una credencial copiada. Queda informado a inspectoría.</p></div>;
  }
  if (o.kind === "unknown_student") {
    return <div className="scan-result warn"><h3>RUT no matriculado</h3><p className="muted">No corresponde a un estudiante del establecimiento.</p></div>;
  }
  return <div className="scan-result"><h3>Ya sincronizado</h3></div>;
}
