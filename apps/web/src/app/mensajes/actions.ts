"use server";
import { withState } from "@/lib/state";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateMessage } from "@insedu/domain";
import { school } from "@/lib/demo";
import { allowed, deliveryOf, markRead, msgState, publish, send, teacherCourses } from "@/lib/messages";
import { getSession } from "@/lib/session";
import { findPerson } from "@/lib/store";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function back(path: string, msg: { ok?: string; error?: string }): never {
  revalidatePath("/mensajes");
  const q = new URLSearchParams(Object.entries(msg).filter(([, v]) => v) as [string, string][]);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${q}`);
}

async function me() {
  const s = await getSession();
  if (!s) redirect("/ingresar?next=/mensajes");
  return s.person;
}

const whenLabel = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", weekday: "long", hour: "2-digit", minute: "2-digit" });

async function sendMessageImpl(f: FormData) {
  const from = await me();
  const threadId = str(f, "threadId") || undefined;
  const thread = threadId ? msgState().threads.find((t) => t.id === threadId) : undefined;
  if (threadId && (!thread || (thread.a !== from.id && thread.b !== from.id))) back("/mensajes?tab=mensajes", { error: "Conversación no encontrada." });
  const toId = thread ? (thread.a === from.id ? thread.b : thread.a) : str(f, "to");
  const to = findPerson(toId);
  const path = thread ? `/mensajes?tab=mensajes&t=${thread.id}` : "/mensajes?tab=mensajes";
  if (!to) back(path, { error: "Seleccione un destinatario." });
  const rule = allowed(from, to);
  if (!rule.allow) back(path, { error: rule.reason ?? "Destinatario no permitido." });
  const err = validateMessage(str(f, "body"));
  if (err) back(path, { error: err });
  const { thread: t, msg } = send(from, to, str(f, "subject"), str(f, "body"), thread?.id);
  back(`/mensajes?tab=mensajes&t=${t.id}`, {
    ok: msg.notifyAt
      ? `Mensaje enviado. Por el horario de contacto, ${to.name} recibirá la notificación el ${whenLabel(msg.notifyAt)}.`
      : "Mensaje enviado.",
  });
}

async function publishAnnouncementImpl(f: FormData) {
  const author = await me();
  const scope = str(f, "courseId");
  const isLeader = author.roles.some((r) => ["director", "inspector", "school_admin"].includes(r));
  const isTeacher = author.roles.some((r) => r === "teacher" || r === "head_teacher");
  if (!isLeader && !isTeacher) back("/mensajes", { error: "Su perfil no publica comunicados." });
  if (scope === "todos" && !isLeader) back("/mensajes", { error: "Solo dirección o inspectoría publican para todo el establecimiento." });
  if (scope !== "todos" && !isLeader && !teacherCourses(author.id).includes(scope)) back("/mensajes", { error: "Solo puede publicar en sus cursos." });
  if (scope !== "todos" && !school().courses.some((c) => c.id === scope)) back("/mensajes", { error: "Curso inválido." });
  const title = str(f, "title");
  const body = str(f, "body");
  if (title.length < 5 || title.length > 120) back("/mensajes", { error: "El título debe tener entre 5 y 120 caracteres." });
  const err = validateMessage(body);
  if (err) back("/mensajes", { error: err });
  const courseId = scope === "todos" ? null : scope;
  publish({ courseId, title, body, requiresAck: f.get("requiresAck") === "1", authorId: author.id });
  back("/mensajes", { ok: `Comunicado publicado. ${deliveryOf(courseId).text}.` });
}

async function confirmReadImpl(f: FormData) {
  const p = await me();
  markRead(str(f, "id"), p.id);
  back("/mensajes", { ok: "Lectura confirmada." });
}

// Cada acción sincroniza el estado antes de ejecutarse y guarda los cambios al terminar.
export async function sendMessage(f: FormData) {
  return withState(() => sendMessageImpl(f));
}

export async function publishAnnouncement(f: FormData) {
  return withState(() => publishAnnouncementImpl(f));
}

export async function confirmRead(f: FormData) {
  return withState(() => confirmReadImpl(f));
}
