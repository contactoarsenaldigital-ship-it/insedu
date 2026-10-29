"use server";
import { redirect } from "next/navigation";
import { passwordIssues } from "@insedu/domain";
import { digest, hashPassword, newRecoveryCodes, newSalt, newTotpSecret, verifyTotp } from "@insedu/domain/server";
import { accountByActivation, audit, canResend, checkCode, issueCode, personOf, settings } from "@/lib/accounts";
import { markStrongAuth, setSession } from "@/lib/session";
import { withState } from "@/lib/state";

/**
 * Activación de una cuenta con el enlace de un solo uso: 1) la persona crea su clave;
 * 2) configura y confirma su segundo factor. Recién entonces la cuenta queda activa.
 */
function back(t: string, error?: string): never {
  redirect(`/activar?t=${encodeURIComponent(t)}${error ? `&error=${error}` : ""}`);
}

async function passwordImpl(form: FormData) {
  const t = String(form.get("t") ?? "");
  const a = accountByActivation(t);
  if (!a || a.status !== "invitada") redirect("/activar?error=enlace");
  const pw = String(form.get("password") ?? "");
  if (pw !== String(form.get("confirm") ?? "")) back(t, "distintas");
  if (passwordIssues(pw, { name: a.name, email: a.email }, { minLength: settings().passwordMinLength }).length) back(t, "clave");
  a.passwordHash = hashPassword(pw);
  if (a.mfaPlan === "app") a.pendingTotpSecret = newTotpSecret();
  else issueCode(a.id, "activacion", a.email);
  audit(a.id, "Clave creada", "Durante la activación de la cuenta");
  back(t);
}

async function mfaImpl(form: FormData) {
  const t = String(form.get("t") ?? "");
  const a = accountByActivation(t);
  if (!a || a.status !== "invitada" || !a.passwordHash) redirect("/activar?error=enlace");
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  let ok = false;
  if (a.mfaPlan === "app") ok = !!a.pendingTotpSecret && /^\d{6}$/.test(code) && verifyTotp(a.pendingTotpSecret, code);
  else {
    const r = checkCode(a.id, "activacion", code);
    if (r === "vencido" || r === "agotado") {
      issueCode(a.id, "activacion", a.email);
      back(t, "nuevo");
    }
    ok = r === "ok";
  }
  if (!ok) back(t, "codigo");

  const recovery = newRecoveryCodes();
  a.recoveryHashes = recovery.map((c) => {
    const salt = newSalt();
    return { salt, hash: digest(c, salt) };
  });
  a.revealRecovery = recovery; // se muestran una vez en /activar/listo y se borran
  a.mfa = { method: a.mfaPlan, totpSecret: a.mfaPlan === "app" ? a.pendingTotpSecret : undefined, enabledAt: new Date().toISOString() };
  a.pendingTotpSecret = undefined;
  a.activation = undefined; // el enlace deja de servir
  a.status = "activa";
  a.lastLoginAt = new Date().toISOString();
  audit(a.id, "Cuenta activada", a.mfaPlan === "app" ? "Segundo factor: app autenticadora" : "Segundo factor: código por correo");
  await setSession(a.id);
  await markStrongAuth(personOf(a).id);
  redirect("/activar/listo");
}

async function resendImpl(form: FormData) {
  const t = String(form.get("t") ?? "");
  const a = accountByActivation(t);
  if (!a || a.mfaPlan !== "correo") redirect("/activar?error=enlace");
  if (!canResend(a.id, "activacion")) back(t, "espera");
  issueCode(a.id, "activacion", a.email);
  back(t, "nuevo");
}

export async function setActivationPassword(form: FormData) {
  return withState(() => passwordImpl(form));
}

export async function confirmActivationMfa(form: FormData) {
  return withState(() => mfaImpl(form));
}

export async function resendActivationCode(form: FormData) {
  return withState(() => resendImpl(form));
}
