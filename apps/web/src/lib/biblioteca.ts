import "server-only";
import {
  availabilityOf, copyState, COPY_STATE_LABEL, daysLate, defaultDueDate, formatLibraryCode, isOpenLoan, LIBRARY_KIND_LABEL, LIBRARY_MEDIUM_LABEL, LOAN_STATE_LABEL, loanState, mulberry32, uuidv7,
  type LibraryCopy, type LibraryItem, type LibraryKind, type LibraryLoan, type LibraryMedium, type Sheet,
} from "@insedu/domain";
import { activeStudents, courseById, fullName, school, studentById } from "./demo";
import type { Session } from "./session";
import { allStaff, findPerson, libraryState } from "./store";

/**
 * Biblioteca: toda la comunidad busca en el catálogo y ve la disponibilidad. Solo biblioteca, administración y
 * dirección registran material y préstamos, y solo ellas ven quién tiene cada ejemplar.
 */
export const canManageLibrary = (s: Session) => s.person.roles.some((r) => r === "librarian" || r === "school_admin" || r === "director");

export const libraryToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

export const libraryItems = () => libraryState().items;
export const itemById = (id: string) => libraryState().items.find((i) => i.id === id);
export const itemByCode = (code: string) => libraryState().items.find((i) => i.code === code);
export const copiesOf = (itemId: string) => libraryState().copies.filter((c) => c.itemId === itemId).sort((a, b) => a.number - b.number);
export const loansOf = (itemId: string) => libraryState().loans.filter((l) => l.itemId === itemId);
export const availabilityFor = (itemId: string) => availabilityOf(copiesOf(itemId), loansOf(itemId));

export const borrowerName = (id: string) => findPerson(id)?.name ?? "Persona no disponible";

/** Curso del estudiante, o «Personal» si es funcionario. */
export const borrowerGroup = (l: LibraryLoan) => {
  const st = l.borrowerKind === "estudiante" ? studentById(l.borrowerId) : undefined;
  return st ? courseById(st.courseId)?.name ?? "" : "Personal";
};

/** Estudiantes por curso y personal, para elegir a quién prestar. */
export function borrowerGroups(): { label: string; people: { id: string; name: string }[] }[] {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "es");
  return [
    ...school().courses.map((c) => ({ label: c.name, people: activeStudents().filter((s) => s.courseId === c.id).map((s) => ({ id: s.id, name: fullName(s) })).sort(byName) })),
    { label: "Personal", people: allStaff().map((p) => ({ id: p.id, name: p.name })).sort(byName) },
  ];
}

export function borrowerKindOf(id: string): LibraryLoan["borrowerKind"] | null {
  if (activeStudents().some((s) => s.id === id)) return "estudiante";
  return allStaff().some((p) => p.id === id) ? "funcionario" : null;
}

