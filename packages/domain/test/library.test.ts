import { describe, expect, it } from "vitest";
import {
  availabilityOf, copyConditionIssues, copyState, daysLate, defaultDueDate, formatLibraryCode, isValidIsbn10, isValidIsbn13, libraryItemIssues, loanIssues, loanState, readLibraryCode, renewalIssues, searchLibrary,
  type LibraryCopy, type LibraryItem, type LibraryLoan,
} from "../src/library";

const copy = (id: string, condition: LibraryCopy["condition"] = "activo"): LibraryCopy => ({ id, itemId: "i", number: 1, condition, by: "b", at: "t" });
const loan = (extra: Partial<LibraryLoan> = {}): LibraryLoan => ({ id: "l", itemId: "i", copyId: "c1", borrowerId: "e", borrowerKind: "estudiante", loanedOn: "2026-11-01", dueOn: "2026-11-15", renewals: 0, by: "b", at: "t", ...extra });
const item = (extra: Partial<LibraryItem>): LibraryItem => ({ id: "x", kind: "libro", medium: "fisico", title: "Título", by: "b", at: "t", ...extra });

describe("Biblioteca", () => {
  it("reconoce ISBN-13 e ISBN-10 con su dígito verificador", () => {
    expect(isValidIsbn13("9780306406157")).toBe(true);
    expect(isValidIsbn13("9780306406158")).toBe(false);
    expect(isValidIsbn10("0306406152")).toBe(true);
    expect(isValidIsbn10("0306406153")).toBe(false);
  });

  it("normaliza lo leído y lleva el ISBN-10 a ISBN-13", () => {
    expect(readLibraryCode("ISBN 978-0-306-40615-7")).toEqual({ code: "9780306406157", type: "isbn" });
    expect(readLibraryCode("0-306-40615-2")).toEqual({ code: "9780306406157", type: "isbn" });
    expect(readLibraryCode("9771234567003")?.type).toBe("issn");
    expect(readLibraryCode("BIB-00123")).toEqual({ code: "BIB00123", type: "otro" });
    expect(readLibraryCode("<script>")).toBeNull();
    expect(readLibraryCode("   ")).toBeNull();
    expect(formatLibraryCode("9780306406157")).toBe("9780306406157");
  });

  it("calcula el stock desde ejemplares y préstamos abiertos", () => {
    const copies = [copy("c1"), copy("c2"), copy("c3", "reparacion"), copy("c4", "perdido"), copy("c5", "baja")];
    const loans = [loan(), loan({ id: "antiguo", copyId: "c2", returnedOn: "2026-11-05" })];
    expect(copyState(copies[0]!, loans)).toBe("prestado");
    expect(copyState(copies[1]!, loans)).toBe("disponible");
    expect(availabilityOf(copies, loans)).toEqual({ total: 3, available: 1, onLoan: 1, unavailable: 1 });
  });

  it("clasifica los préstamos según su vencimiento", () => {
    expect(loanState(loan(), "2026-11-05")).toBe("vigente");
    expect(loanState(loan(), "2026-11-13")).toBe("por_vencer");
    expect(loanState(loan(), "2026-11-16")).toBe("atrasado");
    expect(loanState(loan({ returnedOn: "2026-11-20" }), "2026-11-25")).toBe("devuelto");
    expect(daysLate(loan(), "2026-11-20")).toBe(5);
    expect(daysLate(loan(), "2026-11-10")).toBe(0);
  });

  it("propone devolución en día hábil", () => {
    expect(defaultDueDate("2026-11-02", "libro")).toBe("2026-11-16");
    expect(defaultDueDate("2026-11-07", "video")).toBe("2026-11-16"); // el sábado siguiente pasa al lunes
  });

  it("busca por título, autor o código, sin importar tildes", () => {
    const items = [item({ id: "a", title: "Cien años de soledad", author: "Gabriel García Márquez", code: "9780306406157" }), item({ id: "b", title: "Subterra", author: "Baldomero Lillo", kind: "revista" })];
    expect(searchLibrary(items, "cien anos").map((i) => i.id)).toEqual(["a"]);
    expect(searchLibrary(items, "garcia marquez").map((i) => i.id)).toEqual(["a"]);
    expect(searchLibrary(items, "978-0-306-40615-7").map((i) => i.id)).toEqual(["a"]);
    expect(searchLibrary(items, "0306406152").map((i) => i.id)).toEqual(["a"]);
    expect(searchLibrary(items, "", "revista").map((i) => i.id)).toEqual(["b"]);
    expect(searchLibrary(items, "inexistente")).toEqual([]);
  });

  it("valida los datos del título", () => {
    const ctx = { thisYear: 2026, codeTaken: false, requireCopies: true };
    expect(libraryItemIssues({ kind: "libro", medium: "fisico", title: "Subterra", copies: "3" }, ctx)).toEqual([]);
    expect(libraryItemIssues({ kind: "x", medium: "y", title: "", copies: "0", year: "3000", link: "http://a" }, ctx)).toEqual([
      "Indique el tipo de material", "Indique si es físico o digital", "Escriba el título", "El año no es válido", "El enlace debe comenzar con https://", "Indique cuántos ejemplares son (1 a 200)",
    ]);
    expect(libraryItemIssues({ kind: "libro", medium: "fisico", title: "Subterra", copies: "1" }, { ...ctx, codeTaken: true })).toContain("Ya existe un título con ese código: agregue ejemplares en su ficha");
  });

  it("controla los préstamos", () => {
    const ok = { dueOn: "2026-11-20", today: "2026-11-08", borrowerKnown: true, borrowerKind: "estudiante" as const, activeLoans: 0, copyAvailable: true };
    expect(loanIssues(ok)).toEqual([]);
    expect(loanIssues({ ...ok, copyAvailable: false, borrowerKnown: false, dueOn: "2026-11-08" })).toEqual(["Ese ejemplar no está disponible", "Elija a quién se presta", "La fecha de devolución debe ser posterior a hoy"]);
    expect(loanIssues({ ...ok, activeLoans: 3 })).toEqual(["El estudiante ya tiene 3 préstamos abiertos"]);
    expect(loanIssues({ ...ok, activeLoans: 9, borrowerKind: "funcionario" })).toEqual([]);
    expect(loanIssues({ ...ok, dueOn: "2027-06-01" })).toEqual(["El plazo no puede superar 90 días"]);
  });

  it("limita las renovaciones", () => {
    expect(renewalIssues(loan(), "2026-11-30", "2026-11-10")).toEqual([]);
    expect(renewalIssues(loan({ renewals: 2 }), "2026-11-30", "2026-11-10")).toEqual(["Se alcanzó el máximo de 2 renovaciones"]);
    expect(renewalIssues(loan({ returnedOn: "2026-11-05" }), "2026-11-30", "2026-11-10")).toEqual(["Ese préstamo ya fue devuelto"]);
    expect(renewalIssues(loan(), "2026-11-14", "2026-11-10")).toEqual(["La nueva fecha debe ser posterior a la actual"]);
  });

  it("un ejemplar prestado solo puede marcarse como perdido", () => {
    expect(copyConditionIssues(copy("c1"), [loan()], "reparacion")).toEqual(["Ese ejemplar está prestado: registre primero su devolución"]);
    expect(copyConditionIssues(copy("c1"), [loan()], "perdido")).toEqual([]);
    expect(copyConditionIssues(copy("c1"), [], "baja")).toEqual([]);
    expect(copyConditionIssues(copy("c1"), [], "x")).toEqual(["Estado no reconocido"]);
  });
});
