"use server";
import { maskEmail, normalizeRut, RELATIONSHIPS, requestIssues, uuidv7, type AccessRequestInput } from "@insedu/domain";
import { accountsState, audit, canResend, checkCode, demoCodeFor, issueCode, sendMail } from "@/lib/accounts";
import { withState } from "@/lib/state";

/**
 * Solicitud pública de acceso: 1) la persona completa sus datos; 2) confirma su correo con un
 * código de 6 dígitos. Recién entonces la solicitud llega a administración.
 */
export type RequestFormState = {
  step: "datos" | "codigo" | "enviada";
  values?: AccessRequestInput;
  issues?: string[];
  requestId?: string;
  sentTo?: string;
  demoCode?: string;
  message?: string;
};

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

async function submitImpl(form: FormData): Promise<RequestFormState> {
  const values: AccessRequestInput = {
    name: text(form, "name").replace(/\s+/g, " "),
    rut: text(form, "rut"),
    email: text(form, "email").toLowerCase(),
    phone: text(form, "phone") || undefined,
    relationship: text(form, "relationship"),
    studentRut: text(form, "studentRut") || undefined,
    note: text(form, "note") || undefined,
  };
  const issues = requestIssues(values);
  if (issues.length) return { step: "datos", values, issues };

  const st = accountsState();
  const rut = normalizeRut(values.rut);
  // Una solicitud abierta por persona: si vuelve a enviar, se reemplaza la que no confirmó su correo.
  st.requests = st.requests.filter((r) => !(r.status === "verificando_correo" && (r.email === values.email || r.rut === rut)));
  const open = st.requests.find((r) => (r.status === "pendiente" || r.status === "esperando_direccion") && (r.email === values.email || r.rut === rut));
  if (open) {
    return { step: "enviada", message: "Ya hay una solicitud en revisión con estos datos. Administración le escribirá a su correo cuando la resuelva." };
  }

  const id = uuidv7();
  st.requests.push({
    id,
    ...values,
    rut,
    studentRut: values.studentRut ? normalizeRut(values.studentRut) : undefined,
    status: "verificando_correo",
    createdAt: new Date().toISOString(),
  });
  const sent = issueCode(id, "verificar_correo", values.email);
  return { step: "codigo", requestId: id, sentTo: sent.sentTo, demoCode: demoCodeFor(id, "verificar_correo") };
}

async function verifyImpl(form: FormData): Promise<RequestFormState> {
  const id = text(form, "requestId");
  const req = accountsState().requests.find((r) => r.id === id && r.status === "verificando_correo");
  if (!req) return { step: "datos", issues: ["La solicitud venció. Complete el formulario de nuevo."] };
  const base = { step: "codigo" as const, requestId: id, sentTo: maskEmail(req.email) };

  if (form.get("resend")) {
    if (!canResend(id, "verificar_correo")) return { ...base, demoCode: demoCodeFor(id, "verificar_correo"), message: "Espere un minuto antes de pedir otro código." };
    issueCode(id, "verificar_correo", req.email);
    return { ...base, demoCode: demoCodeFor(id, "verificar_correo"), message: "Enviamos un código nuevo." };
  }

  const r = checkCode(id, "verificar_correo", text(form, "code").replace(/\s/g, ""));
  if (r === "vencido" || r === "agotado") {
    issueCode(id, "verificar_correo", req.email);
    return { ...base, demoCode: demoCodeFor(id, "verificar_correo"), message: "El código venció o superó los intentos. Enviamos uno nuevo." };
  }
  if (r !== "ok") return { ...base, demoCode: demoCodeFor(id, "verificar_correo"), message: "El código no es correcto. Revise e intente de nuevo." };

  req.status = "pendiente";
  audit("público", "Solicitud de acceso recibida", `${req.name} · ${RELATIONSHIPS[req.relationship as keyof typeof RELATIONSHIPS]?.label ?? req.relationship}`);
  sendMail(req.email, "Recibimos su solicitud de acceso a INSEDU", `Hola, ${req.name.split(" ")[0]}. Administración revisará su solicitud y le escribirá a este correo. Si usted no la envió, responda este correo.`);
  return { step: "enviada" };
}

/** Una sola acción: el campo oculto «phase» indica si se envían los datos o el código. */
export async function accessRequestAction(_prev: RequestFormState, form: FormData) {
  return withState(() => (form.get("phase") === "codigo" ? verifyImpl(form) : submitImpl(form)));
}
