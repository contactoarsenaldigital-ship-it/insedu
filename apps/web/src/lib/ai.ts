import "server-only";
import { AiGateway, type AiTier, type DataMode } from "@insedu/domain";
import { EchoProvider, GeminiProvider } from "@insedu/domain/server";

let gateway: AiGateway | null = null;

/** Gateway único por instancia. La API key solo existe en variables de entorno del servidor. */
export function aiGateway(): AiGateway {
  if (gateway) return gateway;
  const key = process.env.GEMINI_API_KEY;
  const provider = key ? new GeminiProvider(key, process.env.GEMINI_MODEL || "gemini-2.5-flash") : new EchoProvider();
  gateway = new AiGateway(provider, {
    tier: (process.env.AI_TIER as AiTier) || "free",
    dataMode: (process.env.INSEDU_DATA_MODE as DataMode) || "synthetic",
    perUserPerMinute: 5,
    perUserPerDay: 60,
    // En la demostración varios visitantes comparten los mismos usuarios ficticios.
    totalPerDay: Number(process.env.AI_DAILY_LIMIT) || 100,
  });
  return gateway;
}
