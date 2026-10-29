import Link from "next/link";
import QRCode from "qrcode";
import { maskEmail, ROLE_LABEL } from "@insedu/domain";
import { otpauthUri, totp } from "@insedu/domain/server";
import { PasswordField } from "@/components/PasswordField";
import { accountByActivation, demoCodeFor, settings, showDemoSecrets } from "@/lib/accounts";
import { readState } from "@/lib/state";
import { confirmActivationMfa, resendActivationCode, setActivationPassword } from "./actions";

export const metadata = { title: "Activar cuenta" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  distintas: "Las claves no coinciden.",
  clave: "La clave no cumple los requisitos.",
  codigo: "El código no es correcto. Revise e intente de nuevo.",
  nuevo: "Enviamos un código nuevo.",
  espera: "Espere un minuto antes de pedir otro código.",
};

export default async function Activate({ searchParams }: { searchParams: Promise<{ t?: string; error?: string }> }) {
  await readState();
  const { t = "", error } = await searchParams;
  const a = t ? accountByActivation(t) : undefined;
  if (!a || a.status !== "invitada") {
    return (
      <main className="wrap" style={{ maxWidth: 640 }}>
        <h1>Activar cuenta</h1>
        <p className="notice warn">El enlace no es válido o ya venció (dura 48 horas y sirve una sola vez). Pida a administración del establecimiento un enlace nuevo.</p>
        <p><Link href="/ingresar">Ir al ingreso</Link></p>
      </main>
    );
  }
  const step = a.passwordHash ? 2 : 1;
  const qr = step === 2 && a.mfaPlan === "app" && a.pendingTotpSecret
    ? await QRCode.toDataURL(otpauthUri("INSEDU", a.email, a.pendingTotpSecret), { margin: 1, width: 220 })
    : undefined;
  const demo = showDemoSecrets() && step === 2
    ? (a.mfaPlan === "app" ? (a.pendingTotpSecret ? totp(a.pendingTotpSecret) : undefined) : demoCodeFor(a.id, "activacion"))
    : undefined;

  return (
    <main className="wrap" style={{ maxWidth: 640 }}>
      <span className="muted">Paso {step} de 2</span>
      <h1>Hola, {a.name.split(" ")[0]}</h1>
      <p>Su cuenta de INSEDU como <strong>{a.roles.map((r) => ROLE_LABEL[r]).join(" · ")}</strong> está lista para activar.</p>
      {error && <p className={`notice ${error === "nuevo" ? "ok" : "warn"}`} role="alert">{ERRORS[error] ?? "Revise los datos."}</p>}

      {step === 1 && (
        <form action={setActivationPassword} className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Cree su clave</h2>
          <input type="hidden" name="t" value={t} />
          <PasswordField name={a.name} email={a.email} minLength={settings().passwordMinLength} />
          <p className="muted">Use una frase fácil de recordar para usted y difícil de adivinar, por ejemplo tres palabras con números y símbolos. No use la misma clave de otros servicios.</p>
        </form>
      )}

      {step === 2 && (
        <form action={confirmActivationMfa} className="card">
          <h2 style={{ fontSize: "1.2rem" }}>Configure su verificación en dos pasos</h2>
          <input type="hidden" name="t" value={t} />
          {a.mfaPlan === "app" ? (
            <>
              <p>Su perfil requiere una <strong>app autenticadora</strong>. Instale Google Authenticator o Microsoft Authenticator en su teléfono y escanee este código:</p>
              {qr && <img src={qr} alt="Código QR para vincular la app autenticadora con INSEDU" width={220} height={220} className="qr" />}
              <p className="muted">¿No puede escanear? Ingrese esta clave en la app: <code className="secret">{a.pendingTotpSecret?.match(/.{1,4}/g)?.join(" ")}</code></p>
              <p>Luego escriba el código de 6 dígitos que muestra la app.</p>
            </>
          ) : (
            <p>Enviamos un código de 6 dígitos a <strong>{maskEmail(a.email)}</strong>. Escríbalo aquí para confirmar su correo. Cada vez que ingrese le enviaremos un código nuevo.</p>
          )}
          {demo && <p className="notice">Demostración: {a.mfaPlan === "app" ? "el código vigente de la app es" : "el correo enviado contiene el código"} <strong>{demo}</strong>.</p>}
          <div className="field">
            <label htmlFor="code">Código de 6 dígitos</label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="code-input" />
          </div>
          <button className="btn primary">Activar mi cuenta</button>
        </form>
      )}

      {step === 2 && a.mfaPlan === "correo" && (
        <form action={resendActivationCode} style={{ marginTop: 12 }}>
          <input type="hidden" name="t" value={t} />
          <button className="btn secondary small">Enviar otro código</button>
        </form>
      )}
    </main>
  );
}
