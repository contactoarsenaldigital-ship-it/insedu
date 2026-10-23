import Link from "next/link";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";

export const initialsOf = (name: string) =>
  name.replace(/\(.*?\)/g, "").split(/[\s/]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export async function SessionPill() {
  await readState();
  const s = await getSession();
  if (!s) return <Link href="/ingresar" className="session-pill guest">Ingresar</Link>;
  return (
    <Link href="/ingresar" className="session-pill" title="Cambiar de usuario">
      <span className="initials" aria-hidden="true">{initialsOf(s.person.name)}</span>
      {s.person.name}
    </Link>
  );
}
