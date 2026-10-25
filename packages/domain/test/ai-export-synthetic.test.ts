import { describe, expect, it } from "vitest";
import { buildCopilotRequest, normalizeMath, SCHOOL_LEVELS, subjectsFor } from "../src/ai/copilot";
import { AiBlockedError, AiGateway, detectPersonalData } from "../src/ai/gateway";
import { EchoProvider } from "../src/ai/gemini";
import { courseReport } from "../src/analytics";
import { ATTENDANCE_TEMPLATE, checkAttendance, checkGrades, GRADES_TEMPLATE, toDelimited } from "../src/mineduc-export";
import { isValidRut } from "../src/rut";
import { demoWindow, generateSchool } from "../src/synthetic/generator";

const req = (over = {}) => ({
  task: "generate.material" as const,
  tenantId: "t1",
  userId: "u1",
  role: "teacher" as const,
  system: "s",
  prompt: "Guía de fracciones para 5° básico",
  ...over,
});

describe("AI Gateway", () => {
  it("bloquea el nivel gratuito cuando hay datos reales (puerta del go/no-go)", async () => {
    const g = new AiGateway(new EchoProvider(), { tier: "free", dataMode: "real", perUserPerMinute: 5, perUserPerDay: 50 });
    await expect(g.run(req())).rejects.toMatchObject({ code: "FREE_TIER_WITH_REAL_DATA" });
  });

  it("permite nivel gratuito con datos sintéticos", async () => {
    const g = new AiGateway(new EchoProvider(), { tier: "free", dataMode: "synthetic", perUserPerMinute: 5, perUserPerDay: 50 });
    const r = await g.run(req());
    expect(r.text).toContain("BORRADOR");
    expect(g.usage[0]).not.toHaveProperty("text"); // no persiste contenido
  });

  it("rechaza estudiantes y datos personales", async () => {
    const g = new AiGateway(new EchoProvider(), { tier: "paid", dataMode: "real", perUserPerMinute: 5, perUserPerDay: 50 });
    await expect(g.run(req({ role: "student" }))).rejects.toBeInstanceOf(AiBlockedError);
    await expect(g.run(req({ prompt: "Adaptar para el alumno 12.345.678-5" }))).rejects.toMatchObject({ code: "PERSONAL_DATA" });
    expect(detectPersonalData("Prueba para Martina González", ["Martina González"])).toContain("nombre de estudiante");
  });

  it("aplica cuota por minuto", async () => {
    const g = new AiGateway(new EchoProvider(), { tier: "free", dataMode: "synthetic", perUserPerMinute: 2, perUserPerDay: 50 });
    await g.run(req());
    await g.run(req());
    await expect(g.run(req())).rejects.toMatchObject({ code: "QUOTA_MINUTE" });
  });

  it("aplica un tope diario total aunque cambie el usuario", async () => {
    const g = new AiGateway(new EchoProvider(), { tier: "free", dataMode: "synthetic", perUserPerMinute: 5, perUserPerDay: 50, totalPerDay: 2 });
    await g.run(req({ userId: "u1" }));
    await g.run(req({ userId: "u2" }));
    await expect(g.run(req({ userId: "u3" }))).rejects.toMatchObject({ code: "QUOTA_TOTAL_DAY" });
  });

  it("construye solicitudes del Copiloto con versión de prompt", () => {
    const r = buildCopilotRequest({ kind: "prueba", subject: "Matemática", level: "7° Básico", objective: "OA 3", items: 8 });
    expect(r.task).toBe("generate.assessment");
    expect(r.prompt).toContain("8 preguntas");
    expect(r.promptVersion).toMatch(/^\d{4}-/);
    expect(r.prompt).toContain("6 de selección múltiple");
    expect(r.prompt).toContain("LaTeX");
  });

  it("ofrece las asignaturas de cada nivel, de 1° Básico a 4° Medio", () => {
    expect(SCHOOL_LEVELS).toHaveLength(12);
    expect(subjectsFor("1° Básico")).toContain("Lenguaje y Comunicación");
    expect(subjectsFor("7° Básico")).toContain("Lengua y Literatura");
    expect(subjectsFor("1° Medio")).toContain("Química");
    expect(subjectsFor("4° Medio")).toContain("Filosofía");
    expect(subjectsFor("4° Medio")).not.toContain("Tecnología");
    expect(subjectsFor("Kínder")).toEqual([]);
  });

  it("normaliza fórmulas sin confundir montos en pesos", () => {
    expect(normalizeMath("La fracción \\(\\frac{1}{2}\\) es igual a \\( \\frac{2}{4} \\).")).toBe("La fracción $$\\frac{1}{2}$$ es igual a $$\\frac{2}{4}$$.");
    expect(normalizeMath("Área:\n\\[ A = \\pi r^2 \\]\nListo")).toBe("Área:\n\n$$\nA = \\pi r^2\n$$\n\nListo");
    expect(normalizeMath("$$x^2 + 1$$")).toBe("$$\nx^2 + 1\n$$");
    expect(normalizeMath("Si $x^2 = 9$, entonces")).toBe("Si $$x^2 = 9$$, entonces");
    expect(normalizeMath("Cuesta $5.000 y el otro $3.000.")).toBe("Cuesta $5.000 y el otro $3.000.");
    expect(normalizeMath("Un total de hasta $16$ puntos.")).toBe("Un total de hasta 16 puntos.");
    expect(normalizeMath("Solución: \\( d > 1,25 \\) y \\( P(1, 2) \\)")).toBe("Solución: $$d > 1{,}25$$ y $$P(1, 2)$$");
  });
});

