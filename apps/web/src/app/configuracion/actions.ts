"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSensitive, MAX_IMPORT_ROWS, normalizeRut, requestIssues, ROLE_LABEL, STRONG_AUTH_WINDOW_MS, type ImportKind } from "@insedu/domain";
import { accountByEmail, accountById, accountsState, audit, DEFAULT_SETTINGS, settings, type Settings } from "@/lib/accounts";
import { createAccount, isAdmin, isDirector, proposalFrom, proposalIssues, rejectRequest, releaseScope, resetAccess, type Proposal } from "@/lib/admin";
import { applyImport, MAX_FILE_BYTES, planImport, savePending, tableFromFile } from "@/lib/bulk";
import { getSession, type Session } from "@/lib/session";
import { withState } from "@/lib/state";

/**
 * Acciones de configuración. Administración (school_admin) gestiona solicitudes, usuarios y
 * parámetros; dirección aprueba los perfiles sensibles. Todo lo que da o quita acceso exige
 * haber verificado la identidad hace menos de 5 minutos y queda en la auditoría.
 */
type Tab = "solicitudes" | "usuarios" | "nuevo" | "carga" | "parametros" | "auditoria" | "correos";

function back(tab: Tab, msg: string, extra = ""): never {
  redirect(`/configuracion?tab=${tab}&msg=${msg}${extra}`);
}

/** Sesión con el perfil requerido y verificación reciente; si no, redirige. */
async function guard(tab: Tab, who: "admin" | "director" | "either"): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/ingresar?next=/configuracion");
  const ok = who === "admin" ? isAdmin(s) : who === "director" ? isDirector(s) : isAdmin(s) || isDirector(s);
  if (!ok) back(tab, "permiso");
  const fresh = s.lastStrongAuthAt && Date.now() - new Date(s.lastStrongAuthAt).getTime() <= STRONG_AUTH_WINDOW_MS;
  if (!fresh) redirect(`/verificar?next=${encodeURIComponent(`/configuracion?tab=${tab}`)}`);
  return s;
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const requestOf = (form: FormData) => accountsState().requests.find((r) => r.id === String(form.get("requestId") ?? ""));

// ───────────── Solicitudes ─────────────

async function approveImpl(form: FormData) {
  const s = await guard("solicitudes", "admin");
  const r = requestOf(form);
  if (!r || r.status !== "pendiente") back("solicitudes", "vencida");
  const p = proposalFrom(form);
  const issues = proposalIssues(p);
  if (issues.length) back("solicitudes", "propuesta", `&id=${r.id}`);
  if (accountByEmail(r.email)) back("solicitudes", "duplicada");
  if (isSensitive(p.roles)) {
    r.status = "esperando_direccion";
    r.proposal = { ...p, by: s.person.id, at: new Date().toISOString() };
    audit(s.person.id, "Perfil sensible propuesto", `${r.name} · ${p.roles.map((x) => ROLE_LABEL[x]).join(", ")} · espera aprobación de dirección`);
    back("solicitudes", "direccion");
  }
  const a = createAccount(r, p, s.person.id, await origin());
  r.status = "aprobada";
  r.accountId = a.id;
  r.decidedBy = [s.person.id];
  r.decidedAt = new Date().toISOString();
  back("solicitudes", "aprobada");
}

async function rejectImpl(form: FormData) {
  const s = await guard("solicitudes", "either");
  const r = requestOf(form);
  if (!r || (r.status !== "pendiente" && r.status !== "esperando_direccion")) back("solicitudes", "vencida");
  if (r.status === "esperando_direccion" && !isDirector(s) && r.proposal?.by !== s.person.id) back("solicitudes", "permiso");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (reason.length < 5) back("solicitudes", "motivo");
  rejectRequest(r, s.person.id, reason);
  back("solicitudes", "rechazada");
}

/** Dirección confirma un perfil sensible. Debe ser una persona distinta de quien lo propuso. */
async function directorApproveImpl(form: FormData) {
  const s = await guard("solicitudes", "director");
  const r = requestOf(form);
  if (!r || r.status !== "esperando_direccion" || !r.proposal) back("solicitudes", "vencida");
  if (r.proposal.by === s.person.id) back("solicitudes", "cuatro-ojos");
  if (accountByEmail(r.email)) back("solicitudes", "duplicada");
  const { by, at: _at, ...p } = r.proposal;
  const a = createAccount(r, p as Proposal, by, await origin());
  r.status = "aprobada";
  r.accountId = a.id;
  r.decidedBy = [by, s.person.id];
  r.decidedAt = new Date().toISOString();
  audit(s.person.id, "Perfil sensible aprobado por dirección", `${r.name} · ${a.roles.map((x) => ROLE_LABEL[x]).join(", ")}`);
  back("solicitudes", "aprobada");
}

