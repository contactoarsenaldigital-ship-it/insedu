import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";
import { SessionPill } from "@/components/SessionPill";
import { MainNav } from "@/components/MainNav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: { default: "INSEDU", template: "%s · INSEDU" },
  description: "Acompañamiento integral del estudiante: académico, salud integral y convivencia.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "INSEDU", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#151515",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <header className="topbar">
          <Link href="/" className="brand" aria-label="INSEDU, inicio">
            INS<span>E</span>DU
          </Link>
          <MainNav />
          <div className="topbar-end">
            <SessionPill />
            <span className="demo-pill" title="Todos los datos son ficticios">Datos ficticios</span>
          </div>
        </header>
        {children}
        <Footer />
        <RegisterSW />
      </body>
    </html>
  );
}
