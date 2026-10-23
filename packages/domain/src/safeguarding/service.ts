/**
 * Servicio de la bóveda de Salvaguarda (SOLO SERVIDOR).
 *
 * Toda operación pasa por: política de acceso → registro en el log inmutable → cifrado.
 * El almacenamiento (VaultStore) solo guarda metadatos mínimos y contenido cifrado; en la
 * Etapa 1 es una implementación en memoria, después el proyecto Supabase "bóveda".
 */
import { uuidv7 } from "../ids";
import { open, seal, type KeyProvider, type SealedRecord } from "./crypto";
import {
  canDeposit,
  canExport,
  canReadVault,
  currentHolder,
  validateInstruction,
  type Actor,
  type BreakGlassGrant,
  type ProtectionInstruction,
  type SafeguardingAssignment,
} from "./policy";
import { protocolById } from "./protocols";

export type CaseStatus = "abierto" | "seguimiento" | "cerrado";

export type CaseContent = {
  title: string;
  entries: { at: string; by: string; kind: "nota" | "deposito" | "sistema"; text: string }[];
};

export type VaultCase = {
  id: string;
  tenantId: string;
  studentId: string;
  openedAt: string;
  updatedAt: string;
  status: CaseStatus;
  sealed: SealedRecord;
};

export type DepositKind = "entrevista" | "derivacion" | "documento" | "nota_seguimiento" | "revelacion";

export const DEPOSIT_LABEL: Record<DepositKind, string> = {
  entrevista: "entrevista",
  derivacion: "derivación",
  documento: "documento",
  nota_seguimiento: "nota de seguimiento",
  revelacion: "revelación",
};

/** Una misma consulta (persona, estudiante, motivo) se registra una vez cada 10 minutos. */
export const ACCESS_DEDUP_MS = 10 * 60_000;

export type Deposit = {
  id: string;
  tenantId: string;
  studentId: string;
  depositedBy: string;
  depositedRole: string;
  kind: DepositKind;
  sealed: SealedRecord;
  depositedAt: string;
  reviewedAt?: string;
  caseId?: string;
};

export type ProtocolActivation = {
  id: string;
  tenantId: string;
  caseId: string;
  studentId: string;
  protocolId: string;
  activatedBy: string;
  activatedAt: string;
  dueAt?: string;
  completedAt?: string;
  completedTo?: string;
  reference?: string;
};

export type AccessAction = "open" | "export" | "deposit" | "break_glass" | "designation" | "denied" | "protocol" | "instruction";

export type AccessLogEntry = {
  id: string;
  tenantId: string;
  actorId: string;
  action: AccessAction;
  studentId?: string;
  basis?: string;
  reason?: string;
  at: string;
};

export interface VaultStore {
  assignment(tenantId: string): SafeguardingAssignment | undefined;
  setAssignment(a: SafeguardingAssignment): void;
  cases(tenantId: string): VaultCase[];
  saveCase(c: VaultCase): void;
  deposits(tenantId: string): Deposit[];
  saveDeposit(d: Deposit): void;
  protocols(tenantId: string): ProtocolActivation[];
  saveProtocol(p: ProtocolActivation): void;
  grants(tenantId: string): BreakGlassGrant[];
  saveGrant(g: BreakGlassGrant): void;
  log(e: AccessLogEntry): void;
  accessLog(tenantId: string): AccessLogEntry[];
}

export class MemoryVaultStore implements VaultStore {
  private a = new Map<string, SafeguardingAssignment>();
  private c: VaultCase[] = [];
  private d: Deposit[] = [];
  private p: ProtocolActivation[] = [];
  private g: BreakGlassGrant[] = [];
  private l: AccessLogEntry[] = [];
  assignment = (t: string) => this.a.get(t);
  setAssignment = (x: SafeguardingAssignment) => void this.a.set(x.tenantId, x);
  cases = (t: string) => this.c.filter((x) => x.tenantId === t);
  saveCase = (x: VaultCase) => void (this.c = [...this.c.filter((y) => y.id !== x.id), x]);
  deposits = (t: string) => this.d.filter((x) => x.tenantId === t);
  saveDeposit = (x: Deposit) => void (this.d = [...this.d.filter((y) => y.id !== x.id), x]);
  protocols = (t: string) => this.p.filter((x) => x.tenantId === t);
  saveProtocol = (x: ProtocolActivation) => void (this.p = [...this.p.filter((y) => y.id !== x.id), x]);
  grants = (t: string) => this.g.filter((x) => x.tenantId === t);
  saveGrant = (x: BreakGlassGrant) => void this.g.push(x);
  log = (e: AccessLogEntry) => void this.l.push(Object.freeze({ ...e }));
  accessLog = (t: string) => this.l.filter((x) => x.tenantId === t);