// ───────────── Usuarios ─────────────

/** Alta directa por administración. Los perfiles sensibles también pasan por dirección. */
async function createImpl(form: FormData) {
  const s = await guard("nuevo", "admin");
  const data = {
    name: String(form.get("name") ?? "").trim().replace(/\s+/g, " "),
    rut: String(form.get("rut") ?? "").trim(),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    phone: String(form.get("phone") ?? "").trim() || undefined,
  };
  // Se reutilizan las validaciones de la solicitud pública (relación «directivo» solo para validar).
  if (requestIssues({ ...data, relationship: "directivo" }).length) back("nuevo", "datos");
  if (accountByEmail(data.email) || accountsState().users.some((a) => a.rut === normalizeRut(data.rut))) back("nuevo", "duplicada");
  const p = proposalFrom(form);
  if (proposalIssues(p).length) back("nuevo", "propuesta");
  if (isSensitive(p.roles)) {
    const now = new Date().toISOString();
    accountsState().requests.push({
      id: crypto.randomUUID(),
      ...data,
      relationship: "Alta directa de administración", // no viene del formulario público
      status: "esperando_direccion",
      createdAt: now,
      proposal: { ...p, by: s.person.id, at: now },
    });
    audit(s.person.id, "Perfil sensible propuesto", `${data.name} · ${p.roles.map((x) => ROLE_LABEL[x]).join(", ")} · espera aprobación de dirección`);
    back("solicitudes", "direccion");
  }
  createAccount(data, p, s.person.id, await origin());
  back("usuarios", "creada");
}

async function userAction(form: FormData) {
  const s = await guard("usuarios", "admin");
  const a = accountById(String(form.get("accountId") ?? ""));
  if (!a) back("usuarios", "vencida");
  const op = String(form.get("op") ?? "");
  if (op === "suspender" && a.status !== "suspendida") {
    a.status = "suspendida";
    releaseScope(a);
    audit(s.person.id, "Cuenta suspendida", `${a.name}${a.scope.subjectIds?.length || a.scope.headOfCourseId ? " · sus asignaturas quedan sin asignar" : ""}`);
    back("usuarios", "suspendida");
  }
  if (op === "reactivar" && a.status === "suspendida") {
    // Vuelve a activar su clave y segundo factor; el alcance se reasigna con «Restablecer acceso» o al editar.
    a.status = a.passwordHash && a.mfa ? "activa" : "invitada";
    audit(s.person.id, "Cuenta reactivada", a.name);
    back("usuarios", "reactivada");
  }
  if (op === "desbloquear") {
    a.lockedUntil = undefined;
    a.failedLogins = 0;
    audit(s.person.id, "Bloqueo levantado", a.name);
    back("usuarios", "desbloqueada");
  }
  if (op === "restablecer" || op === "reenviar") {
    if (op === "reenviar" && a.status !== "invitada") back("usuarios", "vencida");
    resetAccess(a, s.person.id, await origin());
    back("usuarios", "enlace");
  }
  back("usuarios", "vencida");
}

// ───────────── Parámetros ─────────────

const LIMITS: Partial<Record<keyof Settings, [number, number]>> = {
  contactStartHour: [0, 23],
  contactEndHour: [1, 24],
  riskMinAverage: [1, 7],
  riskMinAttendance: [50, 100], // en porcentaje en el formulario
  riskMaxNegatives: [0, 20],
  riskMaxNurseVisits: [0, 20],
  copilotDailyLimit: [0, 2000],
  passwordMinLength: [10, 64],
  codeMinutes: [3, 30],
  maxAttempts: [3, 10],
  lockMinutes: [5, 120],
};

