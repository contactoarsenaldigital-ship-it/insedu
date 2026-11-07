"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { capacityIssues, degreeIssues, uuidv7 } from "@insedu/domain";
import { school } from "@/lib/demo";
import { degreeCandidates } from "@/lib/datos-ede";
import { canExportMineduc, getSession, type Session } from "@/lib/session";
import { withState } from "@/lib/state";
import { edeDataState, logEvent } from "@/lib/store";

/** Datos del establecimiento para el EDE: capacidad autorizada de los cursos y títulos de los docentes. */
const PATH = "/informatica/datos-ede";
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

function back(msg: { ok?: string; error?: string }): never {
  revalidatePath(PATH);
  redirect(`${PATH}?${new URLSearchParams(msg as Record<string, string>)}`);
}

async function admin(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/ingresar?next=${PATH}`);
  if (!canExportMineduc(s)) back({ error: "Solo dirección y administración registran estos datos." });
  return s;
}

async function saveCapacitiesImpl(f: FormData) {
  const s = await admin();
  const { capacities } = edeDataState();
  const errors: string[] = [];
  let changed = 0;
  for (const c of school().courses) {
    const raw = str(f, `cap_${c.id}`);
    if (!raw) continue;
    const err = capacityIssues(raw);
    if (err) {
      errors.push(`${c.name}: ${err}`);
      continue;
    }
    const capacity = Number(raw);
    const current = capacities.find((x) => x.courseId === c.id);
    if (current?.capacity === capacity) continue;
    logEvent({ actor: s.person.id, action: current ? "modificar" : "crear", entity: "capacidad_curso", recordId: c.id, courseId: c.id, before: current?.capacity ?? null, after: capacity });
    if (current) Object.assign(current, { capacity, by: s.person.id, at: new Date().toISOString() });
    else capacities.push({ id: uuidv7(), courseId: c.id, capacity, by: s.person.id, at: new Date().toISOString() });
    changed++;
  }
  if (errors.length) back({ error: `${changed ? `Se guardaron ${changed} curso(s). ` : ""}${errors.slice(0, 5).join(". ")}` });
  back({ ok: changed ? `Capacidad actualizada en ${changed} curso(s).` : "No hubo cambios." });
}

async function addDegreeImpl(f: FormData) {
  const s = await admin();
  const draft = { personId: str(f, "personId"), title: str(f, "title").slice(0, 200), institution: str(f, "institution").slice(0, 200), awardDate: str(f, "awardDate") || undefined };
  const issues = degreeIssues(draft, { today: today(), staffIds: degreeCandidates().map((p) => p.id) });
  if (issues.length) back({ error: issues.join(". ") });
  const record = { ...draft, id: uuidv7(), idoneidad: f.get("idoneidad") === "on", by: s.person.id, at: new Date().toISOString() };
  edeDataState().degrees.push(record);
  logEvent({ actor: s.person.id, action: "crear", entity: "titulo_docente", recordId: record.id, after: record });
  back({ ok: "Título registrado." });
}

async function removeDegreeImpl(f: FormData) {
  const s = await admin();
  const { degrees } = edeDataState();
  const i = degrees.findIndex((d) => d.id === str(f, "degreeId"));
  if (i < 0) back({ error: "Ese título no existe." });
  const [removed] = degrees.splice(i, 1);
  logEvent({ actor: s.person.id, action: "eliminar", entity: "titulo_docente", recordId: removed!.id, before: removed });
  back({ ok: "Título quitado. Queda en la bitácora." });
}

export async function saveCapacities(f: FormData) {
  return withState(() => saveCapacitiesImpl(f));
}
export async function addDegree(f: FormData) {
  return withState(() => addDegreeImpl(f));
}
export async function removeDegree(f: FormData) {
  return withState(() => removeDegreeImpl(f));
}
