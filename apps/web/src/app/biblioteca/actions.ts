"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  copiesIssues, copyConditionIssues, copyState, defaultDueDate, isOpenLoan, libraryItemIssues, loanIssues, readLibraryCode, renewalIssues, uuidv7,
  type CopyCondition, type LibraryCopy, type LibraryItem, type LibraryKind, type LibraryMedium,
} from "@insedu/domain";
import { borrowerKindOf, canManageLibrary, copiesOf, itemByCode, itemById, libraryToday } from "@/lib/biblioteca";
import { getSession, type Session } from "@/lib/session";
import { withState } from "@/lib/state";
import { libraryState, logEvent } from "@/lib/store";

/** Acciones de biblioteca. Los mensajes viajan en la URL: nunca llevan nombres de personas. */
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function back(path: string, msg: { ok?: string; error?: string }): never {
  revalidatePath("/biblioteca", "layout");
  redirect(`${path}?${new URLSearchParams(msg as Record<string, string>)}`);
}

/** Vuelve a la ficha o al panel de préstamos, según desde dónde se actuó. */
const origin = (f: FormData, itemId: string) => (str(f, "from") === "prestamos" ? "/biblioteca/prestamos" : `/biblioteca/${itemId}`);

async function librarian(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/ingresar?next=/biblioteca");
  if (!canManageLibrary(s)) back("/biblioteca", { error: "Solo biblioteca, administración y dirección registran material y préstamos." });
  return s;
}

function fieldsFrom(f: FormData) {
  const raw = { kind: str(f, "kind"), medium: str(f, "medium"), title: str(f, "title").slice(0, 200), author: str(f, "author").slice(0, 200), code: str(f, "code").slice(0, 40), year: str(f, "year"), link: str(f, "link").slice(0, 400), copies: str(f, "copies") };
  const code = raw.code ? readLibraryCode(raw.code)?.code : undefined;
  const values = {
    kind: raw.kind as LibraryKind, medium: raw.medium as LibraryMedium, title: raw.title, author: raw.author || undefined, code, publisher: str(f, "publisher").slice(0, 200) || undefined,
    year: raw.year ? Number(raw.year) : undefined, category: str(f, "category").slice(0, 80) || undefined, location: str(f, "location").slice(0, 120) || undefined, link: raw.link || undefined, notes: str(f, "notes").slice(0, 500) || undefined,
  };
  return { raw, code, values };
}

const thisYear = () => Number(libraryToday().slice(0, 4));

function makeCopies(itemId: string, from: number, count: number, by: string, at: string): LibraryCopy[] {
  return Array.from({ length: count }, (_, i) => ({ id: uuidv7(), itemId, number: from + i, condition: "activo", by, at }));
}

async function addItemImpl(f: FormData) {
  const s = await librarian();
  const { raw, code, values } = fieldsFrom(f);
  const issues = libraryItemIssues(raw, { thisYear: thisYear(), codeTaken: !!code && !!itemByCode(code), requireCopies: true });
  if (issues.length) back("/biblioteca/nuevo", { error: issues.join(". "), ...(code ? { codigo: code } : {}) } as { error: string });
  const at = new Date().toISOString();
  const item: LibraryItem = { ...values, id: uuidv7(), by: s.person.id, at };
  const count = Number(raw.copies);
  const st = libraryState();
  st.items.push(item);
  st.copies.push(...makeCopies(item.id, 1, count, s.person.id, at));
  logEvent({ actor: s.person.id, action: "crear", entity: "biblioteca_titulo", recordId: item.id, after: { ...item, ejemplares: count } });
  back(`/biblioteca/${item.id}`, { ok: `Título agregado con ${count} ejemplar(es).`, nuevo: "1" } as { ok: string });
}

async function updateItemImpl(f: FormData) {
  const s = await librarian();
  const item = itemById(str(f, "itemId"));
  if (!item) back("/biblioteca", { error: "Ese título no existe." });
  const { raw, code, values } = fieldsFrom(f);
  const other = code ? itemByCode(code) : undefined;
  const issues = libraryItemIssues(raw, { thisYear: thisYear(), codeTaken: !!other && other.id !== item.id, requireCopies: false });
  if (issues.length) back(`/biblioteca/${item.id}`, { error: issues.join(". ") });
  const before = { ...item };
  Object.assign(item, values);
  logEvent({ actor: s.person.id, action: "modificar", entity: "biblioteca_titulo", recordId: item.id, before, after: item });
  back(`/biblioteca/${item.id}`, { ok: "Datos actualizados." });
}

async function addCopiesImpl(f: FormData) {
  const s = await librarian();
  const item = itemById(str(f, "itemId"));
  if (!item) back("/biblioteca", { error: "Ese título no existe." });
  const issues = copiesIssues(str(f, "copies"));
  if (issues.length) back(`/biblioteca/${item.id}`, { error: issues.join(". ") });
  const count = Number(str(f, "copies"));
  const next = copiesOf(item.id).reduce((m, c) => Math.max(m, c.number), 0) + 1;
  libraryState().copies.push(...makeCopies(item.id, next, count, s.person.id, new Date().toISOString()));
  logEvent({ actor: s.person.id, action: "crear", entity: "biblioteca_ejemplar", recordId: item.id, after: { ejemplares: count, desde: next } });
  back(`/biblioteca/${item.id}`, { ok: `Se agregaron ${count} ejemplar(es).` });
}

