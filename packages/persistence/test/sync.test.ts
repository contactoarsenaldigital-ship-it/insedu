import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { StateSync, type SqlPool } from "../src/index";

const MIGRATION = readFileSync(resolve(__dirname, "../../../supabase/main/migrations/20261016000100_demo_state.sql"), "utf8");

function pglitePool(db: PGlite): SqlPool {
  return {
    query: (t, p) => db.query(t, p) as never,
    transaction: (fn) => db.transaction((tx) => fn({ query: (t, p) => tx.query(t, p) as never })),
  };
}

type Item = { id: string; value: number };

/** Simula una instancia del servidor con su propio estado en memoria. */
function instance(pool: SqlPool, seeds: { count: number }) {
  let items: Item[] = [];
  const sync = new StateSync(pool, {
    tenantId: "t1",
    collections: () => [{ name: "items", get: () => items, set: (xs) => (items = xs as Item[]), key: (i) => (i as Item).id }],
    seed: () => {
      seeds.count++;
      items = Array.from({ length: 1500 }, (_, i) => ({ id: `i${i}`, value: i }));
    },
    reset: () => (items = []),
  });
  return { sync, get items() { return items; } };
}

let db: PGlite;
let pool: SqlPool;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(MIGRATION);
  pool = pglitePool(db);
});

describe("sincronización entre instancias", () => {
  it("siembra una sola vez aunque dos instancias arranquen juntas", async () => {
    const seeds = { count: 0 };
    const a = instance(pool, seeds);
    const b = instance(pool, seeds);
    await Promise.all([a.sync.sync(), b.sync.sync()]);
    expect(seeds.count).toBe(1);
    expect(a.items).toHaveLength(1500);
    expect(b.items).toHaveLength(1500);
  });

  it("lo que escribe una instancia lo ve la otra", async () => {
    const seeds = { count: 0 };
    const a = instance(pool, seeds);
    const b = instance(pool, seeds);
    await a.sync.sync();
    await b.sync.sync();
    a.items.find((i) => i.id === "i7")!.value = 700;
    a.items.push({ id: "nuevo", value: 1 });
    expect(await a.sync.flush()).toBe(2); // solo lo modificado
    await b.sync.sync();
    expect(b.items.find((i) => i.id === "i7")!.value).toBe(700);
    expect(b.items.at(-1)!.id).toBe("nuevo"); // conserva el orden de inserción
  });

  it("lo que se quita de memoria también se borra de la base", async () => {
    const seeds = { count: 0 };
    const a = instance(pool, seeds);
    await a.sync.sync();
    const i = a.items.findIndex((x) => x.id === "i3");
    a.items.splice(i, 1, { id: "i3-nuevo", value: 3 }); // reemplazo con otra clave
    expect(await a.sync.flush()).toBe(2); // una inserción y un borrado
    const fresh = instance(pool, seeds);
    await fresh.sync.sync();
    expect(fresh.items.some((x) => x.id === "i3")).toBe(false);
    expect(fresh.items.some((x) => x.id === "i3-nuevo")).toBe(true);
    expect(fresh.items).toHaveLength(1500);
  });

  it("no borra lo que agregó otra instancia y esta aún no carga", async () => {
    const seeds = { count: 0 };
    const a = instance(pool, seeds);
    const b = instance(pool, seeds);
    await a.sync.sync();
    await b.sync.sync();
    b.items.push({ id: "de-b", value: 1 });
    await b.sync.flush();
    a.items[0]!.value = -1; // a escribe sin haber recargado
    await a.sync.flush();
    const fresh = instance(pool, seeds);
    await fresh.sync.sync();
    expect(fresh.items.some((x) => x.id === "de-b")).toBe(true);
  });

  it("sin cambios no escribe ni sube la revisión", async () => {
    const a = instance(pool, { count: 0 });
    await a.sync.sync();
    expect(await a.sync.flush()).toBe(0);
    const { rows } = await pool.query<{ rev: string }>("select rev from demo.revisions");
    expect(Number(rows[0]!.rev)).toBe(1);
  });

  it("escrituras cruzadas: cada instancia conserva lo de la otra", async () => {
    const seeds = { count: 0 };
    const a = instance(pool, seeds);
    const b = instance(pool, seeds);
    await a.sync.sync();
    await b.sync.sync();
    a.items.find((i) => i.id === "i1")!.value = 111;
    b.items.find((i) => i.id === "i2")!.value = 222;
    await a.sync.flush();
    await b.sync.flush(); // b no tenía lo de a: debe quedar marcada para recargar
    await b.sync.sync();
    await a.sync.sync();
    for (const x of [a, b]) {
      expect(x.items.find((i) => i.id === "i1")!.value).toBe(111);
      expect(x.items.find((i) => i.id === "i2")!.value).toBe(222);
    }
  });

  it("una instancia nueva (reinicio) recupera todo desde la base", async () => {
    const seeds = { count: 0 };
    const a = instance(pool, seeds);
    await a.sync.sync();
    a.items.push({ id: "persistente", value: 42 });
    await a.sync.flush();
    const fresh = instance(pool, seeds);
    await fresh.sync.sync();
    expect(fresh.items.some((i) => i.id === "persistente")).toBe(true);
    expect(seeds.count).toBe(1);
  });

  it("reiniciar la demostración vuelve a sembrar", async () => {
    const seeds = { count: 0 };
    const a = instance(pool, seeds);
    await a.sync.sync();
    await a.sync.resetDatabase();
    await a.sync.sync();
    expect(seeds.count).toBe(2);
  });

  it("sin base de datos funciona en memoria", async () => {
    const seeds = { count: 0 };
    const m = instance(null as unknown as SqlPool, seeds);
    const mem = new StateSync(null, { tenantId: "t", collections: () => [], seed: () => void seeds.count++, reset: () => {} });
    await mem.sync();
    await mem.sync();
    expect(seeds.count).toBe(1);
    expect(await mem.flush()).toBe(0);
    void m;
  });
});