  /** Acceso a cada colección completa, para persistirla (solo contenido cifrado y metadatos). */
  getAll(kind: VaultCollection): unknown[] {
    switch (kind) {
      case "assignments": return [...this.a.values()];
      case "cases": return this.c;
      case "deposits": return this.d;
      case "protocols": return this.p;
      case "grants": return this.g;
      case "access_log": return this.l;
    }
  }

  setAll(kind: VaultCollection, items: unknown[]) {
    switch (kind) {
      case "assignments": this.a = new Map((items as SafeguardingAssignment[]).map((x) => [x.tenantId, x])); break;
      case "cases": this.c = items as VaultCase[]; break;
      case "deposits": this.d = items as Deposit[]; break;
      case "protocols": this.p = items as ProtocolActivation[]; break;
      case "grants": this.g = items as BreakGlassGrant[]; break;
      case "access_log": this.l = (items as AccessLogEntry[]).map((e) => Object.freeze(e)); break;
    }
  }
}

export const VAULT_COLLECTIONS = ["assignments", "cases", "deposits", "protocols", "grants", "access_log"] as const;
export type VaultCollection = (typeof VAULT_COLLECTIONS)[number];

export class VaultDenied extends Error {
  override readonly name = "VaultDenied";
  constructor(public readonly reason: string) {
    super(reason);
  }
}

/**
 * Reconoce un VaultDenied aunque provenga de otra copia del módulo (en desarrollo, Next.js puede
 * cargar el paquete dos veces y entonces `instanceof` falla).
 */
export function isVaultDenied(e: unknown): e is VaultDenied {
  return e instanceof VaultDenied || (e instanceof Error && e.name === "VaultDenied" && typeof (e as VaultDenied).reason === "string");
}

/** Metadatos que el titular ve en su bandeja sin abrir contenido. */
export type CaseSummary = Omit<VaultCase, "sealed">;

