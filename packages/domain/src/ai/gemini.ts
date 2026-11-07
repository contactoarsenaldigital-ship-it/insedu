/**
 * Adaptador Gemini (API REST de Google AI). SOLO SERVIDOR: la API key nunca llega al cliente.
 * Para Etapa 2 se agrega un adaptador equivalente para el servicio pagado; el gateway no cambia.
 */
import { AiProviderError, type AiFailureKind, type AiProvider } from "./gateway";

export type GeminiOptions = {
  /** Modelos de respaldo, en orden, si el principal no está disponible. */
  fallbacks?: string[];
  /** Tiempo máximo de cada intento. */
  timeoutMs?: number;
  /** Tiempo máximo total, sumando intentos y esperas. */
  deadlineMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const kindOf = (status: number, detail: string): AiFailureKind => {
  if (status === 429) return "cuota";
  if (status === 401 || status === 403 || (status === 400 && /api.?key/i.test(detail))) return "credencial";
  if (status === 404) return "modelo";
  if (status === 504) return "tiempo";
  if (status >= 500) return "sobrecarga";
  return "otro";
};

/** El mismo modelo se reintenta solo ante fallas pasajeras; cuota, 404 y tiempo pasan al respaldo. */
const retrySameModel = (e: AiProviderError) => e.kind === "sobrecarga" || (e.kind === "otro" && e.status === null);
/** Credencial o solicitud inválida: fallaría igual con cualquier modelo. */
const isFinal = (e: AiProviderError) => e.kind === "credencial" || (e.kind === "otro" && e.status !== null);

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  private readonly models: string[];
  private readonly timeoutMs: number;
  private readonly deadlineMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly apiKey: string, model: string, opts: GeminiOptions = {}) {
    if (!apiKey) throw new Error("Falta GEMINI_API_KEY");
    this.models = [...new Set([model, ...(opts.fallbacks ?? [])])];
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.deadlineMs = opts.deadlineMs ?? 55_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async generate(req: { system: string; prompt: string; json?: boolean }) {
    const started = Date.now();
    const remaining = () => this.deadlineMs - (Date.now() - started);
    const attempts: string[] = [];
    let first: AiProviderError | undefined;
    // Se informa la falla del modelo principal: es la que explica el problema.
    const failure = () => {
      const e = first ?? new AiProviderError("tiempo", null, "Se agotó el tiempo total");
      e.attempts = attempts;
      return e;
    };

    for (const model of this.models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (remaining() < 2_000) throw failure();
        try {
          const text = await this.call(model, req, Math.min(this.timeoutMs, remaining()));
          return { text, model };
        } catch (err) {
          const e = err instanceof AiProviderError ? err : new AiProviderError("otro", null, String(err));
          attempts.push(`${model}: ${e.status ?? e.kind}`);
          first ??= e;
          if (isFinal(e)) throw failure();
          if (attempt > 0 || !retrySameModel(e)) break;
          await this.sleep(800 + Math.random() * 700); // espera con variación, como pide Google
        }
      }
    }
    throw failure();
  }

  private async call(model: string, req: { system: string; prompt: string; json?: boolean }, timeoutMs: number) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.prompt }] }],
          generationConfig: req.json ? { responseMimeType: "application/json" } : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        const detail = body?.error?.message?.slice(0, 300) ?? "";
        throw new AiProviderError(kindOf(res.status, detail), res.status, detail);
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text.trim()) {
        throw new AiProviderError("sin_contenido", res.status, data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "Respuesta vacía");
      }
      return text;
    } catch (e) {
      if (ctrl.signal.aborted) throw new AiProviderError("tiempo", null, `Sin respuesta en ${timeoutMs} ms`);
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
}

/** Proveedor de demostración sin red (útil en pruebas y sin API key). */
export class EchoProvider implements AiProvider {
  readonly name = "demo";
  async generate(req: { system: string; prompt: string }) {
    return {
      text: `BORRADOR DE DEMOSTRACIÓN\n\nSolicitud: ${req.prompt.slice(0, 300)}\n\n(Configure GEMINI_API_KEY para generar contenido real.)`,
      model: "demo-offline",
    };
  }
}
