import "server-only";
import { AiGateway, type AiTier, type DataMode, type GatewayConfig } from "@insedu/domain";
import { EchoProvider, GeminiProvider } from "@insedu/domain/server";
import { settings } from "./accounts";

let gateway: AiGateway | null = null;
let config: GatewayConfig | null = null;

/** Respaldo si el modelo principal falla: GEMINI_FALLBACK_MODELS, separados por coma. */
const fallbackModels = () => (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.1-flash-lite,gemini-3.8-flash").split(",").map((m) => m.trim()).filter(Boolean);

/** Gateway único por instancia. La API key solo existe en variables de entorno del servidor. */
export function aiGateway(): AiGateway {
  if (!gateway || !config) {
    const key = process.env.GEMINI_API_KEY;
    const provider = key ? new GeminiProvider(key, process.env.GEMINI_MODEL || "gemini-3.5-flash-lite", { fallbacks: fallbackModels() }) : new EchoProvider();
    config = {
      tier: (process.env.AI_TIER as AiTier) || "free",
      dataMode: (process.env.INSEDU_DATA_MODE as DataMode) || "synthetic",
      perUserPerMinute: 5,
      perUserPerDay: 60,
    };
    gateway = new AiGateway(provider, config);
  }
  // En la demostración varios visitantes comparten los mismos usuarios ficticios.
  // El tope diario lo define administración en Configuración → Parámetros (0 = desactivado).
  config.totalPerDay = settings().copilotDailyLimit;
  return gateway;
}
