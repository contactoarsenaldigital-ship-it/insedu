"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Sección del menú que corresponde a la ruta actual. "Paneles" agrupa todos los paneles salvo el del apoderado. */
function isCurrent(href: string, path: string) {
  if (href === "/panel/profesor-jefe") return path.startsWith("/panel/") && path !== "/panel/apoderado";
  return path === href || path.startsWith(`${href}/`);
}

/**
 * Comportamiento de cliente del layout:
 * - Marca en el menú principal la sección actual (aria-current), también al navegar sin recargar.
 * - Registra el service worker solo en producción. En desarrollo elimina cualquiera que haya
 *   quedado registrado, porque serviría archivos antiguos desde la caché.
 */
export function RegisterSW() {
  const path = usePathname() ?? "/";

  useEffect(() => {
    const nav = document.querySelector(".main-nav");
    if (!nav) return;
    const mark = () =>
      nav.querySelectorAll<HTMLAnchorElement>("a").forEach((a) => {
        const current = isCurrent(a.getAttribute("href") ?? "", path);
        if (current && a.getAttribute("aria-current") !== "page") a.setAttribute("aria-current", "page");
        if (!current && a.hasAttribute("aria-current")) a.removeAttribute("aria-current");
      });
    mark();
    // El menú cambia al iniciar o cerrar sesión sin cambiar de ruta: se vuelve a marcar.
    const obs = new MutationObserver(mark);
    obs.observe(nav, { childList: true });
    return () => obs.disconnect();
  }, [path]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      return;
    }
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
    if ("caches" in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
  }, []);

  return null;
}
