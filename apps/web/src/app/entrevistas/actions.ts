"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { meetingIssues, normalizeRut, uuidv7, type AttendeeRelation, type MeetingAttendee, type MeetingKind } from "@insedu/domain";
import { activeStudents } from "@/lib/demo";
import { canRegisterMeeting, meetingsToday } from "@/lib/entrevistas";
import { enrollmentOf } from "@/lib/matricula";
import { getSession } from "@/lib/session";
import { withState } from "@/lib/state";
import { logEvent, meetingsState } from "@/lib/store";
import { verifySignature } from "@/lib/verifier";

/** Registro de entrevistas y reuniones con apoderados. Los mensajes viajan en la URL: nunca llevan nombres ni RUN. */
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const oneLine = (v: string) => v.replace(/\s+/g, " ");

function back(path: string, msg: { ok?: string; error?: string }): never {
  revalidatePath("/entrevistas");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(msg as Record<string, string>)}`);
}

async function addMeetingImpl(f: FormData) {
  const courseId = str(f, "courseId");
  const kind = str(f, "kind") as MeetingKind;
  const path = `/entrevistas?curso=${encodeURIComponent(courseId)}&tipo=${kind === "reunion" ? "reunion" : "entrevista"}`;
  const s = await getSession();
  if (!s) redirect(`/ingresar?next=${encodeURIComponent("/entrevistas")}`);
  if (!canRegisterMeeting(s, courseId)) back("/entrevistas", { error: "No registra entrevistas ni reuniones en ese curso." });
  const courseStudentIds = activeStudents().filter((x) => x.courseId === courseId).map((x) => x.id);

  let attendees: MeetingAttendee[];
  let studentId: string | undefined;
  if (kind === "reunion") {
    // Asiste el apoderado registrado en la matrícula de cada estudiante marcado.
    attendees = f.getAll("present").map(String).filter((id) => courseStudentIds.includes(id)).map((id) => {
      const g = enrollmentOf(id)?.guardians[0];
      return { studentId: id, name: oneLine(g?.name ?? ""), relation: "titular" as AttendeeRelation };
    });
  } else {
    studentId = str(f, "studentId");
    const name = oneLine(str(f, "attendeeName"));
    const rut = str(f, "attendeeRut");
    attendees = name || rut ? [{ studentId, name, rut: rut ? normalizeRut(rut) : undefined, relation: str(f, "relation") as AttendeeRelation }] : [];
  }
  const draft = { kind, studentId, date: str(f, "date"), time: str(f, "time"), topics: str(f, "topics").slice(0, 2000), agreements: str(f, "agreements").slice(0, 2000), attendees };
  const issues = meetingIssues(draft, { today: meetingsToday(), courseStudentIds });
  if (issues.length) back(path, { error: issues.join(". ") });

  const signed = await verifySignature(s, str(f, "code"));
  if (!signed.ok) back(path, { error: `No se guardó: ${signed.error}` });
  const record = { ...draft, id: uuidv7(), courseId, by: s.person.id, signature: signed.signature, at: new Date().toISOString() };
  meetingsState().push(record);
  logEvent({
    actor: s.person.id, action: "crear", entity: kind === "reunion" ? "reunion_apoderados" : "entrevista", recordId: record.id, courseId,
    after: { kind, studentId, date: draft.date, time: draft.time, topics: draft.topics, agreements: draft.agreements, asistentes: attendees.length, firma: signed.signature.method },
  });
  back(`/entrevistas/${record.id}`, { ok: `Registro guardado y firmado. Adjunte el acta firmada por ${kind === "reunion" ? "los asistentes" : "el apoderado"}.` });
}

export async function addMeeting(f: FormData) {
  return withState(() => addMeetingImpl(f));
}
