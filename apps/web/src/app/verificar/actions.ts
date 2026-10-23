"use server";
import { withState } from "@/lib/state";
import { redirect } from "next/navigation";
import { getSession, markStrongAuth, verifyMfaCode } from "@/lib/session";

const safeNext = (n: string) => (n.startsWith("/") && !n.startsWith("//") ? n : "/");

async function verifyImpl(form: FormData) {
  const next = safeNext(String(form.get("next") ?? "/"));
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  if (!verifyMfaCode(session.person.id, String(form.get("code") ?? ""))) {
    redirect(`/verificar?next=${encodeURIComponent(next)}&error=1`);
  }
  await markStrongAuth(session.person.id);
  redirect(next);
}

// Cada acción sincroniza el estado antes de ejecutarse y guarda los cambios al terminar.
export async function verify(form: FormData) {
  return withState(() => verifyImpl(form));
}
