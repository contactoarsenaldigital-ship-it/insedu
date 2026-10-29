"use server";
import { withState } from "@/lib/state";
import { redirect } from "next/navigation";
import { verifyTotp } from "@insedu/domain/server";
import { accountById, audit, canResend, checkCode, issueCode } from "@/lib/accounts";
import { getSession, markStrongAuth, verifyMfaCode } from "@/lib/session";

const safeNext = (n: string) => (n.startsWith("/") && !n.startsWith("//") ? n : "/");

async function verifyImpl(form: FormData) {
  const next = safeNext(String(form.get("next") ?? "/"));
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  const a = session.accountId ? accountById(session.accountId) : undefined;
  // Cuentas: su propio segundo factor. Usuarios de demostración: el código rotulado en pantalla.
  const ok = a?.mfa
    ? a.mfa.method === "app"
      ? !!a.mfa.totpSecret && /^\d{6}$/.test(code) && verifyTotp(a.mfa.totpSecret, code)
      : checkCode(a.id, "ingreso", code) === "ok"
    : verifyMfaCode(session.person.id, code);
  if (!ok) {
    if (a) audit(a.id, "Verificación fallida", "Código incorrecto al confirmar identidad");
    redirect(`/verificar?next=${encodeURIComponent(next)}&error=1`);
  }
  await markStrongAuth(session.person.id);
  redirect(next);
}

async function sendImpl(form: FormData) {
  const next = safeNext(String(form.get("next") ?? "/"));
  const session = await getSession();
  const a = session?.accountId ? accountById(session.accountId) : undefined;
  if (!a || a.mfa?.method !== "correo") redirect(`/verificar?next=${encodeURIComponent(next)}`);
  if (!canResend(a.id, "ingreso")) redirect(`/verificar?next=${encodeURIComponent(next)}&error=espera`);
  issueCode(a.id, "ingreso", a.email);
  redirect(`/verificar?next=${encodeURIComponent(next)}&enviado=1`);
}

// Cada acción sincroniza el estado antes de ejecutarse y guarda los cambios al terminar.
export async function verify(form: FormData) {
  return withState(() => verifyImpl(form));
}

export async function sendVerifyCode(form: FormData) {
  return withState(() => sendImpl(form));
}
