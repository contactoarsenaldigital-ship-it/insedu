/**
 * Secretos de las cuentas. SOLO SERVIDOR.
 *
 * - Claves: scrypt con sal propia; nunca se guarda la clave.
 * - Códigos de 6 dígitos (por correo): aleatorios, se guardan solo como huella, vencen y
 *   admiten pocos intentos.
 * - App autenticadora: TOTP (RFC 6238, HMAC-SHA1, 30 s, 6 dígitos), compatible con Google o
 *   Microsoft Authenticator.
 * - Códigos de recuperación: 10, de un solo uso.
 */
import { createHash, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

// ───────────────────────── Claves ─────────────────────────

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw.normalize("NFC"), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, N, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const got = scryptSync(pw.normalize("NFC"), Buffer.from(salt, "base64"), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// ───────────────────────── Códigos y enlaces ─────────────────────────

/** Código aleatorio de 6 dígitos (generador criptográfico). */
export const randomCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Enlace de un solo uso (activación): 32 bytes aleatorios. */
export const randomToken = () => randomBytes(32).toString("base64url");

/** Huella de un código o enlace, con sal: lo guardado no sirve para entrar. */
export function digest(value: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${value}`).digest("base64url");
}

export function sameDigest(value: string, salt: string, expected: string): boolean {
  const a = Buffer.from(digest(value, salt));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const newSalt = () => randomBytes(12).toString("base64url");

export type Challenge = {
  id: string;
  /** A quién pertenece: una cuenta o una solicitud de acceso. */
  subject: string;
  purpose: "ingreso" | "verificar_correo" | "activacion";
  codeHash: string;
  salt: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
  usedAt?: string;
};

export function newChallenge(id: string, subject: string, purpose: Challenge["purpose"], minutes: number, now = new Date()) {
  const code = randomCode();
  const salt = newSalt();
  const challenge: Challenge = {
    id,
    subject,
    purpose,
    codeHash: digest(code, salt),
    salt,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + minutes * 60_000).toISOString(),
    attempts: 0,
  };
  return { challenge, code };
}

export type ChallengeResult = "ok" | "vencido" | "incorrecto" | "agotado" | "usado";

/** Verifica un código: un solo uso, con vencimiento y número máximo de intentos. Muta el desafío. */
export function useChallenge(ch: Challenge, code: string, maxAttempts: number, now = new Date()): ChallengeResult {
  if (ch.usedAt) return "usado";
  if (now.getTime() > new Date(ch.expiresAt).getTime()) return "vencido";
  if (ch.attempts >= maxAttempts) return "agotado";
  ch.attempts++;
  if (!sameDigest(code.replace(/\s/g, ""), ch.salt, ch.codeHash)) return ch.attempts >= maxAttempts ? "agotado" : "incorrecto";
  ch.usedAt = now.toISOString();
  return "ok";
}

// ───────────────────────── App autenticadora (TOTP) ─────────────────────────

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error("Secreto base32 inválido");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Secreto nuevo para la app autenticadora (160 bits, en base32). */
export const newTotpSecret = () => base32Encode(randomBytes(20));

/** Código TOTP de `digits` dígitos para un instante (RFC 6238). */
export function totp(secretBase32: string, at = Date.now(), digits = 6, step = 30): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / step)));
  const h = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = h[h.length - 1]! & 15;
  const bin = ((h[offset]! & 127) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** Acepta el código del intervalo actual y del anterior y siguiente (desfase de reloj). */
export function verifyTotp(secretBase32: string, code: string, at = Date.now()): boolean {
  const c = code.replace(/\s/g, "");
  return [-1, 0, 1].some((w) => totp(secretBase32, at + w * 30_000) === c);
}

/** Dirección que la app autenticadora lee desde el código QR. */
export function otpauthUri(issuer: string, account: string, secretBase32: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ───────────────────────── Códigos de recuperación ─────────────────────────

/** 10 códigos como «K7QM-2XPA»; se muestran una vez y se guardan solo como huella. */
export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const s = base32Encode(randomBytes(5)).slice(0, 8);
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}
