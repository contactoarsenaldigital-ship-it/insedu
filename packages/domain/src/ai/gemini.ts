/**
 * Adaptador Gemini (API REST de Google AI). SOLO SERVIDOR: la API key nunca llega al cliente.
 * Para Etapa 2 se agrega un adaptador equivalente para el servicio pagado; el gateway no cambia.
 */
import type { AiProvider } from "./gateway";

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 30_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new Error("Falta GEMINI_API_KEY");
  }

  async generate(req: { system: string; prompt: string; json?: boolean }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
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
        throw new Error(`Gemini respondió ${res.status}`);
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      return { text, model: this.model };
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
