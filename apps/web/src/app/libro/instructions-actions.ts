"use server";
import { withState } from "@/lib/state";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acknowledge } from "@/lib/instructions";
import { getSession } from "@/lib/session";

async function acknowledgeInstructionImpl(f: FormData) {
  const s = await getSession();
  if (!s) redirect("/ingresar?next=/libro");
  acknowledge(String(f.get("id") ?? ""), s.person.id);
  revalidatePath("/libro");
  redirect("/libro");
}

// Cada acción sincroniza el estado antes de ejecutarse y guarda los cambios al terminar.
export async function acknowledgeInstruction(f: FormData) {
  return withState(() => acknowledgeInstructionImpl(f));
}