async function settingsImpl(form: FormData) {
  const s = await guard("parametros", "admin");
  const prev = settings();
  const next: Settings = { ...prev };
  for (const [key, [min, max]] of Object.entries(LIMITS) as [keyof Settings, [number, number]][]) {
    const raw = Number(String(form.get(key) ?? "").replace(",", "."));
    if (!Number.isFinite(raw) || raw < min || raw > max) back("parametros", "rango", `&campo=${key}`);
    (next as Record<string, unknown>)[key] = key === "riskMinAttendance" ? raw / 100 : raw;
  }
  if (next.contactEndHour <= next.contactStartHour) back("parametros", "horario");
  const LABEL: Partial<Record<keyof Settings, string>> = {
    contactStartHour: "Inicio de envíos", contactEndHour: "Término de envíos", riskMinAverage: "Promedio bajo",
    riskMinAttendance: "Asistencia baja", riskMaxNegatives: "Anotaciones negativas", riskMaxNurseVisits: "Atenciones de enfermería",
    copilotDailyLimit: "Consultas diarias del Copiloto", passwordMinLength: "Largo mínimo de clave", codeMinutes: "Vigencia del código",
    maxAttempts: "Intentos antes de bloquear", lockMinutes: "Duración del bloqueo",
  };
  const changed = (Object.keys(LIMITS) as (keyof Settings)[]).filter((k) => prev[k] !== next[k]);
  next.updatedAt = new Date().toISOString();
  next.updatedBy = s.person.id;
  accountsState().settings = [next];
  audit(s.person.id, "Parámetros actualizados", changed.length ? changed.map((k) => `${LABEL[k] ?? k}: ${prev[k]} → ${next[k]}`).join(" · ") : "Sin cambios");
  back("parametros", "guardado");
}

async function settingsResetImpl() {
  const s = await guard("parametros", "admin");
  accountsState().settings = [{ ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString(), updatedBy: s.person.id }];
  audit(s.person.id, "Parámetros restablecidos", "Valores recomendados");
  back("parametros", "guardado");
}

export async function approveRequest(form: FormData) {
  return withState(() => approveImpl(form));
}
export async function rejectAccessRequest(form: FormData) {
  return withState(() => rejectImpl(form));
}
export async function directorApprove(form: FormData) {
  return withState(() => directorApproveImpl(form));
}
export async function createUser(form: FormData) {
  return withState(() => createImpl(form));
}
export async function manageUser(form: FormData) {
  return withState(() => userAction(form));
}
export async function saveSettings(form: FormData) {
  return withState(() => settingsImpl(form));
}
export async function resetSettings() {
  return withState(() => settingsResetImpl());
}

// ───────────── Carga masiva ─────────────

const KINDS: ImportKind[] = ["estudiantes", "funcionarios", "apoderados"];

/** Paso 1: lee el archivo y deja un plan por fila para revisar antes de cargar. */
async function analyzeImpl(form: FormData) {
  const s = await guard("carga", "admin");
  const kind = KINDS.find((k) => k === form.get("kind")) ?? "estudiantes";
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) back("carga", "archivo", `&tipo=${kind}`);
  if (file.size > MAX_FILE_BYTES) back("carga", "grande", `&tipo=${kind}`);
  const name = file.name.toLowerCase();
  if (![".csv", ".txt", ".xlsx", ".xls"].some((ext) => name.endsWith(ext))) back("carga", "formato", `&tipo=${kind}`);
  let table: string[][];
  try {
    table = await tableFromFile(file);
  } catch {
    back("carga", name.endsWith(".xls") ? "xls" : "ilegible", `&tipo=${kind}`);
  }
  if (table.length < 2) back("carga", "vacio", `&tipo=${kind}`);
  if (table.length - 1 > MAX_IMPORT_ROWS) back("carga", "filas", `&tipo=${kind}`);
  const options = { createCourses: form.get("createCourses") === "1", sendInvites: form.get("sendInvites") === "1" };
  const plan = planImport(kind, table, options);
  if (plan.missing.length) back("carga", "columnas", `&tipo=${kind}&faltan=${encodeURIComponent(plan.missing.join(", "))}`);
  const pending = savePending(kind, file.name.slice(0, 120), plan, options, s.person.id);
  redirect(`/configuracion?tab=carga&id=${pending.id}`);
}

const pendingOf = (form: FormData) => (accountsState().imports ?? []).find((p) => p.id === String(form.get("importId") ?? "") && p.status === "revision");

/** Paso 2: aplica las filas válidas (se vuelven a revisar con los datos del momento). */
async function applyImpl(form: FormData) {
  const s = await guard("carga", "admin");
  const p = pendingOf(form);
  if (!p) back("carga", "vencida");
  applyImport(p, s.person.id, await origin());
  redirect(`/configuracion?tab=carga&id=${p.id}&msg=importada`);
}

async function discardImpl(form: FormData) {
  await guard("carga", "admin");
  const p = pendingOf(form);
  if (p) p.status = "descartada";
  back("carga", "descartada");
}

export async function analyzeImport(form: FormData) {
  return withState(() => analyzeImpl(form));
}
export async function confirmImport(form: FormData) {
  return withState(() => applyImpl(form));
}
export async function discardImport(form: FormData) {
  return withState(() => discardImpl(form));
}
