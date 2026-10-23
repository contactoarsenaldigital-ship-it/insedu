import { courseById, fullName, studentById } from "./demo";
import { findPerson } from "./store";

export const fmtDT = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const who = (id: string) => findPerson(id)?.name ?? id;

export const studentLabel = (id: string) => {
  const s = studentById(id);
  return s ? `${fullName(s)} · ${courseById(s.courseId)?.name}` : id;
};

/** "2026-09-04" → "04-09-2026" */
export const fmtDate = (ymd: string) => ymd.split("-").reverse().join("-");
