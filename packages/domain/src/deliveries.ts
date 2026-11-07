/**
 * Entrega de información (Circular de registros, numeral 8).
 *
 * - Se entregan a estudiantes y apoderados los documentos necesarios para continuar en el sistema
 *   educativo, en papel o en forma electrónica, indicando qué se entregó y con recepción conforme firmada.
 * - El no pago de compromisos nunca justifica retener documentación (LGE art. 11): este registro no
 *   tiene una opción para rechazar. Solo quien pidió puede desistir.
 * - Los instrumentos de interés general (Reglamento Interno, de Evaluación, PEI, PISE) quedan a
 *   disposición de toda la comunidad.
 */

import type { LessonSignature } from "./gradebook";
export type DeliveryDocKind = "promocion" | "personalidad" | "evaluacion" | "carpeta_pie" | "logros" | "otro";

export const DELIVERY_DOC_LABEL: Record<DeliveryDocKind, string> = {
  promocion: "Certificado de promoción",
  personalidad: "Informe de personalidad",
  evaluacion: "Informe de evaluación o reevaluación",
  carpeta_pie: "Carpeta del estudiante del PIE",
  logros: "Certificado de logros académicos",
  otro: "Otro documento",
};

export type Requester = { kind: "apoderado" | "estudiante" | "otro"; name: string; rut?: string; personId?: string };

export const REQUESTER_LABEL: Record<Requester["kind"], string> = { apoderado: "Apoderado/a", estudiante: "Estudiante", otro: "Otra persona" };

export type Delivery = {
  on: string;
  medium: "papel" | "electronico";
  /** Quien recibe en papel. En la entrega electrónica, quien confirma desde su cuenta. */
  receivedBy?: string;
  receivedRut?: string;
  /** Firma en pantalla de quien recibe (papel). */
  signature?: string;
  /** Recepción firmada en papel: dónde consta. */
  paperEvidence?: string;
  /** Entrega electrónica: recepción conforme desde la cuenta del apoderado o estudiante. */
  confirmedAt?: string;
  confirmedBy?: string;
  by: string;
  at: string;
  /** Firma con verificador de quien entrega (el EDE la exige). */
  staffSignature?: LessonSignature;
};

export type DocumentRequest = {
  id: string;
  folio: number;
  studentId: string;
  courseId: string;
  requester: Requester;
  requestedOn: string;
  documents: DeliveryDocKind[];
  other?: string;
  note?: string;
  delivery?: Delivery;
  withdrawn?: { reason: string; by: string; at: string };
  by: string;
  at: string;
};

export type RequestStatus = "pendiente" | "por_confirmar" | "entregada" | "desistida";

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pendiente: "Pendiente",
  por_confirmar: "Enviada, falta recepción conforme",
  entregada: "Entregada",
  desistida: "Desistida",
};

export function requestStatus(r: DocumentRequest): RequestStatus {
  if (r.withdrawn) return "desistida";
  if (!r.delivery) return "pendiente";
  if (r.delivery.medium === "electronico" && !r.delivery.confirmedAt) return "por_confirmar";
  return "entregada";
}

/** Días corridos desde la solicitud. Entregar tarde es infracción, aunque la norma no fija un plazo. */
export function daysWaiting(r: DocumentRequest, today: string): number {
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(r.requestedOn)) / 86_400_000));
}

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

export function docRequestIssues(r: { requestedOn: string; documents: string[]; other?: string; requester: { name: string } }, today: string): string[] {
  const issues: string[] = [];
  if (!isDate(r.requestedOn) || r.requestedOn > today) issues.push("Indique la fecha de la solicitud");
  if (!r.documents.length) issues.push("Indique qué documentos se solicitan");
  if (r.documents.some((d) => !(d in DELIVERY_DOC_LABEL))) issues.push("Documento no reconocido");
  if (r.documents.includes("otro") && (r.other?.trim().length ?? 0) < 3) issues.push("Describa el otro documento");
  if (r.requester.name.trim().split(/\s+/).length < 2) issues.push("Indique nombre y apellido de quien solicita");
  return issues;
}

export function deliveryIssues(
  d: { on: string; medium: string; receivedBy?: string; signature?: string; paperEvidence?: string },
  ctx: { today: string; requestedOn: string; attachments: number; open: boolean },
): string[] {
  const issues: string[] = [];
  if (!ctx.open) issues.push("La solicitud ya fue cerrada");
  if (!isDate(d.on) || d.on > ctx.today || d.on < ctx.requestedOn) issues.push("Indique la fecha de entrega, desde la solicitud hasta hoy");
  if (d.medium === "papel") {
    if ((d.receivedBy?.trim().split(/\s+/).length ?? 0) < 2) issues.push("Indique nombre y apellido de quien recibe");
    if (!d.signature && (d.paperEvidence?.trim().length ?? 0) < 5) issues.push("Falta la firma de recepción conforme, en pantalla o en papel");
  } else if (d.medium === "electronico") {
    if (ctx.attachments === 0) issues.push("Adjunte los documentos antes de entregarlos en forma electrónica");
  } else issues.push("Indique si la entrega es en papel o electrónica");
  return issues;
}

/** Correlativo anual de solicitudes. */
export function nextRequestFolio(requests: { folio: number; requestedOn: string }[], date: string): number {
  const year = date.slice(0, 4);
  return requests.filter((r) => r.requestedOn.startsWith(year)).reduce((m, r) => Math.max(m, r.folio), 0) + 1;
}

// ───────────── Instrumentos de interés general ─────────────

export type InstitutionalKind = "reglamento_interno" | "evaluacion_promocion" | "pei" | "pise" | "otro";

export const INSTITUTIONAL_LABEL: Record<InstitutionalKind, string> = {
  reglamento_interno: "Reglamento Interno",
  evaluacion_promocion: "Reglamento de Evaluación y Promoción",
  pei: "Proyecto Educativo Institucional",
  pise: "Plan Integral de Seguridad Escolar (PISE)",
  otro: "Otro instrumento",
};

/** Los que la Circular nombra expresamente: se avisa si falta alguno. */
export const REQUIRED_INSTITUTIONAL: InstitutionalKind[] = ["reglamento_interno", "evaluacion_promocion", "pei", "pise"];

export type InstitutionalDoc = {
  id: string;
  kind: InstitutionalKind;
  title: string;
  /** Fecha de la versión vigente. */
  version: string;
  /** Dirección web pública o lugar físico donde se puede consultar. */
  where?: string;
  /** Reemplazado por una versión más nueva: se conserva para la historia. */
  replacedAt?: string;
  by: string;
  at: string;
  /** Apoderados que confirmaron desde su cuenta haber recibido el instrumento, por sus pupilos. */
  acknowledgements?: { personId: string; wardIds: string[]; at: string }[];
};

export function institutionalIssues(d: { kind: string; title: string; version: string; where?: string }, today: string): string[] {
  const issues: string[] = [];
  if (!(d.kind in INSTITUTIONAL_LABEL)) issues.push("Indique el tipo de instrumento");
  if (d.title.trim().length < 3) issues.push("Indique el título");
  if (!isDate(d.version) || d.version > today) issues.push("Indique la fecha de la versión vigente");
  if (d.where && /^https?:/i.test(d.where) && !/^https:\/\/[^\s]+$/i.test(d.where)) issues.push("La dirección web debe comenzar con https://");
  return issues;
}

export const missingInstitutional = (docs: InstitutionalDoc[]) => REQUIRED_INSTITUTIONAL.filter((k) => !docs.some((d) => d.kind === k && !d.replacedAt));