describe("colegio sintético y exportación MINEDUC", () => {
  const school = generateSchool(2026);

  it("es determinista y usa RUT válidos", () => {
    expect(generateSchool(2026).students[5]).toEqual(school.students[5]);
    expect(school.students).toHaveLength(120);
    expect(school.students.every((s) => isValidRut(s.rut))).toBe(true);
  });

  it("se genera hasta el último día hábil anterior al reinicio, con los mismos estudiantes", () => {
    expect(demoWindow("2026-10-26")).toEqual({ from: "2026-08-17", to: "2026-10-23" }); // lunes → viernes anterior
    expect(demoWindow("2026-10-24").to).toBe("2026-10-23"); // sábado → viernes
    expect(demoWindow("2026-10-22").to).toBe("2026-10-21"); // jueves → miércoles
    const w = demoWindow("2026-10-26");
    const current = generateSchool(2026, w);
    expect(current.schoolDays).toHaveLength(school.schoolDays.length);
    expect(current.schoolDays.at(-1)).toBe("2026-10-23");
    expect(current.students).toEqual(school.students); // Trinidad y sus compañeros no cambian
  });

  it("produce cursos con alertas y ranking de progreso", () => {
    const r = courseReport(school, "course-1");
    expect(r.ranking).toHaveLength(30);
    expect(r.summary.studentsWithAlerts).toBeGreaterThan(0);
  });

  it("exporta asistencia y notas con informe de consistencia", () => {
    const st = new Map(school.students.map((s) => [s.id, s]));
    const rows = school.attendance.slice(0, 50).map((record) => ({ student: st.get(record.studentId)!, record, rbd: school.rbd }));
    const csv = toDelimited(ATTENDANCE_TEMPLATE, rows);
    expect(csv.split("\r\n")[0]).toBe("RBD;RUN;DV;FECHA;ASISTENCIA");
    expect(checkAttendance([...rows, rows[0]!], [])).toContainEqual(expect.objectContaining({ severity: "error" }));
    const g = school.grades[0]!;
    const gRows = [{ student: st.get(g.studentId)!, grade: { ...g, value: 8 }, rbd: school.rbd }];
    expect(checkGrades(gRows)).toHaveLength(1);
    expect(toDelimited(GRADES_TEMPLATE, gRows)).toContain("8,0");
  });
});
