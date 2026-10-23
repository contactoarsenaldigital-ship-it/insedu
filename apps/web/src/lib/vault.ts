import "server-only";
import { randomBytes } from "node:crypto";
import type { Actor } from "@insedu/domain";
import { HkdfKeyProvider, MemoryVaultStore, VaultService } from "@insedu/domain/server";
import { school } from "./demo";
import type { Session } from "./session";

/**
 * Bóveda de Salvaguarda de la Etapa 1: servicio real (política + cifrado + log).
 * El almacenamiento se sincroniza con su PROPIA base de datos (VAULT_DATABASE_URL, otro
 * proyecto Supabase), separada del resto de los datos. Ver lib/state.ts.
 */
export const TITULAR_ID = "sg-1";
/** Suplente formal designado por el establecimiento (se propone por defecto). */
export const FORMAL_SUBSTITUTE_ID = "sg-2";

type VaultState = { service: VaultService; store: MemoryVaultStore };
const g = globalThis as unknown as { __insedu_vault?: VaultState };

function masterKey(): string {
  const k = process.env.VAULT_MASTER_KEY;
  if (k) return k;
  if (process.env.VAULT_DATABASE_URL) {
    // Con persistencia, todas las instancias deben usar la misma llave o no podrían descifrar.
    throw new Error("Falta VAULT_MASTER_KEY: es obligatoria cuando la bóveda usa base de datos (openssl rand -base64 32)");
  }
  return randomBytes(32).toString("base64"); // solo memoria, una instancia
}

export function vault(): VaultState {
  if (!g.__insedu_vault) {
    const store = new MemoryVaultStore();
    g.__insedu_vault = { store, service: new VaultService(store, new HkdfKeyProvider(masterKey())) };
  }
  return g.__insedu_vault;
}

/** Siembra de la bóveda de demostración (contenido ficticio). */
export async function seedVault() {
  const { store, service: v } = vault();
  const tenantId = school().tenantId;
  store.setAssignment({ tenantId, titularUserId: TITULAR_ID, titularActive: true });
  const titular: Actor = { userId: TITULAR_ID, tenantId, roles: ["safeguarding_lead"], lastStrongAuthAt: new Date().toISOString() };
  const psych: Actor = { userId: "psych-1", tenantId, roles: ["psychologist"] };
  const nurse: Actor = { userId: "nurse-1", tenantId, roles: ["nurse"] };
  const c = await v.openCase(titular, "student-016", "Seguimiento de bienestar", "Entrevista con la estudiante y su apoderada. Se acuerda acompañamiento semanal con orientación.");
  await v.addNote(titular, c.id, "Segunda entrevista: mejora la asistencia. Se mantiene seguimiento.");
  await v.deposit(psych, "student-041", "entrevista", "El estudiante comenta cambios recientes en su grupo familiar y dificultad para dormir. Sugiero evaluación de Salvaguarda.");
  await v.deposit(nurse, "student-066", "derivacion", "Tercera atención en dos semanas por dolor abdominal sin causa aparente. Derivo para evaluación integral.");
}

export async function vaultService() {
  return vault().service;
}

export function actorOf(s: Session): Actor {
  return { userId: s.person.id, tenantId: school().tenantId, roles: s.person.roles, lastStrongAuthAt: s.lastStrongAuthAt };
}
