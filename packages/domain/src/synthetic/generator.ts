/**
 * Colegio sintético de demostración (Etapa 1). Determinista por semilla.
 * Todos los nombres y RUT son ficticios: los RUT se generan en el rango 70.000.000-79.999.999
 * con dígito verificador válido y marcados como sintéticos. No corresponden a datos reales usados por INSEDU.
 */
import { computeDv } from "../rut";
import type {
  AttendanceRecord,
  AttendanceStatus,
  ConductRecord,
  Course,
  GradeRecord,
  HealthVisit,
  Student,
} from "../types";

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Martina", "Sofía", "Florencia", "Isidora", "Antonella", "Agustina", "Emilia", "Josefa", "Catalina", "Trinidad",
  "Benjamín", "Vicente", "Agustín", "Tomás", "Mateo", "Joaquín", "Maximiliano", "Lucas", "Gaspar", "Cristóbal",
  "Amanda", "Renata", "Valentina", "Fernanda", "Javiera", "Diego", "Martín", "Felipe", "Ignacio", "Bastián",
];
const LAST = [
  "González", "Muñoz", "Rojas", "Díaz", "Pérez", "Soto", "Contreras", "Silva", "Martínez", "Sepúlveda",
  "Morales", "Rodríguez", "López", "Fuentes", "Hernández", "Torres", "Araya", "Flores", "Espinoza", "Valenzuela",
  "Castillo", "Tapia", "Reyes", "Gutiérrez", "Castro", "Pizarro", "Álvarez", "Vásquez", "Sánchez", "Fernández",
];
export const SUBJECTS = ["Lenguaje", "Matemática", "Historia", "Ciencias", "Inglés", "Ed. Física"];

export type SyntheticSchool = {
  tenantId: string;
  name: string;
  rbd: string;
  timeZone: string;
  courses: Course[];
  students: Student[];
  attendance: AttendanceRecord[];
  grades: GradeRecord[];
  conduct: ConductRecord[];
  health: HealthVisit[];
  schoolDays: string[];
  /** Fecha de corte entre línea base y periodo actual. */
  cutoff: string;
};

