"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deliveryIssues, institutionalIssues, isSignatureImage, nextRequestFolio, normalizeRut, docRequestIssues, requestStatus, uuidv7,
  type DeliveryDocKind, type InstitutionalKind, type Requester,
} from "@insedu/domain";
import { studentById } from "@/lib/demo";
import { documentsOf } from "@/lib/documentos";
import { canManageDeliveries, canManageInstitutional, deliveriesToday, ownStudents, requestById } from "@/lib/entregas";
import { getSession, type Session } from "@/lib/session";
import { withState } from "@/lib/state";
import { deliveriesState, logEvent } from "@/lib/store";
import { verifySignature } from "@/lib/verifier";

/** Acciones de entrega de información. Los mensajes viajan en la URL: nunca llevan nombres ni RUN. */
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function back(path: string, msg: { ok?: string; error?: string }): never {
  revalidatePath("/entregas");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(msg as Record<string, string>)}`);
}

async function session(next: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  return s;
}

const hash = (v?: string) => (v ? createHash("sha256").update(v).digest("hex") : undefined);

async function addRequestImpl(f: FormData) {
  const s = await session("/entregas");
  const studentId = str(f, "studentId");
  const staff = canManageDeliveries(s);
  const own = ownStudents(s).includes(studentId);
  if (!staff && !own) back("/entregas", { error: "Solo puede pedir documentos de su pupilo o propios." });
  const st = studentById(studentId);
  if (!st) back("/entregas", { error: "Ese estudiante no existe." });
  const today = deliveriesToday();
  // Quien pide desde su cuenta queda identificado por ella; el personal anota a quien pidió en persona.
  const requester: Requester = staff && !own
    ? { kind: (["apoderado", "estudiante", "otro"].includes(str(f, "requesterKind")) ? str(f, "requesterKind") : "otro") as Requester["kind"], name: str(f, "requesterName").replace(/\s+/g, " "), rut: str(f, "requesterRut") ? normalizeRut(str(f, "requesterRut")) : undefined }
    : { kind: s.person.roles.includes("student") ? "estudiante" : "apoderado", name: s.person.name, personId: s.person.id };
  const draft = { requestedOn: staff && !own ? str(f, "requestedOn") : today, documents: f.getAll("documents").map(String) as DeliveryDocKind[], other: str(f, "other") || undefined, note: str(f, "note").slice(0, 500) || undefined, requester };
  const issues = docRequestIssues(draft, today);
  if (issues.length) back("/entregas", { error: issues.join(". ") });
  const { requests } = deliveriesState();
  const record = { ...draft, id: uuidv7(), folio: nextRequestFolio(requests, draft.requestedOn), studentId, courseId: st.courseId, by: s.person.id, at: new Date().toISOString() };
  requests.push(record);
  logEvent({ actor: s.person.id, action: "crear", entity: "solicitud_documentos", recordId: record.id, courseId: st.courseId, after: { ...record, requester: { ...requester, rut: undefined } } });
  back(`/entregas/${record.id}`, { ok: `Solicitud registrada con el folio ${record.folio}.` });
}

async function deliverImpl(f: FormData) {
  const id = str(f, "requestId");
  const path = `/entregas/${id}`;
  const s = await session(path);
  if (!canManageDeliveries(s)) back(path, { error: "Solo administración, dirección e inspectoría registran entregas." });
  const r = requestById(id);
  if (!r) back("/entregas", { error: "La solicitud no existe." });
  const medium = str(f, "medium");
  const signature = medium === "papel" ? str(f, "signature") || undefined : undefined;
  const draft = { on: str(f, "on"), medium, receivedBy: medium === "papel" ? str(f, "receivedBy").replace(/\s+/g, " ") : undefined, signature, paperEvidence: medium === "papel" ? str(f, "paperEvidence") || undefined : undefined };
  const issues = deliveryIssues(draft, { today: deliveriesToday(), requestedOn: r.requestedOn, attachments: documentsOf("entrega", id).length, open: requestStatus(r) === "pendiente" });
  if (signature && !isSignatureImage(signature)) issues.push("La firma no es válida. Vuelva a firmar");
  if (issues.length) back(path, { error: issues.join(". ") });
  const signed = await verifySignature(s, str(f, "code"));
  if (!signed.ok) back(path, { error: `Entrega no registrada. ${signed.error}` });
  r.delivery = { ...draft, staffSignature: signed.signature, medium: medium as "papel" | "electronico", receivedRut: str(f, "receivedRut") ? normalizeRut(str(f, "receivedRut")) : undefined, by: s.person.id, at: new Date().toISOString() };
  const { signature: _omit, ...logged } = r.delivery;
  logEvent({ actor: s.person.id, action: "modificar", entity: "solicitud_documentos", recordId: id, courseId: r.courseId, before: { estado: "pendiente" }, after: { ...logged, receivedRut: undefined, signatureHash: hash(signature) } });
  back(path, { ok: medium === "papel" ? "Entrega registrada." : "Documentos enviados. Falta que el apoderado o estudiante confirme la recepción desde su cuenta." });
}

async function confirmImpl(f: FormData) {
  const id = str(f, "requestId");
  const path = `/entregas/${id}`;
  const s = await session(path);
  const r = requestById(id);
  if (!r || !ownStudents(s).includes(r.studentId)) back("/entregas", { error: "No puede confirmar esta entrega." });
  if (requestStatus(r) !== "por_confirmar" || !r.delivery) back(path, { error: "Esta entrega no espera confirmación." });
  r.delivery.confirmedAt = new Date().toISOString();
  r.delivery.confirmedBy = s.person.id;
  logEvent({ actor: s.person.id, action: "modificar", entity: "solicitud_documentos", recordId: id, courseId: r.courseId, before: { estado: "por_confirmar" }, after: { estado: "entregada", recepcionConforme: r.delivery.confirmedAt } });
  back(path, { ok: "Recepción conforme registrada." });
}

/** Solo quien pidió (o el personal, a su pedido) puede desistir. No hay opción de rechazar. */
async function withdrawImpl(f: FormData) {
  const id = str(f, "requestId");
  const path = `/entregas/${id}`;
  const s = await session(path);
  const r = requestById(id);
  if (!r || !(canManageDeliveries(s) || ownStudents(s).includes(r.studentId))) back("/entregas", { error: "No puede modificar esta solicitud." });
  const reason = str(f, "reason");
  if (requestStatus(r) !== "pendiente") back(path, { error: "Solo se puede desistir de una solicitud pendiente." });
  if (reason.length < 10) back(path, { error: "Indique el motivo del desistimiento (mínimo 10 caracteres)." });
  r.withdrawn = { reason, by: s.person.id, at: new Date().toISOString() };
  logEvent({ actor: s.person.id, action: "modificar", entity: "solicitud_documentos", recordId: id, courseId: r.courseId, before: { estado: "pendiente" }, after: { estado: "desistida" }, reason });
  back(path, { ok: "Desistimiento registrado." });
}

async function publishImpl(f: FormData) {
  const s = await session("/entregas");
  if (!canManageInstitutional(s)) back("/entregas", { error: "Solo dirección y administración publican instrumentos." });
  const draft = { kind: str(f, "kind"), title: str(f, "title").slice(0, 120), version: str(f, "version"), where: str(f, "where").slice(0, 300) || undefined };
  const issues = institutionalIssues(draft, deliveriesToday());
  if (issues.length) back("/entregas", { error: issues.join(". ") });
  const { institutional } = deliveriesState();
  const now = new Date().toISOString();
  // Una nueva versión del mismo tipo reemplaza a la anterior, que se conserva (salvo «otro»).
  if (draft.kind !== "otro") for (const d of institutional) if (d.kind === draft.kind && !d.replacedAt) d.replacedAt = now;
  const record = { ...draft, kind: draft.kind as InstitutionalKind, id: uuidv7(), by: s.person.id, at: now };
  institutional.push(record);
  logEvent({ actor: s.person.id, action: "crear", entity: "instrumento", recordId: record.id, after: record });
  back("/entregas", { ok: "Instrumento publicado. Adjunte el archivo si no tiene dirección web." });
}

export async function addRequest(f: FormData) {
  return withState(() => addRequestImpl(f));
}
export async function deliver(f: FormData) {
  return withState(() => deliverImpl(f));
}
export async function confirmReception(f: FormData) {
  return withState(() => confirmImpl(f));
}
export async function withdrawRequest(f: FormData) {
  return withState(() => withdrawImpl(f));
}
async function acknowledgeImpl(f: FormData) {
  const s = await session("/entregas");
  const wards = s.person.roles.includes("guardian_academic") ? s.person.wards ?? [] : [];
  if (!wards.length) back("/entregas", { error: "Solo el apoderado confirma la recepción de los instrumentos." });
  const doc = deliveriesState().institutional.find((d) => d.id === str(f, "docId") && !d.replacedAt);
  if (!doc) back("/entregas", { error: "Ese instrumento no está vigente." });
  if (doc.acknowledgements?.some((a) => a.personId === s.person.id)) back("/entregas", { error: "Ya confirmó haber recibido este instrumento." });
  const ack = { personId: s.person.id, wardIds: wards, at: new Date().toISOString() };
  (doc.acknowledgements ??= []).push(ack);
  logEvent({ actor: s.person.id, action: "modificar", entity: "instrumento", recordId: doc.id, after: { recepcion: ack.at, pupilos: wards.length } });
  back("/entregas", { ok: "Recepción confirmada." });
}

export async function acknowledgeInstitutional(f: FormData) {
  return withState(() => acknowledgeImpl(f));
}

export async function publishInstitutional(f: FormData) {
  return withState(() => publishImpl(f));
}
