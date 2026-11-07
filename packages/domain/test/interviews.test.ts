import { describe, expect, it } from "vitest";
import { meetingIssues } from "../src/interviews";

const base = { kind: "entrevista", studentId: "a", date: "2026-11-05", time: "16:30", topics: "Rendimiento en Matemática", agreements: "Reforzamiento los martes", attendees: [{ studentId: "a", name: "María Soto", relation: "titular" }] };
const ctx = { today: "2026-11-07", courseStudentIds: ["a", "b"] };

describe("entrevistas y reuniones con apoderados", () => {
  it("acepta una entrevista completa", () => {
    expect(meetingIssues(base, ctx)).toEqual([]);
  });

  it("exige estudiante, asistentes, hora y contenido", () => {
    const issues = meetingIssues({ ...base, studentId: "z", time: "25:00", topics: "corto", agreements: "", attendees: [] }, ctx);
    expect(issues).toEqual(expect.arrayContaining([
      "Seleccione al estudiante del curso", "Indique la hora (HH:MM)", "Describa el motivo y los temas tratados (mínimo 10 caracteres)",
      "Registre los acuerdos (mínimo 5 caracteres)", "Indique quién asistió a la entrevista",
    ]));
  });

  it("no acepta fechas futuras ni RUN inválidos", () => {
    const issues = meetingIssues({ ...base, date: "2026-11-08", attendees: [{ studentId: "a", name: "María Soto", rut: "12345678-0", relation: "titular" }] }, ctx);
    expect(issues).toContain("La fecha no puede ser futura: se registra lo que ya ocurrió");
    expect(issues).toContain("El RUN de quien asistió no es válido");
  });

  it("en una reunión pide marcar a los asistentes del curso", () => {
    expect(meetingIssues({ ...base, kind: "reunion", studentId: undefined, attendees: [] }, ctx)).toEqual(["Marque a los apoderados que asistieron"]);
    expect(meetingIssues({ ...base, kind: "reunion", studentId: undefined, attendees: [{ studentId: "x", name: "Otra persona", relation: "titular" }] }, ctx)).toEqual(["Un asistente no corresponde a un estudiante del curso"]);
  });
});
