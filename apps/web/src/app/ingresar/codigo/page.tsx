import Link from "next/link";
import { redirect } from "next/navigation";
import { maskEmail } from "@insedu/domain";
import { totp } from "@insedu/domain/server";
import { accountById, demoCodeFor, settings, showDemoSecrets } from "@/lib/accounts";
import { pendingLogin } from "@/lib/session";
import { readState } from "@/lib/state";
import { resendLoginCode, verifyLoginCode } from "../actions";

export const metadata = { title: "Código de verificación" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "1": "El código no es correcto. Revise e intente de nuevo.",
  espera: "Espere un minuto antes de pedir otro código.",
};

export default async function LoginCode({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await readState();
  const sp = await searchParams;
  const pending = await pendingLogin();
  const a = pending ? accountById(pending.accountId) : undefined;
  if (!a?.mfa) redirect("/ingresar?error=vencido");
  const byApp = a.mfa.method === "app";
  // Solo maqueta: el código se muestra rotulado (en el piloto llega al correo o está en la app).
  const demo = showDemoSecrets() ? (byApp ? (a.mfa.totpSecret ? totp(a.mfa.totpSecret) : undefined) : demoCodeFor(a.id, "ingreso")) : undefined;

  return (
    <main className="wrap" style={{ maxWidth: 560 }}>
      <h1>Verificación en dos pasos</h1>
      <p>
        {byApp
          ? "Abra su app autenticadora (Google o Microsoft Authenticator) e ingrese el código de 6 dígitos de INSEDU."
          : `Enviamos un código de 6 dígitos a ${maskEmail(a.email)}. Vence en ${settings().codeMinutes} minutos.`}
      </p>
      {sp.error && <p className="notice warn" role="alert">{ERRORS[sp.error] ?? ERRORS["1"]}</p>}
      {sp.ok && <p className="notice ok" role="status">Enviamos un código nuevo.</p>}
      {demo && <p className="notice">Demostración: {byApp ? "el código vigente de la app es" : "el correo enviado contiene el código"} <strong>{demo}</strong>.</p>}

      <form action={verifyLoginCode} className="card">
        <div className="field">
          <label htmlFor="code">Código de 6 dígitos</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus className="code-input" />
        </div>
        <button className="btn primary">Verificar e ingresar</button>
      </form>

      {!byApp && (
        <form action={resendLoginCode} style={{ marginTop: 12 }}>
          <button className="btn secondary small">Enviar otro código</button>
        </form>
      )}

      <details className="section">
        <summary>¿Perdió su teléfono o no le llega el código? Use un código de recuperación</summary>
        <form action={verifyLoginCode} className="card" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="recovery">Código de recuperación</label>
            <input id="recovery" name="recovery" placeholder="XXXX-XXXX" autoComplete="off" required />
          </div>
          <button className="btn">Ingresar con código de recuperación</button>
          <p className="muted">Cada código sirve una sola vez. Si ya no tiene ninguno, pida a administración que restablezca su acceso.</p>
        </form>
      </details>

      <p className="muted section"><Link href="/ingresar">Volver al ingreso</Link></p>
    </main>
  );
}
