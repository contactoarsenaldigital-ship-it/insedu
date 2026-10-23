"use server";
import { withState } from "@/lib/state";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { uuidv7 } from "@insedu/domain";
import { school } from "@/lib/demo";
import { profile, saveProfile } from "@/lib/health";
import { getSession } from "@/lib/session";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function nurse(studentId: string) {
  const s = await getSession();
  if (!s) redirect(`/ingresar?next=/salud`);
  const back = `/salud?s=${encodeURIComponent(studentId)}`;
  if (!s.person.roles.includes("nurse")) redirect(`${back}&error=${encodeURIComponent("Solo enfermería registra en la ficha de salud.")}`);
  if (!school().students.some((x) => x.id === studentId)) redirect("/salud");
  return { s, back };
}

async function updateProfileImpl(f: FormData) {
  const studentId = str(f, "studentId");
  const { s, back } = await nurse(studentId);
  const num = (k: string) => {
    const v = Number(str(f, k).replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const heightCm = num("heightCm");
  const weightKg = num("weightKg");
  if ((heightCm && (heightCm < 80 || heightCm > 220)) || (weightKg && (weightKg < 15 || weightKg > 200))) {
    redirect(`${back}&error=${encodeURIComponent("Revise estatura (80–220 cm) y peso (15–200 kg).")}`);
  }
  saveProfile({
    ...profile(studentId),
    allergies: str(f, "allergies").slice(0, 300),
    restrictions: str(f, "restrictions").slice(0, 300),
    emergencyContact: str(f, "emergencyContact").slice(0, 200),
    heightCm,
    weightKg,
    updatedAt: new Date().toISOString(),
    updatedBy: s.person.id,
  });
  revalidatePath("/salud");
  redirect(`${back}&ok=${encodeURIComponent("Ficha actualizada.")}`);
}

async function addVisitImpl(f: FormData) {
  const studentId = str(f, "studentId");
  const { s, back } = await nurse(studentId);
  const reason = str(f, "reason");
  if (reason.length < 3) redirect(`${back}&error=${encodeURIComponent("Indique el motivo de la atención.")}`);
  const now = new Date();
  const sentHome = f.get("sentHome") === "1";
  school().health.push({
    id: uuidv7(),
    studentId,
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now),
    at: now.toISOString(),
    reason: reason.slice(0, 200),
    action: str(f, "action").slice(0, 300),
    sentHome,
    nurseId: s.person.id,
  });
  revalidatePath("/salud");
  revalidatePath("/panel/[rol]", "page");
  redirect(
    `${back}&ok=${encodeURIComponent(sentHome ? "Atención registrada. Se notifica al apoderado para el retiro." : "Atención registrada.")}`,
  );
}

// Cada acción sincroniza el estado antes de ejecutarse y guarda los cambios al terminar.
export async function updateProfile(f: FormData) {
  return withState(() => updateProfileImpl(f));
}

export async function addVisit(f: FormData) {
  return withState(() => addVisitImpl(f));
}
