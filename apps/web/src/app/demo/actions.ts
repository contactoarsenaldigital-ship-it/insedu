"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { readState, resetDemo } from "@/lib/state";

/** Reinicia la demostración (borra lo registrado y vuelve a generar el colegio ficticio). */
export async function reset(f: FormData) {
  await readState();
  const s = await getSession();
  if (!s || !s.person.roles.some((r) => r === "school_admin" || r === "director")) {
    redirect("/demo?error=" + encodeURIComponent("Solo administración o dirección reinician la demostración."));
  }
  if (String(f.get("confirm") ?? "") !== "REINICIAR") {
    redirect("/demo?error=" + encodeURIComponent('Escriba REINICIAR para confirmar.'));
  }
  await resetDemo();
  revalidatePath("/", "layout");
  redirect("/demo?ok=" + encodeURIComponent("Demostración reiniciada: el colegio ficticio volvió a su estado inicial."));
}