export class VaultService {
  constructor(
    private readonly store: VaultStore,
    private readonly keys: KeyProvider,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private now = () => this.clock().toISOString();

  private record(actor: Actor, action: AccessAction, extra: Partial<AccessLogEntry> = {}) {
    this.store.log({ id: uuidv7(), tenantId: actor.tenantId, actorId: actor.userId, action, at: this.now(), ...extra });
  }

  private assignment(tenantId: string): SafeguardingAssignment {
    const a = this.store.assignment(tenantId);
    if (!a) throw new VaultDenied("El establecimiento no tiene Encargado de Salvaguarda designado");
    return a;
  }

  /** ¿Es el actor quien tiene hoy el acceso ordinario? (no exige MFA: solo para mostrar la bandeja) */
  isHolder(actor: Actor): boolean {
    const a = this.store.assignment(actor.tenantId);
    return Boolean(a && currentHolder(a, this.clock()) === actor.userId);
  }

  holder(tenantId: string): string | null {
    const a = this.store.assignment(tenantId);
    return a ? currentHolder(a, this.clock()) : null;
  }

  private requireHolder(actor: Actor, studentId: string, reason?: string) {
    const d = canReadVault(actor, this.assignment(actor.tenantId), { studentId, now: this.clock() });
    if (!d.allow || d.basis.startsWith("break_glass")) {
      const why = d.allow ? "Operación reservada al Encargado de Salvaguarda vigente" : d.reason;
      this.record(actor, "denied", { studentId, reason: why });
      throw new VaultDenied(why);
    }
    return { basis: d.basis, reason };
  }

  // ───────────── Bandeja (metadatos, sin descifrar) ─────────────

  inbox(actor: Actor) {
    if (!this.isHolder(actor)) {
      this.record(actor, "denied", { reason: "Bandeja reservada al Encargado de Salvaguarda vigente" });
      throw new VaultDenied("Bandeja reservada al Encargado de Salvaguarda vigente");
    }
    const t = actor.tenantId;
    const strip = ({ sealed: _s, ...rest }: VaultCase): CaseSummary => rest;
    return {
      cases: this.store.cases(t).map(strip).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      pendingDeposits: this.store
        .deposits(t)
        .filter((d) => !d.reviewedAt)
        .map(({ sealed: _s, ...rest }) => rest),
      protocols: this.store.protocols(t).sort((a, b) => (a.dueAt ?? "~").localeCompare(b.dueAt ?? "~")),
    };
  }

  // ───────────── Casos ─────────────

  async openCase(actor: Actor, studentId: string, title: string, firstNote: string) {
    this.requireHolder(actor, studentId);
    if (title.trim().length < 3) throw new VaultDenied("Indique un título breve para el caso");
    const id = uuidv7();
    const content: CaseContent = {
      title: title.trim(),
      entries: firstNote.trim() ? [{ at: this.now(), by: actor.userId, kind: "nota", text: firstNote.trim() }] : [],
    };
    return this.writeCase(actor, { id, tenantId: actor.tenantId, studentId, openedAt: this.now(), status: "abierto" }, content);
  }

  private async writeCase(actor: Actor, meta: Omit<VaultCase, "sealed" | "updatedAt">, content: CaseContent) {
    const sealed = await seal(this.keys, actor.tenantId, meta.id, content);
    const c: VaultCase = { ...meta, updatedAt: this.now(), sealed };
    this.store.saveCase(c);
    return c;
  }

  private findCase(actor: Actor, caseId: string) {
    const c = this.store.cases(actor.tenantId).find((x) => x.id === caseId);
    if (!c) throw new VaultDenied("Caso no encontrado");
    return c;
  }

  /** Abre el contenido de un caso: exige reautenticación reciente y motivo; queda en el log. */
  async readCase(actor: Actor, caseId: string, reason: string, grants: BreakGlassGrant[] = this.store.grants(actor.tenantId)) {
    const c = this.findCase(actor, caseId);
    const d = canReadVault(actor, this.assignment(actor.tenantId), { studentId: c.studentId, grants, now: this.clock() });
    if (!d.allow) {
      this.record(actor, "denied", { studentId: c.studentId, reason: d.reason });
      throw new VaultDenied(d.reason);
    }
    if (reason.trim().length < 5) throw new VaultDenied("Indique el motivo de la consulta");
    const action: AccessAction = d.basis.startsWith("break_glass") ? "break_glass" : "open";
    const since = this.clock().getTime() - ACCESS_DEDUP_MS;
    const repeated = this.store
      .accessLog(actor.tenantId)
      .some((e) => e.actorId === actor.userId && e.studentId === c.studentId && e.action === action && e.reason === reason && new Date(e.at).getTime() >= since);
    if (!repeated) this.record(actor, action, { studentId: c.studentId, basis: d.basis, reason });
    const content = await open<CaseContent>(this.keys, actor.tenantId, c.id, c.sealed);
    return { meta: { ...c, sealed: undefined }, content, basis: d.basis };
  }

  async addNote(actor: Actor, caseId: string, text: string) {
    const c = this.findCase(actor, caseId);
    this.requireHolder(actor, c.studentId);
    if (text.trim().length < 5) throw new VaultDenied("La nota está vacía");
    const content = await open<CaseContent>(this.keys, actor.tenantId, c.id, c.sealed);
    content.entries.push({ at: this.now(), by: actor.userId, kind: "nota", text: text.trim() });
    return this.writeCase(actor, { ...c, status: c.status === "abierto" ? "seguimiento" : c.status }, content);
  }

  async setStatus(actor: Actor, caseId: string, status: CaseStatus) {
    const c = this.findCase(actor, caseId);
    this.requireHolder(actor, c.studentId);
    const content = await open<CaseContent>(this.keys, actor.tenantId, c.id, c.sealed);
    content.entries.push({ at: this.now(), by: actor.userId, kind: "sistema", text: `Estado cambiado a "${status}"` });
    return this.writeCase(actor, { ...c, status }, content);
  }

  async exportCase(actor: Actor, caseId: string, reason: string) {
    const c = this.findCase(actor, caseId);
    const d = canExport(actor, this.assignment(actor.tenantId), { studentId: c.studentId, reason, now: this.clock() });
    if (!d.allow) {
      this.record(actor, "denied", { studentId: c.studentId, reason: d.reason });
      throw new VaultDenied(d.reason);
    }
    this.record(actor, "export", { studentId: c.studentId, basis: d.basis, reason });
    return open<CaseContent>(this.keys, actor.tenantId, c.id, c.sealed);
  }

  // ───────────── Depósito sin lectura ─────────────

  async deposit(actor: Actor, studentId: string, kind: DepositKind, text: string) {
    const d = canDeposit(actor, this.assignment(actor.tenantId));
    if (!d.allow) {
      this.record(actor, "denied", { studentId, reason: d.reason });
      throw new VaultDenied(d.reason);
    }
    if (text.trim().length < 10) throw new VaultDenied("Describa el antecedente (mínimo 10 caracteres)");
    const id = uuidv7();
    const sealed = await seal(this.keys, actor.tenantId, id, { text: text.trim() });
    const dep: Deposit = {
      id,
      tenantId: actor.tenantId,
      studentId,
      depositedBy: actor.userId,
      depositedRole: actor.roles[0] ?? "",
      kind,
      sealed,
      depositedAt: this.now(),
    };
    this.store.saveDeposit(dep);
    this.record(actor, "deposit", { studentId, basis: d.basis });
    // Al depositante solo se le confirma la recepción: no hay operación para leer lo depositado.
    return { id, depositedAt: dep.depositedAt };
  }

  /** El titular incorpora un depósito a un caso (existente o nuevo). */
  async reviewDeposit(actor: Actor, depositId: string, caseId?: string) {
    const dep = this.store.deposits(actor.tenantId).find((x) => x.id === depositId);
    if (!dep) throw new VaultDenied("Depósito no encontrado");
    this.requireHolder(actor, dep.studentId);
    const { text } = await open<{ text: string }>(this.keys, actor.tenantId, dep.id, dep.sealed);
    let c = caseId ? this.findCase(actor, caseId) : this.store.cases(actor.tenantId).find((x) => x.studentId === dep.studentId && x.status !== "cerrado");
    const label = DEPOSIT_LABEL[dep.kind];
    const entry = { at: this.now(), by: dep.depositedBy, kind: "deposito" as const, text: `[${label}] ${text}` };
    if (!c) {
      c = await this.openCase(actor, dep.studentId, `Caso abierto desde ${label}`, "");
    }
    const content = await open<CaseContent>(this.keys, actor.tenantId, c.id, c.sealed);
    content.entries.push(entry);
    const saved = await this.writeCase(actor, c, content);
    this.store.saveDeposit({ ...dep, reviewedAt: this.now(), caseId: saved.id });
    this.record(actor, "open", { studentId: dep.studentId, basis: "revision_deposito", reason: "Revisión de depósito" });
    return saved;
  }

  // ───────────── Protocolos y deber de denuncia ─────────────

  activateProtocol(actor: Actor, caseId: string, protocolId: string) {
    const c = this.findCase(actor, caseId);
    this.requireHolder(actor, c.studentId);
    const def = protocolById(protocolId);
    if (!def) throw new VaultDenied("Protocolo desconocido");
    const at = this.clock();
    const p: ProtocolActivation = {
      id: uuidv7(),
      tenantId: actor.tenantId,
      caseId,
      studentId: c.studentId,
      protocolId,
      activatedBy: actor.userId,
      activatedAt: at.toISOString(),
      dueAt: def.dueHours ? new Date(at.getTime() + def.dueHours * 3_600_000).toISOString() : undefined,
    };
    this.store.saveProtocol(p);
    this.record(actor, "protocol", { studentId: c.studentId, basis: protocolId });
    return p;
  }

  /** Registra el cumplimiento (p. ej. denuncia presentada): organismo y folio, sin relato. */
  completeProtocol(actor: Actor, activationId: string, to: string, reference: string) {
    const p = this.store.protocols(actor.tenantId).find((x) => x.id === activationId);
    if (!p) throw new VaultDenied("Activación no encontrada");
    this.requireHolder(actor, p.studentId);
    if (!to.trim()) throw new VaultDenied("Indique el organismo o la acción realizada");
    const done = { ...p, completedAt: this.now(), completedTo: to.trim(), reference: reference.trim() || undefined };
    this.store.saveProtocol(done);
    return done;
  }

  static overdue(p: ProtocolActivation, now: Date) {
    return !p.completedAt && p.dueAt != null && new Date(p.dueAt).getTime() < now.getTime();
  }

  // ───────────── Instrucción mínima ─────────────

  issueInstruction(actor: Actor, i: ProtectionInstruction) {
    this.requireHolder(actor, i.studentId);
    const issues = validateInstruction(i);
    if (issues.length) throw new VaultDenied(issues.join(". "));
    this.record(actor, "instruction", { studentId: i.studentId, basis: i.targetRole });
    return i; // el llamador la publica en la base principal (fuera de la bóveda)
  }

  // ───────────── Suplencia y acceso de emergencia ─────────────

  setSubstitution(actor: Actor, substituteUserId: string, from: string, until: string, approvals: string[]) {
    const a = this.assignment(actor.tenantId);
    if (actor.userId !== a.titularUserId && !actor.roles.includes("director")) {
      throw new VaultDenied("Solo el titular o la dirección pueden registrar una suplencia");
    }
    if (new Set(approvals).size < 2) throw new VaultDenied("La suplencia exige dos aprobaciones");
    if (substituteUserId === a.titularUserId) throw new VaultDenied("El suplente debe ser otra persona");
    if (new Date(until) <= new Date(from)) throw new VaultDenied("Vigencia inválida");
    const next = { ...a, substitute: { userId: substituteUserId, activeFrom: from, activeUntil: until } };
    this.store.setAssignment(next);
    this.record(actor, "designation", { basis: `suplencia:${substituteUserId}`, reason: `${from} a ${until}` });
    return next;
  }

  endSubstitution(actor: Actor) {
    const a = this.assignment(actor.tenantId);
    if (actor.userId !== a.titularUserId && actor.userId !== a.substitute?.userId && !actor.roles.includes("director")) {
      throw new VaultDenied("No autorizado");
    }
    const { substitute: _s, ...rest } = a;
    this.store.setAssignment(rest);
    this.record(actor, "designation", { basis: "fin_suplencia" });
  }

  requestBreakGlass(
    actor: Actor,
    req: { studentId: string; reason: BreakGlassGrant["reason"]; justification: string; approvedBy: string[]; hours: number },
  ) {
    if (req.justification.trim().length < 20) throw new VaultDenied("La justificación debe ser detallada (mínimo 20 caracteres)");
    if (req.hours <= 0 || req.hours > 4) throw new VaultDenied("El acceso de emergencia dura como máximo 4 horas");
    if (!req.approvedBy.filter((x) => x !== actor.userId).length) throw new VaultDenied("Requiere la aprobación de otra autoridad");
    const g: BreakGlassGrant = {
      id: uuidv7(),
      tenantId: actor.tenantId,
      grantedTo: actor.userId,
      studentId: req.studentId,
      reason: req.reason,
      justification: req.justification.trim(),
      expiresAt: new Date(this.clock().getTime() + req.hours * 3_600_000).toISOString(),
      approvedBy: req.approvedBy,
    };
    this.store.saveGrant(g);
    this.record(actor, "break_glass", { studentId: req.studentId, basis: `grant:${g.id}`, reason: g.justification });
    return g;
  }

  /** Auditoría para dirección: quién, qué acción, cuándo y motivo, nunca contenido. */
  audit(actor: Actor) {
    if (!actor.roles.includes("director") && !this.isHolder(actor)) throw new VaultDenied("No autorizado");
    return [...this.store.accessLog(actor.tenantId)].reverse();
  }

  /** Vista técnica: lo que vería un administrador de base de datos (solo bytes cifrados). */
  rawView(tenantId: string) {
    return this.store.cases(tenantId).map((c) => ({ id: c.id, studentId: c.studentId, keyProvider: c.sealed.kp, ciphertext: c.sealed.payload }));
  }
}
