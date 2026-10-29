"use server";
import { withState } from "@/lib/state";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { BreakGlassGrant, Role } from "@insedu/domain";
import { isVaultDenied, VaultDenied, type CaseStatus, type DepositKind } from "@insedu/domain/server";
import { publish } from "@/lib/instructions";
import { getSession } from "@/lib/session";
import { allStaff } from "@/lib/store";
import { actorOf, vaultService } from "@/lib/vault";

/**
 * Acciones de la bóveda. Cada una delega en VaultService, que aplica la política de acceso,
 * escribe en el log inmutable y cifra. Si falta la verificación en dos pasos, se pide.
 */
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function go(path: string, msg: { ok?: string; error?: string }): never {
  const q = new URLSearchParams(Object.entries(msg).filter(([, v]) => v) as [string, string][]);
  const sep = path.includes("?") ? "&" : "?";
  redirect(q.size ? `${path}${sep}${q}` : path);
}

async function run(back: string, fn: (actor: ReturnType<typeof actorOf>) => Promise<string | void> | string | void, ok: string) {
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=${encodeURIComponent(back)}`);
  let target = back;
  try {
    const r = await fn(actorOf(session));
    if (typeof r === "string") target = r;
  } catch (e) {
    if (isVaultDenied(e)) {
      if (/reautenticación|segundo factor/i.test(e.reason)) redirect(`/verificar?next=${encodeURIComponent(back)}`);
      go(back, { error: e.reason });
    }
    throw e;
  }
  revalidatePath("/salvaguarda", "layout");
  go(target, { ok });
}

async function createCaseImpl(f: FormData) {
  await run(
    "/salvaguarda",
    async (a) => {
      const c = await (await vaultService()).openCase(a, str(f, "studentId"), str(f, "title"), str(f, "note"));
      return `/salvaguarda/caso/${c.id}?motivo=${encodeURIComponent("Apertura del caso")}`;
    },
    "Caso abierto.",
  );
}

const caseUrl = (id: string) => `/salvaguarda/caso/${id}?motivo=${encodeURIComponent("Seguimiento del caso")}`;

async function addCaseNoteImpl(f: FormData) {
  const id = str(f, "caseId");
  await run(caseUrl(id), async (a) => void (await (await vaultService()).addNote(a, id, str(f, "text"))), "Nota agregada al expediente.");
}

async function setCaseStatusImpl(f: FormData) {
  const id = str(f, "caseId");
  await run(caseUrl(id), async (a) => void (await (await vaultService()).setStatus(a, id, str(f, "status") as CaseStatus)), "Estado del caso actualizado.");
}

async function activateProtocolImpl(f: FormData) {
  const id = str(f, "caseId");
  await run(caseUrl(id), async (a) => void (await vaultService()).activateProtocol(a, id, str(f, "protocolId")), "Protocolo activado. El plazo quedó registrado en su bandeja.");
}

async function completeProtocolImpl(f: FormData) {
  const id = str(f, "caseId");
  await run(
    caseUrl(id),
    async (a) => void (await vaultService()).completeProtocol(a, str(f, "activationId"), str(f, "to"), str(f, "reference")),
    "Cumplimiento registrado.",
  );
}

async function issueInstructionImpl(f: FormData) {
  const id = str(f, "caseId");
  await run(
    caseUrl(id),
    async (a) => {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
      const i = (await vaultService()).issueInstruction(a, {
        studentId: str(f, "studentId"),
        action: str(f, "action"),
        targetRole: str(f, "targetRole") as Role,
        validFrom: today,
        validUntil: str(f, "validUntil"),
        returnChannel: str(f, "returnChannel"),
      });
      publish(i, a.userId);
    },
    "Instrucción mínima emitida. El destinatario la verá sin diagnóstico ni relato.",
  );
}

async function reviewDepositImpl(f: FormData) {
  await run(
    "/salvaguarda",
    async (a) => {
      const c = await (await vaultService()).reviewDeposit(a, str(f, "depositId"));
      return caseUrl(c.id);
    },
    "Antecedente incorporado al expediente.",
  );
}

async function depositImpl(f: FormData) {
  await run(
    "/salvaguarda/depositar",
    async (a) => void (await (await vaultService()).deposit(a, str(f, "studentId"), str(f, "kind") as DepositKind, str(f, "text"))),
    "Antecedente entregado a Salvaguarda. Por confidencialidad, no podrá volver a verlo.",
  );
}

async function setSubstitutionImpl(f: FormData) {
  await run(
    "/salvaguarda",
    async (a) => {
      const approver = str(f, "approver");
      if (!allStaff().some((p) => p.id === approver)) throw new VaultDenied("Seleccione quién aprueba la suplencia");
      const from = new Date().toISOString();
      const until = new Date(`${str(f, "until")}T23:59:59-03:00`).toISOString();
      (await vaultService()).setSubstitution(a, str(f, "substituteId"), from, until, [a.userId, approver]);
    },
    "Suplencia activada. Mientras dure, solo el suplente accede al expediente.",
  );
}

async function endSubstitutionImpl() {
  await run("/salvaguarda", async (a) => void (await vaultService()).endSubstitution(a), "Suplencia terminada. El titular recupera el acceso.");
}

async function requestBreakGlassImpl(f: FormData) {
  await run(
    "/salvaguarda/auditoria",
    async (a) => {
      (await vaultService()).requestBreakGlass(a, {
        studentId: str(f, "studentId"),
        reason: str(f, "reason") as BreakGlassGrant["reason"],
        justification: str(f, "justification"),
        approvedBy: [str(f, "approver")].filter(Boolean),
        hours: Number(str(f, "hours")) || 1,
      });
    },
    "Acceso de emergencia concedido para un estudiante. Quedó alertado y será revisado.",
  );
}

// Cada acción sincroniza el estado antes de ejecutarse y guarda los cambios al terminar.
export async function createCase(f: FormData) {
  return withState(() => createCaseImpl(f));
}

export async function addCaseNote(f: FormData) {
  return withState(() => addCaseNoteImpl(f));
}

export async function setCaseStatus(f: FormData) {
  return withState(() => setCaseStatusImpl(f));
}

export async function activateProtocol(f: FormData) {
  return withState(() => activateProtocolImpl(f));
}

export async function completeProtocol(f: FormData) {
  return withState(() => completeProtocolImpl(f));
}

export async function issueInstruction(f: FormData) {
  return withState(() => issueInstructionImpl(f));
}

export async function reviewDeposit(f: FormData) {
  return withState(() => reviewDepositImpl(f));
}

export async function deposit(f: FormData) {
  return withState(() => depositImpl(f));
}

export async function setSubstitution(f: FormData) {
  return withState(() => setSubstitutionImpl(f));
}

export async function endSubstitution() {
  return withState(() => endSubstitutionImpl());
}

export async function requestBreakGlass(f: FormData) {
  return withState(() => requestBreakGlassImpl(f));
}
