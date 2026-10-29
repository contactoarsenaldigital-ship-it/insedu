import Link from "next/link";
import type { Role } from "@insedu/domain";
import { loginPeople } from "@/lib/store";
import { demoLoginEnabled, getSession } from "@/lib/session";
import { login, loginWithPassword, logout } from "./actions";
import { readState } from "@/lib/state";
import { Icon } from "@/components/Icon";
import { initialsOf } from "@/components/SessionPill";

export const metadata = { title: "Ingresar" };

const ERRORS: Record<string, string> = {
  cuenta: "Correo o clave incorrectos.",
  bloqueada: "Por seguridad, la cuenta quedó bloqueada unos minutos tras varios intentos fallidos. Intente más tarde o pida ayuda a administración.",
  vencido: "El código venció o la verificación se interrumpió. Ingrese de nuevo su correo y clave.",
  agotado: "Se agotaron los intentos para ese código. Ingrese de nuevo su correo y clave.",
};

const GROUPS: { title: string; roles: Role[] }[] = [
  { title: "Docentes", roles: ["teacher", "head_teacher"] },
  { title: "Dirección y gestión", roles: ["director", "inspector", "school_admin", "gatekeeper"] },
  { title: "Bienestar y protección", roles: ["nurse", "psychologist", "counselor", "social_worker", "safeguarding_lead"] },
  { title: "Estudiantes y familias", roles: ["student", "guardian_academic"] },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  await readState();
  const { next, error } = await searchParams;
  const session = await getSession();
  const people = loginPeople();
  const groupOf = (roles: Role[]) => GROUPS.findIndex((g) => g.roles.some((r) => roles.includes(r)));

  return (
    <main className="auth">
      <aside className="auth-brand">
        <div>
          <span className="brand xl">INS<span>E</span>DU</span>
          <div className="rule" />
          <p>Acompañamiento integral del estudiante: académico, salud integral y convivencia, en una sola plataforma.</p>
        </div>
        <ul>
          <li><Icon name="book" /> El docente registra una sola vez</li>
          <li><Icon name="star" /> Se reconoce el progreso personal</li>
          <li><Icon name="lock" /> Lo confidencial queda en manos de Salvaguarda</li>
        </ul>
      </aside>

      <section className="auth-panel">
        <div className="inner">
          <h1>Acceso usuarios</h1>
          {error && <p className="notice warn" role="alert">{ERRORS[error] ?? "Usuario no válido."}</p>}

          <form action={loginWithPassword} className="card account-login">
            <h2 className="people-group" style={{ margin: 0 }}>Ingresar con su cuenta</h2>
            <input type="hidden" name="next" value={next ?? ""} />
            <div className="field"><label htmlFor="email">Correo</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
            <div className="field"><label htmlFor="password">Clave</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
            <button className="btn primary">Continuar</button>
            <p className="muted">Después le pediremos su código de verificación de 6 dígitos. ¿Aún no tiene cuenta? <Link href="/solicitar-acceso">Solicitar acceso</Link></p>
          </form>

          {demoLoginEnabled() && (
            <p className="notice" style={{ marginTop: 24 }}>
              Demostración: también puede elegir un usuario ficticio, sin clave, para recorrer cada perfil.
            </p>
          )}
          {session && (
            <form action={logout} className="person-row" style={{ marginTop: 16 }}>
              <span className="initials" aria-hidden="true">{initialsOf(session.person.name)}</span>
              <span className="who">
                <span>Sesión actual</span>
                <strong>{session.person.name}</strong>
              </span>
              <button className="btn secondary">Cerrar sesión</button>
            </form>
          )}

          {demoLoginEnabled() && GROUPS.map((g, gi) => {
            const members = people.filter((p) => groupOf(p.roles) === gi);
            if (!members.length) return null;
            return (
              <div key={g.title}>
                <h2 className="people-group">{g.title}</h2>
                <ul className="people">
                  {members.map((p) => (
                    <li key={p.id}>
                      <form action={login} className="person-row">
                        <input type="hidden" name="userId" value={p.id} />
                        <input type="hidden" name="next" value={next ?? ""} />
                        <span className="initials" aria-hidden="true">{initialsOf(p.name)}</span>
                        <span className="who">
                          <strong>{p.name}</strong>
                          <span>{p.description}</span>
                        </span>
                        <button className="btn">Ingresar como {p.name.split(" ")[0]}</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