/** Días hábiles (lunes a viernes) entre dos fechas inclusive. */
export function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) {
    const wd = d.getUTCDay();
    if (wd >= 1 && wd <= 5) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

type Profile = { attendance: number; lateness: number; grade: number; trend: number; conduct: number; health: number };

export function generateSchool(seed = 2026, opts?: { from?: string; to?: string; perCourse?: number }): SyntheticSchool {
  const rnd = mulberry32(seed);
  const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]!;
  const tenantId = "00000000-0000-7000-8000-000000000001";
  const from = opts?.from ?? "2026-08-03";
  const to = opts?.to ?? "2026-10-09";
  const perCourse = opts?.perCourse ?? 30;
  const schoolDays = weekdays(from, to);
  const cutoff = schoolDays[Math.floor(schoolDays.length / 2)]!;

  const courseDefs = [
    { name: "5° Básico A", level: "5° Básico", start: "08:00" },
    { name: "7° Básico A", level: "7° Básico", start: "08:00" },
    { name: "1° Medio A", level: "1° Medio", start: "08:00" },
    { name: "2° Medio A", level: "2° Medio", start: "08:00" },
  ];
  const courses: Course[] = courseDefs.map((c, i) => ({
    id: `course-${i + 1}`,
    tenantId,
    name: c.name,
    level: c.level,
    headTeacherId: `teacher-${i + 1}`,
    startTime: c.start,
  }));

  const students: Student[] = [];
  const profiles = new Map<string, Profile>();
  let seq = 0;
  for (const course of courses) {
    for (let k = 0; k < perCourse; k++) {
      seq++;
      const body = 70_000_000 + Math.floor(rnd() * 9_999_999);
      const id = `student-${String(seq).padStart(3, "0")}`;
      students.push({
        id,
        tenantId,
        rut: `${body}${computeDv(body)}`,
        firstName: pick(FIRST),
        lastName: `${pick(LAST)} ${pick(LAST)}`,
        courseId: course.id,
      });
      // ~20 % con indicadores deficitarios; una parte de ellos mejora en el periodo actual.
      const atRisk = rnd() < 0.2;
      profiles.set(id, {
        attendance: atRisk ? 0.72 + rnd() * 0.12 : 0.88 + rnd() * 0.11,
        lateness: atRisk ? 0.12 + rnd() * 0.1 : rnd() * 0.06,
        grade: atRisk ? 3.6 + rnd() * 1.0 : 4.8 + rnd() * 1.9,
        trend: atRisk ? (rnd() < 0.5 ? 0.6 : -0.3) : (rnd() - 0.5) * 0.4,
        conduct: atRisk ? 0.08 : 0.02,
        health: atRisk ? 0.05 : 0.015,
      });
    }
  }

  const attendance: AttendanceRecord[] = [];
  const conduct: ConductRecord[] = [];
  const health: HealthVisit[] = [];
  let n = 0;
  for (const s of students) {
    const p = profiles.get(s.id)!;
    for (const day of schoolDays) {
      const after = day >= cutoff;
      const att = Math.min(0.99, p.attendance + (after && p.trend > 0 ? 0.08 : 0));
      let status: AttendanceStatus = rnd() < att ? "present" : rnd() < 0.3 ? "justified" : "absent";
      let arrivedAt: string | undefined;
      if (status === "present") {
        const late = rnd() < p.lateness;
        if (late) status = "late";
        const minutes = late ? 10 + Math.floor(rnd() * 35) : Math.floor(rnd() * 20) - 25;
        const t = new Date(`${day}T11:00:00Z`); // 08:00 en Chile (UTC-3)
        t.setUTCMinutes(t.getUTCMinutes() + minutes);
        arrivedAt = t.toISOString();
      }
      attendance.push({
        id: `att-${++n}`,
        tenantId,
        studentId: s.id,
        date: day,
        status,
        arrivedAt,
        source: "credential_scan",
        recordedBy: "gate-1",
      });
      if (rnd() < p.conduct * (after && p.trend > 0 ? 0.4 : 1)) {
        const sev = rnd();
        conduct.push({
          id: `con-${++n}`,
          studentId: s.id,
          date: day,
          kind: "negative",
          severity: sev < 0.85 ? "leve" : sev < 0.97 ? "grave" : "gravisima",
          description: pick(["No trae materiales", "Interrumpe la clase", "Uso indebido de dispositivo", "Falta de respeto a un compañero"]),
          recordedBy: "teacher-1",
        });
      }
      if (rnd() < 0.04 + (after && p.trend > 0 ? 0.03 : 0)) {
        conduct.push({
          id: `con-${++n}`,
          studentId: s.id,
          date: day,
          kind: rnd() < 0.15 ? "commendation" : "positive",
          description: pick(["Ayuda a un compañero", "Participación destacada", "Liderazgo en trabajo grupal", "Mejora sostenida"]),
          recordedBy: "teacher-1",
        });
      }
      if (rnd() < p.health) {
        health.push({
          id: `hv-${++n}`,
          studentId: s.id,
          date: day,
          reason: pick(["Dolor de cabeza", "Dolor abdominal", "Golpe en recreo", "Malestar general"]),
          sentHome: rnd() < 0.15,
        });
      }
    }
  }

  const grades: GradeRecord[] = [];
  const gradeDays = schoolDays.filter((_, i) => i % 7 === 3);
  for (const s of students) {
    const p = profiles.get(s.id)!;
    for (const subject of SUBJECTS) {
      for (const day of gradeDays) {
        const progress = (schoolDays.indexOf(day) / schoolDays.length) * p.trend;
        const value = Math.round(Math.min(7, Math.max(1, p.grade + progress + (rnd() - 0.5) * 1.2)) * 10) / 10;
        grades.push({ id: `gr-${++n}`, studentId: s.id, subject, date: day, value });
      }
    }
  }

  return {
    tenantId,
    name: "Colegio Demostración Los Aromos (ficticio)",
    rbd: "00000",
    timeZone: "America/Santiago",
    courses,
    students,
    attendance,
    grades,
    conduct,
    health,
    schoolDays,
    cutoff,
  };
}
