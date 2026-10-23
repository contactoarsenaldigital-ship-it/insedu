"use server";
import { withState } from "@/lib/state";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { uuidv7, validateGoal, type GoalMetric } from "@insedu/domain";
import { studentById } from "@/lib/demo";
import { decideRedemption, markDelivered, requestRedemption, rewardsState } from "@/lib/rewards";
import { getSession } from "@/lib/session";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function back(msg: { ok?: string; error?: string }, path = "/refuerzos"): never {
  revalidatePath("/refuerzos");
  const q = new URLSearchParams(Object.entries(msg).filter(([, v]) => v) as [string, string][]);
  redirect(`${path}?${q}`);
}

async function session() {
  const s = await getSession();
  if (!s) redirect("/ingresar?next=/refuerzos");
  return s;
}

/** El estudiante solicita un canje con su propio saldo. */
async function redeemImpl(f: FormData) {
  const s = await session();
  if (!s.person.roles.includes("student")) back({ error: "Solo el estudiante solicita canjes." });
  const st = studentById(s.person.id)!;
  const r = requestRedemption(st.id, st.courseId, str(f, "rewardId"));
  if (Array.isArray(r)) back({ error: r.join(". ") });
  back({ ok: "Solicitud enviada a tu profesor jefe. Tus puntos quedan reservados hasta que la revise." });
}

/** Profesor jefe: aprueba o rechaza canjes de estudiantes de su curso. */
async function approveRedemptionImpl(f: FormData) {
  await decide(f, true);
}

async function rejectRedemptionImpl(f: FormData) {
  await decide(f, false);
}

async function decide(f: FormData, approve: boolean) {
  const s = await session();
  const r = rewardsState().redemptions.find((x) => x.id === str(f, "id"));
  const st = r && studentById(r.studentId);
  if (!r || !st || !s.scope.headOfCourseIds.includes(st.courseId)) back({ error: "Solo el profesor jefe del curso resuelve esta solicitud." });
  const note = str(f, "note");
  if (!approve && note.length < 5) back({ error: "Al rechazar, explique el motivo al estudiante (mínimo 5 caracteres)." });
  const err = decideRedemption(r.id, approve, s.person.id, note || undefined);
  if (err) back({ error: err });
  back({ ok: approve ? "Canje aprobado. Márquelo como entregado cuando corresponda." : "Canje rechazado. Los puntos se devolvieron al estudiante." });
}

async function deliverImpl(f: FormData) {
  const s = await session();
  const r = rewardsState().redemptions.find((x) => x.id === str(f, "id"));
  const st = r && studentById(r.studentId);
  if (!r || !st || !s.scope.headOfCourseIds.includes(st.courseId)) back({ error: "No autorizado." });
  markDelivered(r.id, s.person.id);
  back({ ok: "Recompensa marcada como entregada." });
}

/** Profesor jefe: agrega una recompensa propia de su curso. */
async function addRewardImpl(f: FormData) {
  const s = await session();
  const courseId = str(f, "courseId");
  if (!s.scope.headOfCourseIds.includes(courseId)) back({ error: "Solo el profesor jefe agrega recompensas a su curso." });
  const name = str(f, "name");
  const cost = Number(str(f, "cost"));
  const stockRaw = str(f, "stock");
  const stock = stockRaw ? Number(stockRaw) : null;
  if (name.length < 5 || name.length > 80) back({ error: "Indique un nombre de 5 a 80 caracteres." });
  if (!Number.isInteger(cost) || cost < 5 || cost > 500) back({ error: "El costo debe ser un número entero entre 5 y 500 puntos." });
  if (stock !== null && (!Number.isInteger(stock) || stock < 1 || stock > 1000)) back({ error: "Las unidades deben ser un número entero positivo." });
  rewardsState().rewards.push({ id: uuidv7(), courseId, name, description: str(f, "description").slice(0, 200), cost, stock, active: true });
  back({ ok: `Recompensa "${name}" agregada al catálogo del curso.` });
}

async function toggleRewardImpl(f: FormData) {
  const s = await session();
  const r = rewardsState().rewards.find((x) => x.id === str(f, "id"));
  if (!r || !r.courseId || !s.scope.headOfCourseIds.includes(r.courseId)) back({ error: "Solo puede modificar recompensas de su curso." });
  r.active = !r.active;
  back({ ok: r.active ? "Recompensa activada." : "Recompensa pausada." });
}

/** Profesor jefe: crea una meta cooperativa para su curso. */
async function addGoalImpl(f: FormData) {
  const s = await session();
  const courseId = str(f, "courseId");
  if (!s.scope.headOfCourseIds.includes(courseId)) back({ error: "Solo el profesor jefe crea metas de su curso." });
  const metric = str(f, "metric") as GoalMetric;
  const raw = Number(str(f, "target").replace(",", "."));
  const target = metric === "anotaciones_positivas" ? raw : raw / 100;
  const goal = { courseId, title: str(f, "title"), metric, target, from: str(f, "from"), to: str(f, "to"), reward: str(f, "reward") };
  const issues = validateGoal(goal);
  if (issues.length) back({ error: issues.join(". ") });
  rewardsState().goals.push({ ...goal, id: uuidv7(), createdBy: s.person.id });
  back({ ok: "Meta cooperativa creada. El curso la verá en su panel." });
}

// Cada acción sincroniza el estado antes de ejecutarse y guarda los cambios al terminar.
export async function redeem(f: FormData) {
  return withState(() => redeemImpl(f));
}

export async function approveRedemption(f: FormData) {
  return withState(() => approveRedemptionImpl(f));
}

export async function rejectRedemption(f: FormData) {
  return withState(() => rejectRedemptionImpl(f));
}

export async function deliver(f: FormData) {
  return withState(() => deliverImpl(f));
}

export async function addReward(f: FormData) {
  return withState(() => addRewardImpl(f));
}

export async function toggleReward(f: FormData) {
  return withState(() => toggleRewardImpl(f));
}

export async function addGoal(f: FormData) {
  return withState(() => addGoalImpl(f));
}
