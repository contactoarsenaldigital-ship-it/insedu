import type { Role } from "@insedu/domain";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";
import { NavDrawer, type NavGroup } from "./NavDrawer";

type Item = { href: string; label: string; roles?: Role[] | "all" };

const STAFF_TEACH: Role[] = ["teacher", "head_teacher"];

/** Menú agrupado por área y filtrado según el rol. Sin sesión se muestran todas las secciones. */
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Aula",
    items: [
      { href: "/libro", label: "Libro de clases", roles: [...STAFF_TEACH, "inspector", "director", "school_admin"] },
      { href: "/refuerzos", label: "Refuerzos", roles: [...STAFF_TEACH, "student", "guardian_academic"] },
      { href: "/panel/profesor-jefe", label: "Paneles", roles: [...STAFF_TEACH, "inspector", "director", "school_admin"] },
      { href: "/panel/apoderado", label: "Resumen semanal", roles: ["guardian_academic"] },
      { href: "/copiloto", label: "Copiloto", roles: STAFF_TEACH },
      { href: "/escanear", label: "Escanear", roles: [...STAFF_TEACH, "inspector", "gatekeeper"] },
    ],
  },
  {
    title: "Comunidad",
    items: [
      { href: "/mensajes", label: "Comunicación", roles: "all" },
      { href: "/encuestas", label: "Encuestas", roles: [...STAFF_TEACH, "student", "guardian_academic", "psychologist", "counselor", "safeguarding_lead", "director", "school_admin"] },
    ],
  },
  {
    title: "Bienestar y protección",
    items: [
      { href: "/salud", label: "Salud", roles: ["nurse", "psychologist", "counselor", "safeguarding_lead"] },
      { href: "/salvaguarda", label: "Salvaguarda", roles: ["nurse", "psychologist", "counselor", "social_worker", "safeguarding_lead", "director"] },
    ],
  },
  {
    title: "Gestión",
    items: [
      { href: "/configuracion", label: "Configuración", roles: ["school_admin", "director"] },
      { href: "/informatica", label: "Informática", roles: ["school_admin", "director"] },
      { href: "/demo", label: "Demo", roles: ["school_admin", "director"] },
    ],
  },
];

export async function MainNav() {
  await readState();
  const s = await getSession();
  const roles = s?.person.roles;
  const visible = (i: Item) => !roles || i.roles === "all" || i.roles?.some((r) => roles.includes(r));
  const groups: NavGroup[] = GROUPS
    .map((g) => ({ title: g.title, items: g.items.filter(visible).map(({ href, label }) => ({ href, label })) }))
    .filter((g) => g.items.length > 0);
  return <NavDrawer groups={groups} />;
}
