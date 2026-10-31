import { describe, expect, it } from "vitest";
import { parseCourseName, parseDate, parseDelimited, parseSubjects, readTable, rolesFromProfile, templateCsv } from "../src/bulk-import";

describe("lectura de archivos", () => {
  it("detecta el separador y respeta comillas", () => {
    expect(parseDelimited("﻿a;b;c\r\n1;\"x;y\";3\n\n")).toEqual([["a", "b", "c"], ["1", "x;y", "3"]]);
    expect(parseDelimited("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseDelimited("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseDelimited('a;b\n"dice ""hola""";2')).toEqual([["a", "b"], ['dice "hola"', "2"]]);
  });

  it("reconoce cursos escritos de distintas formas", () => {
    expect(parseCourseName("7° Básico A")).toEqual({ name: "7° Básico A", level: "7° Básico" });
    expect(parseCourseName("7 basico b")).toEqual({ name: "7° Básico B", level: "7° Básico" });
    expect(parseCourseName("1° medio c")).toEqual({ name: "1° Medio C", level: "1° Medio" });
    expect(parseCourseName("2M")).toEqual({ name: "2° Medio A", level: "2° Medio" });
    expect(parseCourseName("9° Básico A")).toBeNull();
    expect(parseCourseName("Kínder")).toBeNull();
  });

  it("interpreta fechas chilenas e ISO", () => {
    expect(parseDate("14-05-2013")).toBe("2013-05-14");
    expect(parseDate("2010/11/02")).toBe("2010-11-02");
    expect(parseDate("31-02-2012")).toBeNull();
  });

  it("lee asignaturas por curso y perfiles", () => {
    expect(parseSubjects("7° Básico A: Matemática | 8° Básico A: Lenguaje")).toEqual([
      { course: "7° Básico A", subject: "Matemática" },
      { course: "8° Básico A", subject: "Lenguaje" },
    ]);
    expect(rolesFromProfile("Docente, Psicología")).toEqual(["teacher", "psychologist"]);
  });
});

describe("validación de filas", () => {
  it("la plantilla de cada tipo es válida", () => {
    for (const kind of ["estudiantes", "funcionarios", "apoderados"] as const) {
      const t = readTable(kind, parseDelimited(templateCsv(kind)));
      expect(t.missing).toEqual([]);
      expect(t.rows.flatMap((r) => r.issues)).toEqual([]);
    }
  });

  it("acepta encabezados con otros nombres y marca errores por fila", () => {
    const t = readTable("estudiantes", [
      ["RUT", "Nombre", "Apellido", "Curso", "Sexo"],
      ["12.345.678-5", "Ana", "Soto", "7 basico a", "f"],
      ["12345678-5", "Ana", "Soto", "7° Básico A", ""],
      ["11.111.111-2", "", "Pérez", "Kínder", "x"],
    ]);
    expect(t.missing).toEqual([]);
    expect(t.rows[0]!.issues).toEqual([]);
    expect(t.rows[1]!.issues).toEqual(["Repetido en el archivo (línea 2)"]);
    expect(t.rows[2]!.issues).toEqual(["Falta nombres", "RUN no válido", "Curso no reconocido (ejemplo: 7° Básico A)", "Sexo: use F o M"]);
  });

  it("informa columnas obligatorias que faltan", () => {
    expect(readTable("apoderados", [["RUN", "Nombres", "Correo"]]).missing).toEqual(["Apellidos", "RUN del estudiante"]);
  });

  it("un apoderado puede repetirse con distintos pupilos", () => {
    const t = readTable("apoderados", [
      ["RUN", "Nombres", "Apellidos", "Correo", "RUN del estudiante"],
      ["15.678.901-1", "Paula", "Rojas", "p@x.cl", "23.456.789-6"],
      ["15.678.901-1", "Paula", "Rojas", "p@x.cl", "24.123.456-8"],
    ]);
    expect(t.rows.flatMap((r) => r.issues)).toEqual([]);
  });
});
