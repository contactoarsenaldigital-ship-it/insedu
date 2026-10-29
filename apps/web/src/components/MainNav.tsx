import Link from "next/link";
import type { Role } from "@insedu/domain";
import { getSession } from "@/lib/session";
import { readState } from "@/lib/state";

type Item = { href: string; label: string; roles?: Role[] | "all" };

const STAFF_TEACH: Role[] = ["teacher", "head_teacher"];

/** Menú según el rol. Sin sesión se muestran todas las secciones para recorrer la demostración. */
const ITEMS: Item[] = [
  { href: "/libro", label: "Libro de clases", roles: [...STAFF_TEACH, "inspector", "director", "school_admin"] },
  { href: "/refuerzos", label: "Refuerzos", roles: [...STAFF_TEACH, "student", "guardian_academic"] },
  { href: "/mensajes", label: "Comunicación", roles: "all" },
  { href: "/panel/profesor-jefe", label: "Paneles", roles: [...STAFF_TEACH, "inspector", "director", "school_admin"] },
  { href: "/panel/apoderado", label: "Resumen semanal", roles: ["guardian_academic"] },
  { href: "/salud", label: "Salud", roles: ["nurse", "psychologist", "counselor", "safeguarding_lead"] },
  { href: "/salvaguarda", label: "Salvaguarda", roles: ["nurse", "psychologist", "counselor", "social_worker", "safeguarding_lead", "director"] },
  { href: "/escanear", label: "Escanear", roles: [...STAFF_TEACH, "inspector", "gatekeeper"] },
  { href: "/copiloto", label: "Copiloto", roles: STAFF_TEACH },
  { href: "/configuracion", label: "Configuración", roles: ["school_admin", "director"] },
  { href: "/informatica", label: "Informática", roles: ["school_admin", "director"] },
  { href: "/demo", label: "Demo", roles: ["school_admin", "director"] },
];

export async function MainNav() {
  await readState();
  const s = await getSession();
  const roles = s?.person.roles;
  const items = ITEMS.filter((i) => !roles || i.roles === "all" || i.roles?.some((r) => roles.includes(r)));
  return (
    <nav aria-label="Principal" className="main-nav">
      {items.map((i) => <Link key={i.href} href={i.href}>{i.label}</Link>)}
    </nav>
  );
}
