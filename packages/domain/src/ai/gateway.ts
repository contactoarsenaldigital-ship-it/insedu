/**
 * AI Gateway (Plan Maestro 4.10): contrato propio, adaptadores de proveedor.
 *
 * Puertas de seguridad aplicadas ANTES de llamar a cualquier proveedor:
 * 1. Nivel gratuito + datos reales = bloqueo (los términos del nivel gratuito permiten al
 *    proveedor usar entradas y salidas para mejorar sus productos y exigen usuarios adultos).
 * 2. Ninguna llamada originada por un estudiante.
 * 3. Detector de datos personales (RUT, correos, teléfonos, nombres conocidos).
 * 4. Cuotas por usuario y por minuto/día.
 * El contenido de la bóveda de Salvaguarda nunca llega aquí: el servicio de bóveda no
 * tiene dependencia hacia este módulo.
 */
import type { Role } from "../types";

export type AiTier = "free" | "paid";
export type DataMode = "synthetic" | "real";

export type AiTask = "generate.material" | "generate.assessment" | "generate.rubric" | "draft.report";

export type AiRequest = {
  task: AiTask;
  tenantId: string;
  userId: string;
  role: Role;
  system: string;
  prompt: string;
  /** Nombres de estudiantes del establecimiento, para detectar fugas. */
  knownNames?: string[];
  json?: boolean;
};

export type AiResult = {
  text: string;
  model: string;
  provider: string;
  latencyMs: number;
  inputChars: number;
};

export interface AiProvider {
  readonly name: string;
  generate(req: { system: string; prompt: string; json?: boolean }): Promise<Omit<AiResult, "latencyMs" | "inputChars" | "provider">>;
}

export class AiBlockedError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

const RUT_RE = /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE_RE = /(\+?56\s?)?9\s?\d{4}\s?\d{4}/;

export function detectPersonalData(text: string, knownNames: string[] = []): string[] {
  const found: string[] = [];
  if (RUT_RE.test(text)) found.push("RUT");
  if (EMAIL_RE.test(text)) found.push("correo");
  if (PHONE_RE.test(text)) found.push("teléfono");
  const lower = text.toLowerCase();
  for (const n of knownNames) {
    if (n.trim().length >= 5 && lower.includes(n.toLowerCase())) {
      found.push("nombre de estudiante");
      break;
    }
  }
  return found;
}

export type GatewayConfig = {
  tier: AiTier;
  dataMode: DataMode;
  perUserPerMinute: number;
  perUserPerDay: number;
  /** Interruptor remoto por establecimiento o función. */
  disabledTasks?: AiTask[];
};

type Counter = { minute: number; minuteStart: number; day: number; dayKey: string };

export type UsageLog = Omit<AiResult, "text"> & { task: AiTask; tenantId: string; userId: string; at: string };

export class AiGateway {
  private counters = new Map<string, Counter>();
  readonly usage: UsageLog[] = [];

  constructor(
    private readonly provider: AiProvider,
    private readonly cfg: GatewayConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Puerta técnica del go/no-go: con datos reales, el nivel gratuito queda bloqueado. */
  assertTierAllowed() {
    if (this.cfg.tier === "free" && this.cfg.dataMode === "real") {
      throw new AiBlockedError(
        "FREE_TIER_WITH_REAL_DATA",
        "El nivel gratuito no puede usarse con datos reales. Active el servicio pagado con acuerdo de procesamiento de datos.",
      );
    }
  }

  private checkQuota(userId: string) {
    const now = this.clock();
    const dayKey = now.toISOString().slice(0, 10);
    const c = this.counters.get(userId) ?? { minute: 0, minuteStart: now.getTime(), day: 0, dayKey };
    if (now.getTime() - c.minuteStart >= 60_000) {
      c.minute = 0;
      c.minuteStart = now.getTime();
    }
    if (c.dayKey !== dayKey) {
      c.day = 0;
      c.dayKey = dayKey;
    }
    if (c.minute >= this.cfg.perUserPerMinute) {
      throw new AiBlockedError("QUOTA_MINUTE", "Límite por minuto alcanzado. Intente en unos segundos.");
    }
    if (c.day >= this.cfg.perUserPerDay) {
      throw new AiBlockedError("QUOTA_DAY", "Límite diario alcanzado.");
    }
    c.minute++;
    c.day++;
    this.counters.set(userId, c);
  }

  async run(req: AiRequest): Promise<AiResult> {
    this.assertTierAllowed();
    if (req.role === "student") {
      throw new AiBlockedError("STUDENT_CALLER", "Las funciones de IA no están disponibles para estudiantes.");
    }
    if (this.cfg.disabledTasks?.includes(req.task)) {
      throw new AiBlockedError("TASK_DISABLED", "Función desactivada por el administrador.");
    }
    const pii = detectPersonalData(`${req.system}\n${req.prompt}`, req.knownNames);
    if (pii.length > 0) {
      throw new AiBlockedError(
        "PERSONAL_DATA",
        `La solicitud contiene datos personales (${pii.join(", ")}). Elimínelos antes de continuar.`,
      );
    }
    this.checkQuota(req.userId);

    const started = this.clock().getTime();
    const out = await this.provider.generate({ system: req.system, prompt: req.prompt, json: req.json });
    const result: AiResult = {
      ...out,
      provider: this.provider.name,
      latencyMs: this.clock().getTime() - started,
      inputChars: req.system.length + req.prompt.length,
    };
    // Registro de consumo sin persistir el contenido.
    this.usage.push({
      task: req.task,
      tenantId: req.tenantId,
      userId: req.userId,
      at: this.clock().toISOString(),
      model: result.model,
      provider: result.provider,
      latencyMs: result.latencyMs,
      inputChars: result.inputChars,
    });
    return result;
  }
}
