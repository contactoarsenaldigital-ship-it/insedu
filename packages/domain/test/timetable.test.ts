import { describe, expect, it } from "vitest";
import {
  bellIssues, blocksOn, blockWindow, DEFAULT_BELLS, exampleSchedule, periodsOfBlock, scheduleIssues, secondHourEnd, weekdayOf, withinBlock,
  type ScheduleSlot,
} from "../src/timetable";

const slot = (extra: Partial<ScheduleSlot>): ScheduleSlot => ({ id: "x", courseId: "c1", subjectId: "mat", weekday: 1, period: 1, ...extra });

describe("horario", () => {
  it("valida la jornada", () => {
    expect(bellIssues(DEFAULT_BELLS)).toEqual([]);
    // Formato inválido y además comienza antes de que termine la hora anterior.
    expect(bellIssues([{ number: 1, start: "08:00", end: "08:45" }, { number: 2, start: "08:30", end: "8:00" }])).toHaveLength(2);
    expect(bellIssues([{ number: 1, start: "08:00", end: "08:45" }, { number: 2, start: "08:30", end: "09:15" }])).toEqual(["Hora 2 comienza antes de que termine la hora 1"]);
    expect(bellIssues([{ number: 1, start: "09:00", end: "08:45" }])).toEqual(["Hora 1: el término debe ser posterior al inicio"]);
  });

  it("detecta choques de docente y horas repetidas", () => {
    const ctx = { bells: DEFAULT_BELLS, teacherOf: (s: string) => (s.startsWith("mat") ? "t1" : "t2"), others: [slot({ courseId: "c2", subjectId: "mat2" })], label: (s: string) => s };
    expect(scheduleIssues([{ courseId: "c1", subjectId: "len", weekday: 1, period: 1 }], ctx)).toEqual([]);
    expect(scheduleIssues([{ courseId: "c1", subjectId: "mat", weekday: 1, period: 1 }], ctx)[0]).toContain("ya tiene clase en otro curso");
    expect(scheduleIssues([{ courseId: "c1", subjectId: "len", weekday: 1, period: 9 }], ctx)).toEqual(["La hora 9 no existe en la jornada"]);
  });

  it("lee los bloques y sus horas", () => {
    expect(periodsOfBlock("1-2")).toEqual([1, 2]);
    expect(periodsOfBlock("5")).toEqual([5]);
    expect(blockWindow(DEFAULT_BELLS, "3-4")).toEqual({ start: "09:45", end: "11:15" });
    expect(withinBlock(DEFAULT_BELLS, "1-2", "09:10")).toBe(true);
    expect(withinBlock(DEFAULT_BELLS, "1-2", "10:00")).toBe(false);
    expect(secondHourEnd(DEFAULT_BELLS)).toBe("09:30");
  });

  it("une horas consecutivas del día", () => {
    expect(weekdayOf("2026-10-05")).toBe(1);
    const slots = [slot({ period: 1 }), slot({ period: 2 }), slot({ period: 5 }), slot({ period: 3, subjectId: "len" }), slot({ weekday: 2, period: 4 })];
    expect(blocksOn(slots, "mat", "2026-10-05")).toEqual(["1-2", "5"]);
  });

  it("arma un horario de ejemplo sin choques", () => {
    let n = 0;
    const courses = ["c1", "c2"].map((id) => ({ id, subjects: [{ id: `${id}-mat`, teacherId: "t1" }, { id: `${id}-len`, teacherId: "t2" }, { id: `${id}-his`, teacherId: "t3" }] }));
    const slots = exampleSchedule(courses, DEFAULT_BELLS, () => `s${++n}`);
    expect(slots.length).toBeGreaterThan(40);
    const teacher = (s: string) => courses.flatMap((c) => c.subjects).find((x) => x.id === s)!.teacherId;
    const keys = slots.map((s) => `${teacher(s.subjectId)}|${s.weekday}|${s.period}`);
    expect(new Set(keys).size).toBe(keys.length);
    const perCourse = slots.map((s) => `${s.courseId}|${s.weekday}|${s.period}`);
    expect(new Set(perCourse).size).toBe(perCourse.length);
  });
});
