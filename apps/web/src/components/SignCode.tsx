import type { Session } from "@/lib/session";
import { DemoCode } from "./DemoCode";

/** Campo del código del verificador para firmar un registro al guardarlo. */
export function SignCode({ session, id, note }: { session: Session; id: string; note: string }) {
  return (
    <>
      <p className="muted">{note}</p>
      <DemoCode session={session} />
      <div className="field" style={{ maxWidth: 220 }}>
        <label htmlFor={id}>Código de 6 dígitos de su verificador</label>
        <input id={id} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
      </div>
    </>
  );
}
