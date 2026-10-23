import { redirect } from "next/navigation";
import { getSession, mfaCode } from "@/lib/session";
import { verify } from "./actions";
import { readState } from "@/lib/state";

export const metadata = { title: "Verificación en dos pasos" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  await readState();
  const { next = "/", error } = await searchParams;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  return (
    <main className="wrap" style={{ maxWidth: 520 }}>
      <h1>Verifique su identidad</h1>
      <p>Para abrir información confidencial debe confirmar que es usted. La verificación dura 5 minutos.</p>
      {error && <p className="notice warn" role="alert">Código incorrecto o vencido. Intente con el código actual.</p>}
      <form action={verify} className="card">
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="code">Código de 6 dígitos de su aplicación de autenticación</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus style={{ fontSize: "1.6rem", letterSpacing: ".3em", textAlign: "center" }} />
        </div>
        <button className="btn primary">Verificar</button>
      </form>
      <p className="notice section">
        Demostración: en el producto el código lo genera la aplicación de autenticación del usuario.
        Código vigente para {session.person.name}: <strong style={{ letterSpacing: ".15em" }}>{mfaCode(session.person.id)}</strong> (cambia cada 30 segundos).
      </p>
    </main>
  );
}
