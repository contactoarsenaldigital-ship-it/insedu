"use server";
import { withState } from "@/lib/state";
import { redirect } from "next/navigation";
import { sameDigest, verifyPassword, verifyTotp } from "@insedu/domain/server";
import type { Role } from "@insedu/domain";
import { accountByEmail, accountById, audit, canResend, checkCode, issueCode, personOf, settings } from "@/lib/accounts";
import { loginPeople } from "@/lib/store";
import { clearPendingLogin, clearSession, demoLoginEnabled, markStrongAuth, pendingLogin, setPendingLogin, setSession } from "@/lib/session";

/** Página de inicio según el perfil, salvo que se pida una dirección interna. */
function homeFor(roles: Role[], raw: string) {
  const home = roles.includes("student") || roles.includes("guardian_academic")
    ? "/refuerzos"
    : roles.includes("school_admin") ? "/configuracion"
    : roles.includes("safeguarding_lead") ? "/salvaguarda"
    : roles.includes("nurse") ? "/salud"
    : "/libro";
  const next = raw && raw !== "/" && raw !== "/libro" ? raw : home;
  return next.startsWith("/") && !next.startsWith("//") ? next : home;
}

async function loginImpl(form: FormData) {
  const id = String(form.get("userId") ?? "");
  if (!demoLoginEnabled() || !loginPeople().some((p) => p.id === id)) redirect("/ingresar?error=1");
  await setSession(id);
  const person = loginPeople().find((p) => p.id === id)!;
  redirect(homeFor(person.roles, String(form.get("next") ?? "")));
}

// ───────────── Ingreso con cuenta ─────────────

/** Paso 1: correo y clave. El mensaje de error no revela si la cuenta existe. */
async function passwordImpl(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "");
  function back(error: string): never {
    redirect(`/ingresar?error=${error}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }
  const a = accountByEmail(email);
  const s = settings();
  if (a?.lockedUntil && new Date(a.lockedUntil).getTime() > Date.now()) back("bloqueada");
  if (!a || a.status !== "activa" || !a.passwordHash || !a.mfa || !verifyPassword(password, a.passwordHash)) {
    if (a && a.status === "activa") {
      a.failedLogins++;
      audit(a.id, "Ingreso fallido", `Clave incorrecta (${a.failedLogins} de ${s.maxAttempts})`);
      if (a.failedLogins >= s.maxAttempts) {
        a.lockedUntil = new Date(Date.now() + s.lockMinutes * 60_000).toISOString();
        a.failedLogins = 0;
        audit(a.id, "Cuenta bloqueada", `Bloqueo temporal de ${s.lockMinutes} minutos por intentos fallidos`);
      }
    }
    back("cuenta");
  }
  if (a.mfa.method === "correo") issueCode(a.id, "ingreso", a.email);
  await setPendingLogin(a.id, next);
  redirect("/ingresar/codigo");
}

/** Paso 2: código de 6 dígitos (correo o app) o un código de recuperación. */
async function codeImpl(form: FormData) {
  const pending = await pendingLogin();
  if (!pending) redirect("/ingresar?error=vencido");
  const a = accountById(pending.accountId);
  if (!a || a.status !== "activa" || !a.mfa) redirect("/ingresar?error=cuenta");
  const recovery = String(form.get("recovery") ?? "").trim().toUpperCase();
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  let ok = false;
  let how = "";

  if (recovery) {
    const i = a.recoveryHashes.findIndex((r) => sameDigest(recovery, r.salt, r.hash));
    if (i >= 0) {
      a.recoveryHashes.splice(i, 1); // un solo uso
      ok = true;
      how = `código de recuperación (quedan ${a.recoveryHashes.length})`;
    }
  } else if (a.mfa.method === "app") {
    ok = !!a.mfa.totpSecret && /^\d{6}$/.test(code) && verifyTotp(a.mfa.totpSecret, code);
    how = "app autenticadora";
  } else {
    const r = checkCode(a.id, "ingreso", code);
    if (r === "vencido" || r === "agotado") {
      await clearPendingLogin();
      redirect(`/ingresar?error=${r === "vencido" ? "vencido" : "agotado"}`);
    }
    ok = r === "ok";
    how = "código por correo";
  }

  if (!ok) {
    a.failedLogins++;
    audit(a.id, "Segundo factor incorrecto", how || "código");
    if (a.failedLogins >= settings().maxAttempts) {
      a.lockedUntil = new Date(Date.now() + settings().lockMinutes * 60_000).toISOString();
      a.failedLogins = 0;
      audit(a.id, "Cuenta bloqueada", `Bloqueo temporal de ${settings().lockMinutes} minutos por intentos fallidos`);
      await clearPendingLogin();
      redirect("/ingresar?error=bloqueada");
    }
    redirect("/ingresar/codigo?error=1");
  }

  a.failedLogins = 0;
  a.lastLoginAt = new Date().toISOString();
  audit(a.id, "Ingreso", `Con clave y ${how}`);
  await clearPendingLogin();
  await setSession(a.id);
  const person = personOf(a);
  await markStrongAuth(person.id); // acaba de verificar su segundo factor
  redirect(homeFor(person.roles, pending.next));
}

async function resendImpl() {
  const pending = await pendingLogin();
  const a = pending ? accountById(pending.accountId) : undefined;
  if (!a || a.mfa?.method !== "correo") redirect("/ingresar");
  if (!canResend(a.id, "ingreso")) redirect("/ingresar/codigo?error=espera");
  issueCode(a.id, "ingreso", a.email);
  redirect("/ingresar/codigo?ok=1");
}

async function logoutImpl() {
  await clearSession();
  redirect("/ingresar");
}

// Cada acción sincroniza el estado antes de ejecutarse y guarda los cambios al terminar.
export async function login(form: FormData) {
  return withState(() => loginImpl(form));
}

export async function loginWithPassword(form: FormData) {
  return withState(() => passwordImpl(form));
}

export async function verifyLoginCode(form: FormData) {
  return withState(() => codeImpl(form));
}

export async function resendLoginCode() {
  return withState(() => resendImpl());
}

export async function logout() {
  return withState(() => logoutImpl());
}
