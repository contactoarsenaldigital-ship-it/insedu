import { NextResponse } from "next/server";
import { localDate, recognize, syncQueue, type ScanContext, type ScanEvent } from "@insedu/domain";
import { courseById, fullName, school } from "@/lib/demo";
import { award } from "@/lib/rewards";
import { withState } from "@/lib/state";

/**
 * Sincronización de escaneos de credenciales.
 * Cada escaneo aceptado queda como registro de asistencia del día (id = clientId del dispositivo),
 * y el control de duplicados se reconstruye desde esos registros: funciona igual aunque cada
 * escaneo llegue a una instancia distinta del servidor.
 */
function contextFor(date: string): ScanContext {
  const s = school();
  const byRut = new Map(s.students.map((st) => [st.rut, st]));
  const ruts = new Map(s.students.map((st) => [st.id, st.rut]));
  const today = s.attendance.filter((a) => a.date === date && a.source === "credential_scan");
  return {
    findStudent: (tenantId, rut) => {
      const st = tenantId === s.tenantId ? byRut.get(rut) : undefined;
      return st ? { id: st.id, courseStart: courseById(st.courseId)!.startTime } : undefined;
    },
    acceptedToday: new Map(today.map((a) => [ruts.get(a.studentId)!, { at: a.arrivedAt ?? `${a.date}T11:00:00Z`, deviceId: a.recordedBy }])),
    processedClientIds: new Set(today.map((a) => a.id)),
    toleranceMinutes: 5,
    timeZone: s.timeZone,
  };
}

const MAX_BATCH = 200;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { events?: ScanEvent[] } | null;
  const events = body?.events;
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_BATCH) {
    return NextResponse.json({ error: "Lote inválido" }, { status: 400 });
  }
  return withState(async () => {
    const s = school();
    const byRut = new Map(s.students.map((st) => [st.rut, st]));
    const results = [];
    for (const group of groupByDate(events, s.timeZone)) {
      const ctx = contextFor(group.date);
      for (const { clientId, outcome } of syncQueue(group.events, ctx)) {
        const st = "rut" in outcome ? byRut.get(outcome.rut) : undefined;
        const ev = group.events.find((e) => e.clientId === clientId)!;
        if (st && outcome.kind === "recorded") {
          s.attendance.push({
            id: clientId,
            tenantId: s.tenantId,
            studentId: st.id,
            date: group.date,
            status: outcome.status,
            arrivedAt: ev.scannedAt,
            source: "credential_scan",
            recordedBy: ev.deviceId,
          });
          // Condicionamiento: llegar a tiempo se asocia de inmediato a un reconocimiento.
          if (outcome.status === "present") award(st.id, recognize({ type: "arrived_on_time", date: group.date }), "asistencia", clientId);
        }
        results.push({
          clientId,
          outcome,
          student:
            st && outcome.kind === "recorded"
              ? { name: fullName(st), course: courseById(st.courseId)!.name, initials: `${st.firstName[0]}${st.lastName[0]}` }
              : undefined,
        });
      }
    }
    return NextResponse.json({ results });
  });
}

function groupByDate(events: ScanEvent[], tz: string) {
  const m = new Map<string, ScanEvent[]>();
  for (const e of events) {
    const d = localDate(e.scannedAt, tz);
    m.set(d, [...(m.get(d) ?? []), e]);
  }
  return [...m.entries()].map(([date, evs]) => ({ date, events: evs }));
}
