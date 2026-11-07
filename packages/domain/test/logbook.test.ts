import { describe, expect, it } from "vitest";
import { dateWithTimeZone, otpRut, verifyMineducOtp } from "../src/auth/mineduc-otp";
import { appendEvent, verifyLogbook, type LogbookEvent } from "../src/logbook";

const add = (log: LogbookEvent[], n: number) =>
  appendEvent(log, { actor: "docente", action: "crear", entity: "nota", recordId: `r${n}`, after: n }, `e${n}`, `2026-11-06T12:00:0${n}.000Z`);

describe("bitácora", () => {
  it("encadena eventos y verifica íntegra", () => {
    const log: LogbookEvent[] = [];
    add(log, 1);
    const b = add(log, 2);
    expect(b.prev).toBe(log[0]!.hash);
    expect(verifyLogbook(log)).toEqual({ ok: true, checked: 2, altered: [], missingPrevious: [] });
  });

  it("detecta un evento alterado", () => {
    const log: LogbookEvent[] = [];
    add(log, 1);
    add(log, 2);
    log[0]!.after = 999;
    const c = verifyLogbook(log);
    expect(c.ok).toBe(false);
    expect(c.altered).toEqual(["e1"]);
  });

  it("detecta un evento borrado del que otro depende", () => {
    const log: LogbookEvent[] = [];
    add(log, 1);
    add(log, 2);
    add(log, 3);
    log.splice(1, 1);
    expect(verifyLogbook(log).missingPrevious).toEqual(["e3"]);
  });

  it("acepta bifurcaciones de dos instancias que escriben a la vez", () => {
    const shared: LogbookEvent[] = [];
    add(shared, 1);
    const otra = [...shared];
    add(shared, 2);
    add(otra, 3);
    const merged = [...shared, otra.at(-1)!];
    expect(merged[1]!.prev).toBe(merged[2]!.prev);
    expect(verifyLogbook(merged).ok).toBe(true);
  });
});

describe("verificador del Mineduc", () => {
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const input = { rut: "12.345.678-5", otp: "123456" };

  it("arma la consulta con el formato de la documentación", async () => {
    let url = "";
    const fetchImpl = (async (u: string) => {
      url = u;
      return new Response("true");
    }) as unknown as typeof fetch;
    await verifyMineducOtp({ ...input, at: new Date("2026-07-01T16:00:00Z") }, { fetchImpl });
    const q = new URL(url).searchParams;
    expect(url.startsWith("https://apiede.mineduc.cl/otp/verify-otp?")).toBe(true);
    expect(q.get("rut")).toBe("12345678-5");
    expect(q.get("otp")).toBe("123456");
    expect(q.get("DateWithTimeZone")).toMatch(/^2026-07-01T\d\d:00:00-0[34]:00$/);
  });

  it("solo acepta un indicador booleano verdadero", async () => {
    expect(await verifyMineducOtp(input, { fetchImpl: reply(200, true) })).toBe("valido");
    expect(await verifyMineducOtp(input, { fetchImpl: reply(200, { verified: true }) })).toBe("valido");
    expect(await verifyMineducOtp(input, { fetchImpl: reply(200, { verified: false }) })).toBe("invalido");
    expect(await verifyMineducOtp(input, { fetchImpl: reply(200, { message: "RUT_NO_EXISTE" }) })).toBe("invalido");
    expect(await verifyMineducOtp(input, { fetchImpl: reply(400, { message: "Invalid request body" }) })).toBe("invalido");
  });

  it("sin servicio nunca da la firma por válida", async () => {
    expect(await verifyMineducOtp(input, { fetchImpl: reply(503, {}) })).toBe("sin_servicio");
    const roto = (async () => {
      throw new Error("red");
    }) as unknown as typeof fetch;
    expect(await verifyMineducOtp(input, { fetchImpl: roto })).toBe("sin_servicio");
  });

  it("rechaza sin consultar un código mal formado", async () => {
    const nunca = (async () => {
      throw new Error("no debía llamar");
    }) as unknown as typeof fetch;
    expect(await verifyMineducOtp({ ...input, otp: "12" }, { fetchImpl: nunca })).toBe("invalido");
  });

  it("normaliza el RUN y la fecha", () => {
    expect(otpRut("24.567.890-k")).toBe("24567890-K");
    expect(dateWithTimeZone(new Date("2026-01-15T15:00:00Z"))).toBe("2026-01-15T12:00:00-03:00");
  });
});
