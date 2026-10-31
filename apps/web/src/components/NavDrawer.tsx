"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type NavGroup = { title: string; items: { href: string; label: string }[] };

/** Menú tipo hamburguesa: el botón abre un panel lateral izquierdo con las opciones agrupadas. */
export function NavDrawer({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  // Se cierra al navegar.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`) || (href.startsWith("/panel/") && pathname.startsWith("/panel/"));

  return (
    <>
      <button ref={button} type="button" className="menu-button" aria-expanded={open} aria-controls="menu-principal" onClick={() => setOpen((o) => !o)}>
        <span className="burger" aria-hidden="true"><i /><i /><i /></span>
        <span className="menu-label">Menú</span>
      </button>
      <div className={`drawer-backdrop${open ? " open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <nav ref={panel} id="menu-principal" aria-label="Principal" className={`drawer${open ? " open" : ""}`} inert={!open}>
        <div className="drawer-head">
          <span className="brand">INS<span>E</span>DU</span>
          <button type="button" className="drawer-close" aria-label="Cerrar menú" onClick={() => { setOpen(false); button.current?.focus(); }}>×</button>
        </div>
        {groups.map((g) => (
          <section key={g.title} className="drawer-group">
            <h2>{g.title}</h2>
            <ul>
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} aria-current={current(i.href) ? "page" : undefined}>{i.label}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
    </>
  );
}
