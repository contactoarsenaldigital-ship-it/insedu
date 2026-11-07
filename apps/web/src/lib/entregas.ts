import "server-only";
import {
  DELIVERY_DOC_LABEL, INSTITUTIONAL_LABEL, REQUEST_STATUS_LABEL, REQUESTER_LABEL, requestStatus,
  type DocumentRequest, type Sheet,
} from "@insedu/domain";
import { courseById, fullName, studentById } from "./demo";
import type { Session } from "./session";
import { deliveriesState, findPerson } from "./store";

/**
 * Entrega de información (numeral 8). Administración, dirección e inspectoría registran las entregas;
 * el apoderado y el estudiante piden documentos y confirman la recepción de las entregas electrónicas.
 * Los instrumentos de interés general los ve toda la comunidad.
 */
export const canManageDeliveries = (s: Session) => s.person.roles.some((r) => r === "school_admin" || r === "director" || r === "inspector");
export const canManageInstitutional = (s: Session) => s.person.roles.some((r) => r === "school_admin" || r === "director");

/** Estudiantes por los que esta persona puede pedir documentos: su pupilo o sí mismo. */
export function ownStudents(s: Session): string[] {
  if (s.person.roles.includes("student")) return [s.person.id];
  if (s.person.roles.includes("guardian_academic")) return s.person.wards ?? [];
  return [];
}

export const canSeeRequest = (s: Session, r: DocumentRequest) => canManageDeliveries(s) || ownStudents(s).includes(r.studentId);

export const deliveriesToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

export const requestById = (id: string) => deliveriesState().requests.find((r) => r.id === id);

export const institutionalDocs = () => deliveriesState().institutional.filter((d) => !d.replacedAt).sort((a, b) => a.kind.localeCompare(b.kind));

const docs = (r: DocumentRequest) => r.documents.map((d) => (d === "otro" && r.other ? r.other : DELIVERY_DOC_LABEL[d])).join("; ");
const nameOf = (id?: string) => (id ? findPerson(id)?.name ?? id : "");

/** Registro de entrega de documentación, a disposición de la Superintendencia. */
export function deliverySheets(courseId?: string): Sheet[] {
  const scope = courseId ? ` · ${courseById(courseId)?.name}` : "";
  const { requests, institutional } = deliveriesState();
  return [
    {
      name: "Entrega de documentación",
      title: `Registro de entrega de documentación${scope}`,
      columns: [
        { header: "Folio", format: "integer" }, { header: "Solicitud", format: "date" }, { header: "Estudiante", width: 30 }, { header: "Curso", width: 14 }, { header: "Solicita", width: 28 }, { header: "Documentos", width: 44 },
        { header: "Estado", width: 22 }, { header: "Entrega", format: "date" }, { header: "Medio" }, { header: "Recibe", width: 28 }, { header: "Recepción conforme", width: 34 }, { header: "Entregó", width: 24 }, { header: "Desistimiento", width: 30 },
      ],
      rows: requests.filter((r) => !courseId || r.courseId === courseId).sort((a, b) => a.requestedOn.localeCompare(b.requestedOn) || a.folio - b.folio).map((r) => {
        const st = studentById(r.studentId);
        const d = r.delivery;
        const reception = !d ? "" : d.medium === "electronico" ? (d.confirmedAt ? `Confirmada en INSEDU el ${d.confirmedAt.slice(0, 10)} por ${nameOf(d.confirmedBy)}` : "Pendiente de confirmar") : d.signature ? "Firma en pantalla registrada" : `En papel: ${d.paperEvidence ?? ""}`;
        return [
          r.folio, r.requestedOn, st ? fullName(st) : r.studentId, courseById(r.courseId)?.name ?? "", `${REQUESTER_LABEL[r.requester.kind]}: ${r.requester.name}`, docs(r),
          REQUEST_STATUS_LABEL[requestStatus(r)], d?.on ?? "", d ? (d.medium === "papel" ? "Papel" : "Electrónico") : "", d?.receivedBy ?? "", reception, nameOf(d?.by), r.withdrawn?.reason ?? "",
        ];
      }),
    },
    {
      name: "Instrumentos de interés general",
      title: "Instrumentos de interés general a disposición de la comunidad",
      columns: [{ header: "Tipo", width: 34 }, { header: "Título", width: 34 }, { header: "Versión", format: "date" }, { header: "Dónde se consulta", width: 40 }, { header: "Vigente" }, { header: "Publicó", width: 24 }],
      rows: institutional.map((d) => [INSTITUTIONAL_LABEL[d.kind], d.title, d.version, d.where ?? "", d.replacedAt ? `Reemplazado el ${d.replacedAt.slice(0, 10)}` : "Sí", nameOf(d.by)]),
    },
  ];
}
