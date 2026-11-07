import { describe, expect, it } from "vitest";
import { aiFailureMessage, AiProviderError } from "../src/ai/gateway";
import { GeminiProvider } from "../src/ai/gemini";

const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const err = (status: number, message = "") => new Response(JSON.stringify({ error: { message } }), { status });

/** Proveedor con respuestas en orden; registra qué modelo se pidió en cada llamada. */
function provider(responses: (() => Response)[], fallbacks = ["respaldo"]) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(/models\/(.+):generateContent/.exec(url)![1]!);
    return responses.shift()!();
  }) as unknown as typeof fetch;
  return { calls, p: new GeminiProvider("k", "principal", { fallbacks, fetchImpl, sleep: async () => undefined }) };
}
const req = { system: "s", prompt: "p" };
const failure = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("debía fallar");
    },
    (e: AiProviderError) => e,
  );

describe("GeminiProvider", () => {
  it("reintenta una sobrecarga en el mismo modelo", async () => {
    const { p, calls } = provider([() => err(503), () => ok("hola")]);
    expect(await p.generate(req)).toEqual({ text: "hola", model: "principal" });
    expect(calls).toEqual(["principal", "principal"]);
  });

  it("pasa al respaldo si la sobrecarga persiste", async () => {
    const { p, calls } = provider([() => err(503), () => err(503), () => ok("hola")]);
    expect((await p.generate(req)).model).toBe("respaldo");
    expect(calls).toEqual(["principal", "principal", "respaldo"]);
  });

  it("cuota agotada o modelo inexistente pasan directo al respaldo", async () => {
    for (const status of [429, 404]) {
      const { p, calls } = provider([() => err(status), () => ok("hola")]);
      expect((await p.generate(req)).model).toBe("respaldo");
      expect(calls).toEqual(["principal", "respaldo"]);
    }
  });

  it("una credencial rechazada no se reintenta", async () => {
    for (const r of [() => err(403), () => err(400, "API key not valid")]) {
      const { p, calls } = provider([r]);
      const e = await failure(p.generate(req));
      expect(e.kind).toBe("credencial");
      expect(calls).toHaveLength(1);
    }
  });

  it("si todo falla informa la causa del modelo principal y registra los intentos", async () => {
    const { p } = provider([() => err(429, "quota"), () => err(503), () => err(503)]);
    const e = await failure(p.generate(req));
    expect(e.kind).toBe("cuota");
    expect(e.message).toBe("quota");
    expect(e.attempts).toEqual(["principal: 429", "respaldo: 503", "respaldo: 503"]);
    expect(aiFailureMessage(e)).toContain("cuota");
  });

  it("una respuesta vacía es una falla, no un borrador en blanco", async () => {
    const empty = () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 });
    const { p } = provider([empty], []);
    const e = await failure(p.generate(req));
    expect(e.kind).toBe("sin_contenido");
    expect(e.message).toBe("SAFETY");
  });

  it("corta un intento que no responde y prueba el respaldo", async () => {
    const calls: string[] = [];
    const fetchImpl = ((url: string, init: RequestInit) => {
      calls.push(url);
      if (calls.length === 1) return new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(new Error("abort"))));
      return Promise.resolve(ok("hola"));
    }) as unknown as typeof fetch;
    const p = new GeminiProvider("k", "principal", { fallbacks: ["respaldo"], timeoutMs: 20, fetchImpl });
    expect((await p.generate(req)).model).toBe("respaldo");
  });

  it("un error desconocido conserva el mensaje genérico", () => {
    expect(aiFailureMessage(new Error("x"))).toContain("no respondió");
  });
});
