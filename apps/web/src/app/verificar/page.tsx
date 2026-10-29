import { redirect } from "next/navigation";
import { maskEmail } from "@insedu/domain";
import { totp } from "@insedu/domain/server";
import { accountById, demoCodeFor, showDemoSecrets } from "@/lib/accounts";
import { getSession, mfaCode } from "@/lib/session";
import { sendVerifyCode, verify } from "./actions";
import { readState } from "@/lib/state";

export const metadata = { title: "Verificación en dos pasos" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "1": "Código incorrecto o vencido. Intente con el código actual.",
  espera: "Espere un minuto antes de pedir otro código.",
};

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; enviado?: string }> }) {
  await readState();
  const { next = "/", error, enviado } = await searchParams;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  const a = session.accountId ? accountById(session.accountId) : undefined;
  const byMail = a?.mfa?.method === "correo";
  const mailCode = byMail ? demoCodeFor(a!.id, "ingreso") : undefined;
  // Solo maqueta: el código vigente se muestra rotulado.
  const demo = !showDemoSecrets() ? undefined
    : !a ? mfaCode(session.person.id)
    : a.mfa?.method === "app" && a.mfa.totpSecret ? totp(a.mfa.totpSecret)
    : mailCode;

  return (
    <main className="wrap" style={{ maxWidth: 520 }}>
      <h1>Verifique su identidad</h1>
      <p>Para abrir información confidencial o cambiar cuentas y parámetros debe confirmar que es usted. La verificación dura 5 minutos.</p>
      {error && <p className="notice warn" role="alert">{ERRORS[error] ?? ERRORS["1"]}</p>}
      {enviado && <p className="notice ok" role="status">Enviamos un código a {maskEmail(a!.email)}.</p>}

      {byMail && !enviado && (
        <form action={sendVerifyCode} className="card" style={{ marginBottom: 16 }}>
          <input type="hidden" name="next" value={next} />
          <p>Le enviaremos un código de 6 dígitos a <strong>{maskEmail(a!.email)}</strong>.</p>
          <button className="btn primary">Enviarme el código</button>
        </form>
      )}

      <form action={verify} className="card">
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="code">{byMail ? "Código de 6 dígitos que llegó a su correo" : "Código de 6 dígitos de su aplicación de autenticación"}</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus={!byMail || !!enviado} className="code-input" />
        </div>
        <button className="btn primary">Verificar</button>
      </form>
      {demo && (
        <p className="notice section">
          Demostración: en el producto el código {byMail ? "llega al correo" : "lo genera la aplicación de autenticación del usuario"}.
          Código vigente para {session.person.name}: <strong style={{ letterSpacing: ".15em" }}>{demo}</strong>{!byMail && " (cambia cada 30 segundos)"}.
        </p>
      )}
    </main>
  );
}
