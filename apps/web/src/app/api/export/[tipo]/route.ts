import { NextResponse } from "next/server";
import {
  ATTENDANCE_TEMPLATE,
  checkAttendance,
  checkGrades,
  GRADES_TEMPLATE,
  toDelimited,
} from "@insedu/domain";
import { school } from "@/lib/demo";
import { canExportMineduc, getSession } from "@/lib/session";
import { readState } from "@/lib/state";

/** Descarga de archivos para el encargado de informática (Etapa 1: colegio sintético). */
export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  await readState();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Ingrese para descargar." }, { status: 401 });
  if (!canExportMineduc(session)) return NextResponse.json({ error: "Solo dirección y administración exportan a MINEDUC." }, { status: 403 });
  const { tipo } = await params;
  const url = new URL(req.url);
  const s = school();
  const st = new Map(s.students.map((x) => [x.id, x]));

  if (tipo === "asistencia" || tipo === "asistencia-informe") {
    const from = url.searchParams.get("desde") ?? s.schoolDays.at(-5)!;
    const to = url.searchParams.get("hasta") ?? s.schoolDays.at(-1)!;
    const rows = s.attendance
      .filter((a) => a.date >= from && a.date <= to)
      .map((record) => ({ student: st.get(record.studentId)!, record, rbd: s.rbd }));
    if (tipo === "asistencia-informe") {
      return NextResponse.json({ desde: from, hasta: to, filas: rows.length, problemas: checkAttendance(rows, s.schoolDays.filter((d) => d >= from && d <= to)) });
    }
    return file(toDelimited(ATTENDANCE_TEMPLATE, rows), `asistencia_${s.rbd}_${from}_${to}.csv`);
  }

  if (tipo === "notas" || tipo === "notas-informe") {
    const rows = s.grades.map((grade) => ({ student: st.get(grade.studentId)!, grade, rbd: s.rbd }));
    if (tipo === "notas-informe") return NextResponse.json({ filas: rows.length, problemas: checkGrades(rows) });
    return file(toDelimited(GRADES_TEMPLATE, rows), `calificaciones_${s.rbd}.csv`);
  }

  return NextResponse.json({ error: "Tipo de exportación no reconocido" }, { status: 404 });
}

function file(content: string, name: string) {
  // BOM para que Excel abra correctamente tildes y eñes.
  return new NextResponse("﻿" + content, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
