/**
 * Sincronización de estado entre instancias (Etapa 1, datos ficticios).
 *
 * Cada instancia del servidor mantiene el estado en memoria (rápido, código síncrono) y lo
 * sincroniza con PostgreSQL:
 *  - sync():  al inicio de cada solicitud compara la revisión de la base; si cambió, recarga.
 *  - flush(): al terminar una acción guarda solo los registros modificados y sube la revisión.
 *  - Siembra: si la base está vacía, una sola instancia (bloqueo consultivo) genera y guarda el
 *    colegio ficticio.
 * Concurrencia: última escritura gana por registro; si otra instancia escribió entre medio, la
 * revisión lo revela y la próxima sync() recarga todo.
 */
import pg from "pg";

export interface SqlClient {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export interface SqlPool extends SqlClient {
  transaction<T>(fn: (c: SqlClient) => Promise<T>): Promise<T>;
}

/** Una colección del estado en memoria: cómo leerla, reemplazarla y obtener la clave de cada registro. */
export type Collection<T = unknown> = {
  name: string;
  get: () => T[];
  set: (items: T[]) => void;
  key: (item: T) => string;
};

export type SyncOptions = {
  tenantId: string;
  /** Registra las colecciones (se llama después de seed() o en cada carga). */
  collections: () => Collection[];
  /** Genera el estado inicial en memoria (colegio ficticio). */
  seed: () => Promise<void> | void;
  /** Limpia el estado en memoria antes de cargar desde la base. */
  reset: () => void;
};

export class StateSync {
  private rev = -1;
  private saved = new Map<string, string>(); // "colección\u0000id" → JSON guardado
  private lock: Promise<unknown> = Promise.resolve();
  private initialized = false;

  constructor(private readonly db: SqlPool | null, private readonly opts: SyncOptions) {}

  get persistent() {
    return this.db !== null;
  }

  /** Ejecuta en exclusión mutua dentro de la instancia (evita recargar en medio de una acción). */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  private k = (c: string, id: string) => `${c}\u0000${id}`;

  /** Deja el estado en memoria al día con la base. */
  async sync(): Promise<void> {
    if (!this.db) {
      if (!this.initialized) {
        await this.opts.seed();
        this.initialized = true;
      }
      return;
    }
    const { rows } = await this.db.query<{ rev: string }>("select rev from demo.revisions where tenant_id = $1", [this.opts.tenantId]);
    if (!rows.length) {
      await this.seedDatabase();
      return;
    }
    const dbRev = Number(rows[0]!.rev);
    if (dbRev !== this.rev || !this.initialized) await this.load();
  }

  private async seedDatabase() {
    const db = this.db!;
    await db.transaction(async (c) => {
      await c.query("select pg_advisory_xact_lock(hashtext($1))", [`insedu-seed:${this.opts.tenantId}`]);
      const exists = await c.query("select 1 from demo.revisions where tenant_id = $1", [this.opts.tenantId]);
      if (exists.rows.length) return; // otra instancia sembró mientras esperábamos
      this.opts.reset();
      await this.opts.seed();
      this.saved.clear();
      await this.writeChanged(c, true);
      await c.query("insert into demo.revisions (tenant_id, rev) values ($1, 1)", [this.opts.tenantId]);
    });
    await this.load();
  }

  private async load() {
    const db = this.db!;
    const [docs, revRow] = await Promise.all([
      db.query<{ collection: string; id: string; data: unknown }>(
        "select collection, id, data from demo.documents where tenant_id = $1 order by collection, seq",
        [this.opts.tenantId],
      ),
      db.query<{ rev: string }>("select rev from demo.revisions where tenant_id = $1", [this.opts.tenantId]),
    ]);
    const byCollection = new Map<string, unknown[]>();
    this.saved.clear();
    for (const d of docs.rows) {
      if (!byCollection.has(d.collection)) byCollection.set(d.collection, []);
      byCollection.get(d.collection)!.push(d.data);
      this.saved.set(this.k(d.collection, d.id), JSON.stringify(d.data));
    }
    this.opts.reset();
    for (const col of this.opts.collections()) col.set((byCollection.get(col.name) ?? []) as never[]);
    this.rev = Number(revRow.rows[0]?.rev ?? 0);
    this.initialized = true;
  }

  /** Guarda los registros nuevos o modificados desde la última carga o guardado. */
  async flush(): Promise<number> {
    if (!this.db) return 0;
    let written = 0;
    await this.db.transaction(async (c) => {
      written = await this.writeChanged(c, false);
      if (!written) return;
      const r = await c.query<{ rev: string }>(
        "update demo.revisions set rev = rev + 1, updated_at = now() where tenant_id = $1 returning rev",
        [this.opts.tenantId],
      );
      const newRev = Number(r.rows[0]!.rev);
      // Si otra instancia escribió entre medio, forzamos recarga en la próxima sync().
      this.rev = newRev === this.rev + 1 ? newRev : -1;
    });
    return written;
  }

  private async writeChanged(c: SqlClient, all: boolean): Promise<number> {
    const rows: { collection: string; id: string; json: string }[] = [];
    for (const col of this.opts.collections()) {
      for (const item of col.get()) {
        const id = col.key(item);
        const json = JSON.stringify(item);
        const k = this.k(col.name, id);
        if (all || this.saved.get(k) !== json) rows.push({ collection: col.name, id, json });
      }
    }
    // Inserción por lotes con unnest para no enviar miles de sentencias.
    for (let i = 0; i < rows.length; i += 1000) {
      const batch = rows.slice(i, i + 1000);
      await c.query(
        `insert into demo.documents (tenant_id, collection, id, data)
         select $1, x.collection, x.id, x.data::jsonb
         from unnest($2::text[], $3::text[], $4::text[]) as x(collection, id, data)
         on conflict (tenant_id, collection, id) do update set data = excluded.data, updated_at = now()`,
        [this.opts.tenantId, batch.map((r) => r.collection), batch.map((r) => r.id), batch.map((r) => r.json)],
      );
    }
    for (const r of rows) this.saved.set(this.k(r.collection, r.id), r.json);
    return rows.length;
  }

  /** Borra el estado del establecimiento (reiniciar la demostración). */
  async resetDatabase() {
    if (!this.db) {
      this.opts.reset();
      this.initialized = false;
      return;
    }
    await this.db.transaction(async (c) => {
      await c.query("delete from demo.documents where tenant_id = $1", [this.opts.tenantId]);
      await c.query("delete from demo.revisions where tenant_id = $1", [this.opts.tenantId]);
    });
    this.rev = -1;
    this.initialized = false;
  }
}

// ───────────────────────────── Adaptador node-postgres ─────────────────────────────

/** Pool de conexiones para Supabase (pooler en modo transacción, puerto 6543) o PostgreSQL directo. */
export function pgPool(connectionString: string, max = 3): SqlPool {
  const pool = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 10_000,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: false },
  });
  return {
    query: (text, params) => pool.query(text, params as unknown[]) as never,
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const out = await fn({ query: (t, p) => client.query(t, p as unknown[]) as never });
        await client.query("commit");
        return out;
      } catch (e) {
        await client.query("rollback").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
  };
}
