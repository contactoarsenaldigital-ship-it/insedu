import "server-only";
import { verifyMineducOtp, verifyTotp, totp } from "@insedu/domain/server";
import type { LessonSignature } from "@insedu/domain";
import { accountById, showDemoSecrets } from "./accounts";
import { mfaCode, verifyMfaCode, type Session } from "./session";

/**
 * Firma del libro de clases con verificador de identidad (Circular de registros, 6.2.b.2).
 * - «mineduc»: valida el código en el servicio oficial; exige una cuenta con RUN. Por omisión con datos reales.
 * - «interno»: solo maqueta; valida con el segundo factor de INSEDU. No sirve ante fiscalización.
 */
const mode = () => (process.env.LCD_VERIFIER ?? (process.env.INSEDU_DATA_MODE === "real" ? "mineduc" : "interno")) === "mineduc" ? "mineduc" : "interno";

export type SignResult = { ok: true; signature: LessonSignature } | { ok: false; error: string };

export async function verifySignature(session: Session, code: string): Promise<SignResult> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return { ok: false, error: "Escriba el código de 6 dígitos de su verificador." };
  const account = session.accountId ? accountById(session.accountId) : undefined;
  const at = new Date();
  const signature = (method: LessonSignature["method"]): SignResult => ({
    ok: true,
    signature: { by: session.person.id, at: at.toISOString(), method, rut: account?.rut },
  });

  if (mode() === "mineduc") {
    if (!account) return { ok: false, error: "Para firmar debe ingresar con su cuenta personal, que tiene su RUN registrado." };
    const r = await verifyMineducOtp({ rut: account.rut, otp: clean, at });
    if (r === "valido") return signature("mineduc");
    if (r === "sin_servicio") return { ok: false, error: "El servicio del Mineduc no respondió, así que no se pudo firmar. La clase queda como borrador: intente más tarde." };
    return { ok: false, error: "El código no es válido. Revise su app autenticadora vinculada en tramites.mineduc.cl." };
  }

  const valid = account?.mfa?.method === "app" && account.mfa.totpSecret ? verifyTotp(account.mfa.totpSecret, clean) : verifyMfaCode(session.person.id, clean);
  return valid ? signature("interno") : { ok: false, error: "El código no es correcto o venció. Intente con el código vigente." };
}

/** Solo maqueta: código vigente para mostrarlo rotulado en pantalla. */
export function demoSignCode(session: Session): string | undefined {
  if (!showDemoSecrets() || mode() === "mineduc") return undefined;
  const account = session.accountId ? accountById(session.accountId) : undefined;
  return account?.mfa?.method === "app" && account.mfa.totpSecret ? totp(account.mfa.totpSecret) : mfaCode(session.person.id);
}