/** Préstamos abiertos de la persona; el apoderado ve los de su pupilo. */
export function ownLoans(s: Session): LibraryLoan[] {
  const ids = s.person.roles.includes("guardian_academic") ? s.person.wards ?? [] : [s.person.id];
  return libraryState().loans.filter((l) => isOpenLoan(l) && ids.includes(l.borrowerId)).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export function libraryStats(today: string) {
  const { items, copies, loans } = libraryState();
  const totals = availabilityOf(copies, loans);
  return { titles: items.length, ...totals, overdue: loans.filter((l) => loanState(l, today) === "atrasado").length };
}

export function inventorySheet(): Sheet {
  const { items } = libraryState();
  return {
    name: "Inventario de biblioteca",
    title: "Inventario de biblioteca",
    columns: [
      { header: "Título", width: 44 }, { header: "Autor", width: 30 }, { header: "Tipo" }, { header: "Soporte" }, { header: "Código", width: 18 }, { header: "Editorial", width: 24 }, { header: "Año", format: "integer" },
      { header: "Categoría", width: 20 }, { header: "Ubicación", width: 24 }, { header: "Ejemplares", format: "integer" }, { header: "Disponibles", format: "integer" }, { header: "Prestados", format: "integer" }, { header: "En reparación", format: "integer" },
    ],
    rows: [...items].sort((a, b) => a.title.localeCompare(b.title, "es")).map((i) => {
      const a = availabilityFor(i.id);
      return [i.title, i.author ?? "", LIBRARY_KIND_LABEL[i.kind], LIBRARY_MEDIUM_LABEL[i.medium], formatLibraryCode(i.code), i.publisher ?? "", i.year ?? null, i.category ?? "", i.location ?? "", a.total, a.available, a.onLoan, a.unavailable];
    }),
  };
}

export function loansSheet(today: string): Sheet {
  const { copies, loans } = libraryState();
  return {
    name: "Préstamos de biblioteca",
    title: "Préstamos de biblioteca",
    columns: [
      { header: "Título", width: 44 }, { header: "Ejemplar", format: "integer" }, { header: "Persona", width: 30 }, { header: "Curso", width: 14 }, { header: "Préstamo", format: "date" }, { header: "Devolver", format: "date" },
      { header: "Estado", width: 14 }, { header: "Días de atraso", format: "integer" }, { header: "Renovaciones", format: "integer" }, { header: "Devuelto", format: "date" }, { header: "Observación", width: 36 },
    ],
    rows: [...loans].sort((a, b) => b.loanedOn.localeCompare(a.loanedOn)).map((l) => [
      itemById(l.itemId)?.title ?? "", copies.find((c) => c.id === l.copyId)?.number ?? null, borrowerName(l.borrowerId), borrowerGroup(l), l.loanedOn, l.dueOn, LOAN_STATE_LABEL[loanState(l, today)], daysLate(l, today), l.renewals, l.returnedOn ?? "", l.returnNote ?? "",
    ]),
  };
}

export { copyState, COPY_STATE_LABEL };

// ───────────── Colección ficticia de la demostración ─────────────

type Seed = [kind: LibraryKind, medium: LibraryMedium, title: string, author: string, category: string, location: string, copies: number];

const SHELF = (n: number) => `Estante ${n}`;
const CATALOG: Seed[] = [
  ["libro", "fisico", "Papelucho", "Marcela Paz", "Narrativa infantil", SHELF(1), 8],
  ["libro", "fisico", "Papelucho detective", "Marcela Paz", "Narrativa infantil", SHELF(1), 5],
  ["libro", "fisico", "Quique Hache, detective", "Sergio Gómez", "Narrativa juvenil", SHELF(2), 6],
  ["libro", "fisico", "Historia de una gaviota y del gato que le enseñó a volar", "Luis Sepúlveda", "Narrativa juvenil", SHELF(2), 10],
  ["libro", "fisico", "El viejo que leía novelas de amor", "Luis Sepúlveda", "Novela", SHELF(4), 6],
  ["libro", "fisico", "El Principito", "Antoine de Saint-Exupéry", "Narrativa infantil", SHELF(1), 9],
  ["libro", "fisico", "Momo", "Michael Ende", "Narrativa juvenil", SHELF(2), 4],
  ["libro", "fisico", "La historia interminable", "Michael Ende", "Narrativa juvenil", SHELF(2), 3],
  ["libro", "fisico", "Matilda", "Roald Dahl", "Narrativa infantil", SHELF(1), 7],
  ["libro", "fisico", "Mi planta de naranja lima", "José Mauro de Vasconcelos", "Novela", SHELF(3), 8],
  ["libro", "fisico", "Subterra", "Baldomero Lillo", "Cuento chileno", SHELF(5), 12],
  ["libro", "fisico", "Sub sole", "Baldomero Lillo", "Cuento chileno", SHELF(5), 6],
  ["libro", "fisico", "Martín Rivas", "Alberto Blest Gana", "Novela chilena", SHELF(5), 10],
  ["libro", "fisico", "Hijo de ladrón", "Manuel Rojas", "Novela chilena", SHELF(5), 5],
  ["libro", "fisico", "La amortajada", "María Luisa Bombal", "Novela chilena", SHELF(5), 4],
  ["libro", "fisico", "La casa de los espíritus", "Isabel Allende", "Novela chilena", SHELF(6), 5],
  ["libro", "fisico", "Veinte poemas de amor y una canción desesperada", "Pablo Neruda", "Poesía", SHELF(7), 7],
  ["libro", "fisico", "Desolación", "Gabriela Mistral", "Poesía", SHELF(7), 5],
  ["libro", "fisico", "Altazor", "Vicente Huidobro", "Poesía", SHELF(7), 3],
  ["libro", "fisico", "Cien años de soledad", "Gabriel García Márquez", "Novela", SHELF(6), 6],
  ["libro", "fisico", "Crónica de una muerte anunciada", "Gabriel García Márquez", "Novela", SHELF(6), 9],
  ["libro", "fisico", "Don Quijote de la Mancha", "Miguel de Cervantes", "Clásicos", SHELF(8), 4],
  ["libro", "fisico", "Lazarillo de Tormes", "Anónimo", "Clásicos", SHELF(8), 8],
  ["libro", "fisico", "Romeo y Julieta", "William Shakespeare", "Teatro", SHELF(8), 8],
  ["libro", "fisico", "La metamorfosis", "Franz Kafka", "Clásicos", SHELF(8), 6],
  ["libro", "fisico", "El diario de Ana Frank", "Ana Frank", "Biografía", SHELF(9), 7],
  ["libro", "fisico", "Fahrenheit 451", "Ray Bradbury", "Ciencia ficción", SHELF(6), 4],
  ["libro", "fisico", "1984", "George Orwell", "Ciencia ficción", SHELF(6), 5],
  ["libro", "fisico", "Atlas escolar de Chile", "Equipo Editorial Los Aromos", "Consulta", "Sala de consulta", 15],
  ["libro", "fisico", "Diccionario escolar de la lengua", "Equipo Editorial Los Aromos", "Consulta", "Sala de consulta", 20],
  ["libro", "fisico", "Matemática 5° Básico: texto de apoyo", "Equipo Editorial Los Aromos", "Textos de estudio", SHELF(10), 30],
  ["libro", "fisico", "Ciencias Naturales 1° Medio: texto de apoyo", "Equipo Editorial Los Aromos", "Textos de estudio", SHELF(10), 30],
  ["revista", "fisico", "Revista Ciencia Joven N° 24", "Equipo editorial", "Ciencias", "Hemeroteca", 3],
  ["revista", "fisico", "Revista Ciencia Joven N° 25", "Equipo editorial", "Ciencias", "Hemeroteca", 3],
  ["revista", "fisico", "Historia y Patrimonio de Chile N° 11", "Equipo editorial", "Historia", "Hemeroteca", 2],
  ["video", "fisico", "Flora y fauna de Chile (DVD)", "Producción escolar", "Ciencias", "Mueble audiovisual", 2],
  ["video", "digital", "Cápsulas de Historia de Chile", "Departamento de Historia", "Historia", "Biblioteca digital del colegio", 5],
  ["video", "digital", "Laboratorio en casa: experimentos seguros", "Departamento de Ciencias", "Ciencias", "Biblioteca digital del colegio", 5],
  ["audio", "digital", "Audiolibro: poesía chilena para escuchar", "Grabación escolar", "Poesía", "Biblioteca digital del colegio", 3],
  ["otro", "fisico", "Set de mapas murales de América", "Material didáctico", "Geografía", "Sala de recursos", 2],
  ["otro", "fisico", "Juego de sólidos geométricos", "Material didáctico", "Matemática", "Sala de recursos", 4],
];

/** ISBN e ISSN de esta colección son ficticios, con dígito verificador válido: el título es real, la edición no. */
function fictitiousCode(kind: LibraryKind, n: number): string | undefined {
  if (kind === "otro") return `BIB${String(n).padStart(5, "0")}`;
  const body = `${kind === "revista" ? "977" : "978"}956${String(990_000 + n)}`;
  const sum = [...body].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

export function seedLibrary() {
  const st = libraryState();
  const s = school();
  const r = mulberry32(7171);
  const day = (n: number) => s.schoolDays[Math.max(0, s.schoolDays.length - 1 - n)]!;
  const at = `${s.schoolDays[0]}T13:00:00.000Z`;
  const by = "librarian-1";

  const rows = CATALOG.map(([kind, medium, title, author, category, location, copies], n) => {
    const item: LibraryItem = { id: uuidv7(), kind, medium, title, author, category, location, code: fictitiousCode(kind, n + 1), publisher: "Editorial Los Aromos (ficticia)", year: 2012 + Math.floor(r() * 13), by, at };
    const made: LibraryCopy[] = Array.from({ length: copies }, (_, i) => ({ id: uuidv7(), itemId: item.id, number: i + 1, condition: "activo", by, at }));
    st.items.push(item);
    st.copies.push(...made);
    return { item, copies: made };
  });
  const find = (title: string) => rows.find((x) => x.item.title === title)!;

  const lend = (row: (typeof rows)[number], borrowerId: string, loanedOn: string, returnedAfter?: number) => {
    const copy = row.copies.find((c) => c.condition === "activo" && copyState(c, st.loans) === "disponible");
    if (!copy) return;
    const dueOn = defaultDueDate(loanedOn, row.item.kind);
    const base: LibraryLoan = { id: uuidv7(), itemId: row.item.id, copyId: copy.id, borrowerId, borrowerKind: borrowerId.startsWith("student-") ? "estudiante" : "funcionario", loanedOn, dueOn, renewals: 0, by, at: `${loanedOn}T14:00:00.000Z` };
    st.loans.push(returnedAfter == null ? base : { ...base, returnedOn: day(returnedAfter), returnedBy: by });
  };

  // Lo que ve el estudiante y el apoderado de la demostración: uno al día y uno atrasado.
  lend(find("Papelucho detective"), "student-001", day(2));
  lend(find("Momo"), "student-001", day(20));

  const pupils = activeStudents();
  const pupil = (i: number) => pupils[(i * 11 + 5) % pupils.length]!.id;
  const physical = rows.filter((x) => x.item.medium === "fisico");
  // Devueltos, atrasados, por vencer y vigentes.
  for (let i = 0; i < 40; i++) lend(physical[(i * 3) % physical.length]!, pupil(i), day(48 - (i % 20)), 26 - (i % 20));
  for (let i = 0; i < 6; i++) lend(physical[(i * 5 + 2) % physical.length]!, pupil(40 + i), day(16 + i * 2));
  for (let i = 0; i < 5; i++) lend(physical[(i * 7 + 1) % physical.length]!, pupil(50 + i), day(9));
  for (let i = 0; i < 18; i++) lend(physical[(i * 2 + 4) % physical.length]!, pupil(60 + i), day(1 + (i % 7)));
  lend(find("Atlas escolar de Chile"), "teacher-3", day(4));
  lend(find("Flora y fauna de Chile (DVD)"), "teacher-1", day(3));
  lend(find("Set de mapas murales de América"), "teacher-3", day(5));

  // Stock agotado, para mostrar la fecha en que vuelve un ejemplar.
  const scarce = find("Altazor");
  scarce.copies.forEach((_, i) => lend(scarce, pupil(90 + i), day(3 + i)));

  // Ejemplares fuera de circulación.
  const condition = (title: string, number: number, value: LibraryCopy["condition"], note: string) => {
    const copy = find(title).copies.find((c) => c.number === number)!;
    if (copyState(copy, st.loans) === "disponible") Object.assign(copy, { condition: value, note });
  };
  condition("Don Quijote de la Mancha", 4, "reparacion", "Lomo despegado, en encuadernación");
  condition("Matemática 5° Básico: texto de apoyo", 30, "perdido", "No devuelto el año anterior");
  condition("Diccionario escolar de la lengua", 20, "baja", "Edición desactualizada");
}
