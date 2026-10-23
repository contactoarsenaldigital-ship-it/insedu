/**
 * Cifrado de sobre (envelope encryption) para la bóveda de Salvaguarda. SOLO SERVIDOR.
 *
 * - Llave por establecimiento (KEK): en Etapa 1 se deriva con HKDF desde VAULT_MASTER_KEY;
 *   en Etapa 2 la provee Cloud KMS (una llave por colegio) mediante el mismo contrato KeyProvider.
 * - Cada registro usa una llave de datos aleatoria (DEK) cifrada con la KEK.
 * - AES-256-GCM con datos asociados (tenant + id del registro) para que un ciphertext no
 *   pueda moverse a otro colegio u otro registro sin que falle la verificación.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export interface KeyProvider {
  /** Devuelve la KEK de 32 bytes del establecimiento. */
  tenantKey(tenantId: string): Promise<Buffer>;
  readonly name: string;
}

/** Etapa 1: derivación local desde una llave maestra (variable de entorno). */
export class HkdfKeyProvider implements KeyProvider {
  readonly name = "hkdf-local";
  private readonly master: Buffer;
  constructor(masterKeyBase64: string) {
    const m = Buffer.from(masterKeyBase64, "base64");
    if (m.length !== 32) throw new Error("VAULT_MASTER_KEY debe tener 32 bytes en base64");
    this.master = m;
  }
  async tenantKey(tenantId: string): Promise<Buffer> {
    return Buffer.from(hkdfSync("sha256", this.master, Buffer.from("insedu-vault"), `tenant:${tenantId}`, 32));
  }
}

export type SealedRecord = {
  v: 1;
  kp: string; // proveedor de llaves usado
  wrappedDek: string; // base64: iv(12) | tag(16) | ct
  payload: string; // base64: iv(12) | tag(16) | ct
};

function gcmEncrypt(key: Buffer, plain: Buffer, aad: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

function gcmDecrypt(key: Buffer, blob: Buffer, aad: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAAD(aad);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

const aadFor = (tenantId: string, recordId: string) => Buffer.from(`insedu:${tenantId}:${recordId}`);

export async function seal(
  kp: KeyProvider,
  tenantId: string,
  recordId: string,
  content: unknown,
): Promise<SealedRecord> {
  const kek = await kp.tenantKey(tenantId);
  const dek = randomBytes(32);
  const aad = aadFor(tenantId, recordId);
  return {
    v: 1,
    kp: kp.name,
    wrappedDek: gcmEncrypt(kek, dek, aad).toString("base64"),
    payload: gcmEncrypt(dek, Buffer.from(JSON.stringify(content), "utf8"), aad).toString("base64"),
  };
}

export async function open<T = unknown>(
  kp: KeyProvider,
  tenantId: string,
  recordId: string,
  sealed: SealedRecord,
): Promise<T> {
  const kek = await kp.tenantKey(tenantId);
  const aad = aadFor(tenantId, recordId);
  const dek = gcmDecrypt(kek, Buffer.from(sealed.wrappedDek, "base64"), aad);
  const plain = gcmDecrypt(dek, Buffer.from(sealed.payload, "base64"), aad);
  return JSON.parse(plain.toString("utf8")) as T;
}