async function setConditionImpl(f: FormData) {
  const s = await librarian();
  const st = libraryState();
  const copy = st.copies.find((c) => c.id === str(f, "copyId"));
  if (!copy) back("/biblioteca", { error: "Ese ejemplar no existe." });
  const next = str(f, "condition");
  const issues = copyConditionIssues(copy, st.loans, next);
  if (issues.length) back(`/biblioteca/${copy.itemId}`, { error: issues.join(". ") });
  const before = copy.condition;
  copy.condition = next as CopyCondition;
  copy.note = str(f, "note").slice(0, 200) || undefined;
  // Un ejemplar prestado que se declara perdido cierra su préstamo: ya no se espera de vuelta.
  const today = libraryToday();
  for (const l of st.loans) if (next === "perdido" && l.copyId === copy.id && isOpenLoan(l)) Object.assign(l, { returnedOn: today, returnedBy: s.person.id, returnNote: "Declarado perdido" });
  logEvent({ actor: s.person.id, action: "modificar", entity: "biblioteca_ejemplar", recordId: copy.id, before, after: next });
  back(`/biblioteca/${copy.itemId}`, { ok: "Estado del ejemplar actualizado." });
}

async function lendImpl(f: FormData) {
  const s = await librarian();
  const st = libraryState();
  const item = itemById(str(f, "itemId"));
  if (!item) back("/biblioteca", { error: "Ese título no existe." });
  const copy = st.copies.find((c) => c.id === str(f, "copyId") && c.itemId === item.id);
  const borrowerId = str(f, "borrowerId");
  const borrowerKind = borrowerKindOf(borrowerId);
  const today = libraryToday();
  const dueOn = str(f, "dueOn");
  const issues = loanIssues({
    dueOn, today, borrowerKnown: !!borrowerKind, borrowerKind: borrowerKind ?? "funcionario",
    activeLoans: st.loans.filter((l) => l.borrowerId === borrowerId && isOpenLoan(l)).length,
    copyAvailable: !!copy && copyState(copy, st.loans) === "disponible",
  });
  if (issues.length) back(`/biblioteca/${item.id}`, { error: issues.join(". ") });
  const loan = { id: uuidv7(), itemId: item.id, copyId: copy!.id, borrowerId, borrowerKind: borrowerKind!, loanedOn: today, dueOn, renewals: 0, by: s.person.id, at: new Date().toISOString() };
  st.loans.push(loan);
  logEvent({ actor: s.person.id, action: "crear", entity: "biblioteca_prestamo", recordId: loan.id, after: loan });
  back(`/biblioteca/${item.id}`, { ok: `Préstamo registrado: ejemplar ${copy!.number}, devolver el ${dueOn}.` });
}

async function returnLoanImpl(f: FormData) {
  const s = await librarian();
  const loan = libraryState().loans.find((l) => l.id === str(f, "loanId"));
  if (!loan) back("/biblioteca", { error: "Ese préstamo no existe." });
  const path = origin(f, loan.itemId);
  if (loan.returnedOn) back(path, { error: "Ese préstamo ya fue devuelto." });
  const before = { ...loan };
  Object.assign(loan, { returnedOn: libraryToday(), returnedBy: s.person.id, returnNote: str(f, "note").slice(0, 200) || undefined });
  logEvent({ actor: s.person.id, action: "modificar", entity: "biblioteca_prestamo", recordId: loan.id, before, after: loan, reason: "Devolución" });
  back(path, { ok: "Devolución registrada." });
}

async function renewImpl(f: FormData) {
  const s = await librarian();
  const loan = libraryState().loans.find((l) => l.id === str(f, "loanId"));
  if (!loan) back("/biblioteca", { error: "Ese préstamo no existe." });
  const path = origin(f, loan.itemId);
  const today = libraryToday();
  const kind = itemById(loan.itemId)?.kind ?? "libro";
  // El nuevo plazo corre desde hoy o desde el vencimiento vigente, el que sea posterior.
  const newDue = defaultDueDate(loan.dueOn > today ? loan.dueOn : today, kind);
  const issues = renewalIssues(loan, newDue, today);
  if (issues.length) back(path, { error: issues.join(". ") });
  const before = { ...loan };
  Object.assign(loan, { dueOn: newDue, renewals: loan.renewals + 1 });
  logEvent({ actor: s.person.id, action: "modificar", entity: "biblioteca_prestamo", recordId: loan.id, before, after: loan, reason: "Renovación" });
  back(path, { ok: `Préstamo renovado hasta el ${newDue}.` });
}

export async function addItem(f: FormData) { return withState(() => addItemImpl(f)); }
export async function updateItem(f: FormData) { return withState(() => updateItemImpl(f)); }
export async function addCopies(f: FormData) { return withState(() => addCopiesImpl(f)); }
export async function setCopyCondition(f: FormData) { return withState(() => setConditionImpl(f)); }
export async function lendCopy(f: FormData) { return withState(() => lendImpl(f)); }
export async function returnLoan(f: FormData) { return withState(() => returnLoanImpl(f)); }
export async function renewLoan(f: FormData) { return withState(() => renewImpl(f)); }
