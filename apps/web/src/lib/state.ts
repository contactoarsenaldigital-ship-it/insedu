import "server-only";
import type { SyntheticSchool } from "@insedu/domain";
import { VAULT_COLLECTIONS } from "@insedu/domain/server";
import { pgPool, StateSync, type Collection, type SqlPool } from "@insedu/persistence";
import { generateDemoSchool } from "./demo";
import { initMessages } from "./messages";
import { initRewards } from "./rewards";
import { initStore } from "./store";
import { seedVault, vault } from "./vault";

/**
 * Estado compartido de la Etapa 1.
 *
 * - Sin DATABASE_URL: todo vive en memoria (desarrollo local, como hasta ahora).
 * - Con DATABASE_URL: el estado se sincroniza con PostgreSQL (Supabase), de modo que todas las
 *   instancias de Vercel ven lo mismo y nada se pierde al reiniciar.
 * - La bóveda se sincroniza con OTRA base (VAULT_DATABASE_URL), y solo guarda contenido cifrado.
 *
 * Uso: las páginas llaman `await readState()` al comenzar; las acciones envuelven su cuerpo en
 * `withState(...)`, que sincroniza antes y guarda los cambios al terminar (incluso si redirige).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const G = globalThis as any;
const TENANT = "00000000-0000-7000-8000-000000000001";

function emptySchool(): SyntheticSchool {
  return { tenantId: TENANT, name: "", rbd: "", timeZone: "America/Santiago", courses: [], students: [], attendance: [], grades: [], conduct: [], health: [], schoolDays: [], cutoff: "" };
}

const byId = (x: unknown) => (x as { id: string }).id;

function arrayOf<T>(name: string, holder: () => Record<string, unknown>, field: string, key: (x: unknown) => string = byId): Collection {
  return { name, key, get: () => (holder()[field] as T[]) ?? [], set: (items) => void (holder()[field] = items) };
}

function mainCollections(): Collection[] {
  const school = () => G.__insedu_school as Record<string, unknown>;
  const store = () => G.__insedu_store as Record<string, unknown>;
  const rewards = () => G.__insedu_rewards as Record<string, unknown>;
  const msgs = () => G.__insedu_msgs as Record<string, unknown>;
  return [
    {
      name: "school.meta",
      key: () => "meta",
      get: () => {
        const s = G.__insedu_school as SyntheticSchool;
        return [{ tenantId: s.tenantId, name: s.name, rbd: s.rbd, timeZone: s.timeZone, schoolDays: s.schoolDays, cutoff: s.cutoff }];
      },
      set: (items) => items[0] && Object.assign(G.__insedu_school, items[0]),
    },
    ...["courses", "students", "attendance", "grades", "conduct", "health"].map((f) => arrayOf(`school.${f}`, school, f)),
    ...["subjects", "evaluations", "lessons", "corrections"].map((f) => arrayOf(`libro.${f}`, store, f)),
    ...["ledger", "rewards", "redemptions", "goals"].map((f) => arrayOf(`refuerzos.${f}`, rewards, f)),
    ...["announcements", "threads"].map((f) => arrayOf(`comunicacion.${f}`, msgs, f)),
    { name: "salvaguarda.instrucciones", key: byId, get: () => G.__insedu_instr ?? [], set: (items) => void (G.__insedu_instr = items) },
    {
      name: "salud.fichas",
      key: (x) => (x as { studentId: string }).studentId,
      get: () => [...((G.__insedu_health as Map<string, unknown>) ?? new Map()).values()],
      set: (items) => void (G.__insedu_health = new Map(items.map((p) => [(p as { studentId: string }).studentId, p]))),
    },
  ];
}

function resetMain() {
  G.__insedu_school = emptySchool();
  G.__insedu_store = { subjects: [], evaluations: [], lessons: [], corrections: [] };
  G.__insedu_rewards = { ledger: [], rewards: [], redemptions: [], goals: [] };
  G.__insedu_msgs = { announcements: [], threads: [] };
  G.__insedu_instr = [];
  G.__insedu_health = new Map();
}

function seedMain() {
  G.__insedu_school = generateDemoSchool(); // hasta el último día hábil anterior al reinicio
  G.__insedu_store = initStore(); // agrupa notas en evaluaciones (usa el colegio recién generado)
  G.__insedu_rewards = initRewards();
  G.__insedu_msgs = initMessages();
  G.__insedu_instr = [];
  G.__insedu_health = new Map();
}

function vaultCollections(): Collection[] {
  const store = vault().store;
  return VAULT_COLLECTIONS.map((kind) => ({
    name: `boveda.${kind}`,
    key: kind === "assignments" ? (x: unknown) => (x as { tenantId: string }).tenantId : byId,
    get: () => store.getAll(kind),
    set: (items: unknown[]) => store.setAll(kind, items),
  }));
}

function resetVault() {
  for (const kind of VAULT_COLLECTIONS) vault().store.setAll(kind, []);
}

type Syncs = { main: StateSync; vault: StateSync };

function create(): Syncs {
  const mainUrl = process.env.DATABASE_URL;
  const vaultUrl = process.env.VAULT_DATABASE_URL;
  if (mainUrl && !vaultUrl) {
    throw new Error("Con DATABASE_URL también debe configurar VAULT_DATABASE_URL (proyecto Supabase separado para la bóveda)");
  }
  const mainDb: SqlPool | null = mainUrl ? pgPool(mainUrl) : null;
  const vaultDb: SqlPool | null = vaultUrl ? pgPool(vaultUrl, 2) : null;
  return {
    main: new StateSync(mainDb, { tenantId: TENANT, collections: mainCollections, seed: seedMain, reset: resetMain }),
    vault: new StateSync(vaultDb, {
      tenantId: TENANT,
      collections: vaultCollections,
      seed: async () => {
        resetVault();
        await seedVault();
      },
      reset: resetVault,
    }),
  };
}

const syncs = (): Syncs => (G.__insedu_syncs ??= create());

/** Pone el estado de esta instancia al día con la base. Llamar al inicio de cada página. */
export async function readState() {
  const s = syncs();
  await s.main.exclusive(async () => {
    await s.main.sync();
    await s.vault.sync();
  });
}

/**
 * Ejecuta una acción con el estado al día y guarda lo modificado al terminar, también cuando la
 * acción termina con redirect (Next.js lo implementa lanzando una excepción).
 */
export async function withState<T>(fn: () => Promise<T>): Promise<T> {
  const s = syncs();
  return s.main.exclusive(async () => {
    await s.main.sync();
    await s.vault.sync();
    try {
      return await fn();
    } finally {
      await s.main.flush();
      await s.vault.flush();
    }
  });
}

/** Guarda cambios hechos durante el render de una página (marcar leído, registrar acceso). */
export async function saveState() {
  const s = syncs();
  await s.main.exclusive(async () => {
    await s.main.flush();
    await s.vault.flush();
  });
}

export const persistenceMode = () => (process.env.DATABASE_URL ? "base de datos" : "memoria");

/** Reinicia la demostración: borra el estado y vuelve a sembrar el colegio ficticio. */
export async function resetDemo() {
  const s = syncs();
  await s.main.exclusive(async () => {
    await s.main.resetDatabase();
    await s.vault.resetDatabase();
    await s.main.sync();
    await s.vault.sync();
  });
}
