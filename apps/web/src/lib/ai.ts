import "server-only";
import { AiGateway, type AiTier, type DataMode, type GatewayConfig } from "@insedu/domain";
import { EchoProvider, GeminiProvider } from "@insedu/domain/server";
import { settings } from "./accounts";

let gateway: AiGateway | null = null;
let config: GatewayConfig | null = null;

/** Gateway único por instancia. La API key solo existe en variables de entorno del servidor. */
export function aiGateway(): AiGateway {
  if (!gateway || !config) {
    const key = process.env.GEMINI_API_KEY;
    const provider = key ? new GeminiProvider(key, process.env.GEMINI_MODEL || "gemini-3.5-flash-lite") : new EchoProvider();
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
