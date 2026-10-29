import { describe, expect, it } from "vitest";
import { analyzeSociogram, answerIssues, circleOrder, SOCIOMETRIC_QUESTIONS, summarize, type Question } from "../src/surveys";

const ids = ["a", "b", "c", "d", "e", "f"];
const r = (respondentId: string, trabajo: string[], extra: Record<string, string[]> = {}) => ({ respondentId, answers: { trabajo, recreo: [], ...extra } });

describe("sociograma", () => {
  it("cuenta elecciones recibidas, reciprocidad y mejores amigos", () => {
    const res = analyzeSociogram(ids, [
      r("a", ["b", "c"], { amistad: ["b"] }),
      r("b", ["a"], { amistad: ["a"] }),
      r("c", ["a", "b"]),
      r("d", ["a"]),
      r("e", ["a", "b"]),
    ]);
    const by = Object.fromEntries(res.students.map((s) => [s.id, s]));
    expect(by.a!.positive).toBe(4);
    expect(by.a!.mutual).toBe(2); // con b y c
    expect(by.b!.bestFriendMutual).toBe(true);
    expect(by.f!.positive).toBe(0);
    expect(by.f!.answered).toBe(false);
    expect(by.f!.status).toBe("aislado");
    expect(by.d!.status).toBe("aislado");
    expect(by.a!.status).toBe("popular");
    expect(by.e!.status).toBe("aislado");
    expect(by.c!.status).toBe("integrado"); // c y a se eligen
    // Elegido por alguien pero sin responder: no se marca «sin reciprocidad».
    const res2 = analyzeSociogram(ids, [r("a", ["f"])]);
    expect(res2.students.find((s) => s.id === "f")!.status).toBe("integrado");
    expect(res.respondents).toBe(5);
    expect(res.cohesion).toBeCloseTo(2 / 10);
  });

  it("marca a quien recibe varias menciones de dificultad", () => {
    const res = analyzeSociogram(ids, [
      r("a", ["b"], { cuesta: ["f"] }),
      r("b", ["a"], { cuesta: ["f"] }),
      r("c", ["d"], { cuesta: ["f"] }),
      r("d", ["c"]),
      r("f", ["a"]),
    ]);
    expect(res.students.find((s) => s.id === "f")!.status).toBe("rechazado");
    expect(res.negativeEdges).toHaveLength(3);
  });

  it("ignora autoelecciones y estudiantes de otro curso", () => {
    const res = analyzeSociogram(ids, [r("a", ["a", "zz", "b"])]);
    expect(res.positiveEdges).toEqual([{ from: "a", to: "b", weight: 1, mutual: false }]);
  });

  it("ordena en círculo dejando juntos a quienes se eligen", () => {
    const order = circleOrder(ids, [
      { from: "a", to: "b", weight: 1, mutual: true },
      { from: "b", to: "a", weight: 1, mutual: true },
      { from: "d", to: "e", weight: 1, mutual: false },
    ]);
    expect(order).toHaveLength(6);
    expect(Math.abs(order.indexOf("a") - order.indexOf("b"))).toBe(1);
    expect(order.slice(-2).sort()).toEqual(["c", "f"]);
  });
});

describe("respuestas", () => {
  it("valida obligatorias, máximos y compañeros válidos", () => {
    const issues = answerIssues(SOCIOMETRIC_QUESTIONS, { trabajo: ["b", "c", "d", "e"], recreo: ["zz"] }, ["b", "c", "d", "e"]);
    expect(issues).toHaveLength(2);
    expect(answerIssues(SOCIOMETRIC_QUESTIONS, { trabajo: ["b"], recreo: ["c"] }, ["b", "c"])).toEqual([]);
  });

  it("resume escalas y opciones", () => {
    const q: Question = { id: "q", text: "Me siento seguro", type: "escala", required: true };
    const s = summarize(q, [{ q: 4 }, { q: 5 }, { q: 3 }, {}]);
    expect(s).toEqual({ type: "escala", count: 3, average: 4, distribution: [0, 0, 1, 1, 1] });
    const o: Question = { id: "o", text: "Turno", type: "opcion", required: true, options: ["Mañana", "Tarde"] };
    expect(summarize(o, [{ o: "Tarde" }, { o: "Tarde" }])).toMatchObject({ counts: [{ option: "Mañana", n: 0 }, { option: "Tarde", n: 2 }] });
  });
});
