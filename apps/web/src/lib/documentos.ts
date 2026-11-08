import "server-only";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import type { DocumentOwnerKind, StoredDocument } from "@insedu/domain";
import type { SqlPool } from "@insedu/persistence";
import { studentById } from "./demo";
import { demoPdf, isDemoFile } from "./demo-ede";
import { canManageEnrollment } from "./matricula";
import { canRegisterExits } from "./salidas";
import type { Session } from "./session";
import { mainPool, TENANT_ID } from "./state";
import { canManageDeliveries, canManageInstitutional, canSeeRequest } from "./entregas";
import { canRegisterMeeting, canSeeMeeting, meetingById } from "./entrevistas";
import { deliveriesState, documentsState, exitsState, subsidyState } from "./store";
import { canManageSubsidy, canReadAllSubsidy } from "./subvenciones";

/**
 * Documentos adjuntos. La ficha vive en el estado (colección libro.documents); el contenido va
 * cifrado con AES-256-GCM en demo.files y solo se lee al descargar.
 *
 * Llave: FILES_MASTER_KEY, o derivada de VAULT_MASTER_KEY con otro contexto. Sin base de datos
 * (desarrollo local) se usa una llave aleatoria por proceso y el contenido vive en memoria.
 */

export class DocumentStoreError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const G = globalThis as any;

function fileKey(): Buffer {
  const own = process.env.FILES_MASTER_KEY;
  const vault = process.env.VAULT_MASTER_KEY;
  const master = own ? Buffer.from(own, "base64") : vault ? Buffer.from(vault, "base64") : null;
  if (master && master.length === 32) return Buffer.from(hkdfSync("sha256", master, Buffer.from("insedu-files"), `tenant:${TENANT_ID}`, 32));
  if (mainPool()) throw new DocumentStoreError("Falta configurar FILES_MASTER_KEY o VAULT_MASTER_KEY (32 bytes en base64) para guardar documentos.");
  return (G.__insedu_file_key ??= randomBytes(32));
}

const aad = (id: string) => Buffer.from(`insedu-file:${TENANT_ID}:${id}`);

function encrypt(id: string, plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", fileKey(), iv);
  c.setAAD(aad(id));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

function decrypt(id: string, blob: Buffer): Buffer {
  const d = createDecipheriv("aes-256-gcm", fileKey(), blob.subarray(0, 12));
  d.setAAD(aad(id));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

const memory = (): Map<string, Buffer> => (G.__insedu_blobs ??= new Map());

const MISSING_TABLE = "Falta aplicar en Supabase la migración 20261107000100_demo_files.sql (ver docs/DESPLIEGUE.md).";

async function withDb<T>(db: SqlPool, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") throw new DocumentStoreError(MISSING_TABLE);
    throw e;
  }
}

export async function putBlob(id: string, plain: Buffer) {
  const sealed = encrypt(id, plain);
  const db = mainPool();
  if (!db) return void memory().set(id, sealed);
  await withDb(db, () => db.query("insert into demo.files (tenant_id, id, content) values ($1, $2, $3)", [TENANT_ID, id, sealed]));
}

export async function getBlob(id: string): Promise<Buffer | null> {
  if (isDemoFile(id)) {
    const demo = documentsState().find((d) => d.id === id);
    return demo ? demoPdf(demo.label) : null;
  }
  const db = mainPool();
  const sealed = db
    ? await withDb(db, async () => (await db.query<{ content: Buffer }>("select content from demo.files where tenant_id = $1 and id = $2", [TENANT_ID, id])).rows[0]?.content ?? null)
    : memory().get(id) ?? null;
  return sealed ? decrypt(id, sealed) : null;
}

export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Al reiniciar la demostración se borran también los contenidos. */
export async function clearBlobs() {
  const db = mainPool();
  if (!db) return void memory().clear();
  await db.query("delete from demo.files where tenant_id = $1", [TENANT_ID]).catch(() => undefined);
}

// ───────────── A qué registro pertenece y quién puede verlo ─────────────

type Owner = { courseId?: string; back: string };

/** Resuelve el registro dueño del documento. null si no existe. */
export function ownerOf(kind: DocumentOwnerKind, id: string): Owner | null {
  if (kind === "matricula") {
    const st = studentById(id);
    return st ? { courseId: st.courseId, back: `/matricula/${id}` } : null;
  }
  if (kind === "salida") {
    const e = exitsState().exits.find((x) => x.id === id);
    return e ? { courseId: e.courseId, back: `/salidas/${e.studentId}` } : null;
  }
  if (kind === "entrega") {
    const r = deliveriesState().requests.find((x) => x.id === id);
    return r ? { courseId: r.courseId, back: `/entregas/${id}` } : null;
  }
  if (kind === "institucional") return deliveriesState().institutional.some((x) => x.id === id) ? { back: "/entregas" } : null;
  if (kind === "entrevista") {
    const m = meetingById(id);
    return m ? { courseId: m.courseId, back: `/entrevistas/${id}` } : null;
  }
  const c = subsidyState().corrections.find((x) => x.id === id);
  return c ? { courseId: c.courseId, back: `/subvenciones/${c.courseId}?mes=${c.date.slice(0, 7)}` } : null;
}

export function canUploadDocument(s: Session, kind: DocumentOwnerKind, ownerId: string) {
  if (kind === "entrevista") {
    const m = meetingById(ownerId);
    return !!m && canRegisterMeeting(s, m.courseId);
  }
  if (kind === "matricula") return canManageEnrollment(s);
  if (kind === "salida") return canRegisterExits(s);
  if (kind === "entrega") return canManageDeliveries(s);
  if (kind === "institucional") return canManageInstitutional(s);
  return canManageSubsidy(s);
}

/** Lectura por registro: el apoderado o estudiante ve lo que se le entregó; los instrumentos, toda la comunidad. */
export function canReadDocument(s: Session, kind: DocumentOwnerKind, ownerId: string) {
  if (kind === "subvencion") return canReadAllSubsidy(s);
  if (kind === "institucional") return true;
  if (kind === "entrega") {
    const r = deliveriesState().requests.find((x) => x.id === ownerId);
    return !!r && canSeeRequest(s, r);
  }
  if (kind === "entrevista") {
    const m = meetingById(ownerId);
    return !!m && canSeeMeeting(s, m);
  }
  return canUploadDocument(s, kind, ownerId);
}

export const documentsOf = (kind: DocumentOwnerKind, ownerId: string): StoredDocument[] =>
  documentsState().filter((d) => d.ownerKind === kind && d.ownerId === ownerId).sort((a, b) => a.at.localeCompare(b.at));
