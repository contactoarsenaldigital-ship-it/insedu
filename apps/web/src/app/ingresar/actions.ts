"use server";
import { withState } from "@/lib/state";
import { redirect } from "next/navigation";
import { loginPeople } from "@/lib/store";
import { clearSession, setSession } from "@/lib/session";

async function loginImpl(form: FormData) {
  const id = String(form.get("userId") ?? "");
  if (!loginPeople().some((p) => p.id === id)) redirect("/ingresar?error=1");
  await setSession(id);
  const person = loginPeople().find((p) => p.id === id)!;
  const home = person.roles.includes("student") || person.roles.includes("guardian_academic") ? "/refuerzos" : "/libro";
  const raw = String(form.get("next") ?? "");
  const next = raw && raw !== "/libro" ? raw : home;
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : home);
}

async function logoutImpl() {
  await clearSession();
  redirect("/ingresar");
}

// Cada acción sincroniza el estado antes de ejecutarse y guarda los cambios al terminar.
export async function login(form: FormData) {
  return withState(() => loginImpl(form));
}

export async function logout() {
  return withState(() => logoutImpl());
}
