import Link from "next/link";
import { school } from "@/lib/demo";
import { readState } from "@/lib/state";
import { Icon, type IconName } from "@/components/Icon";
import { HeroVideo } from "@/components/HeroVideo";

type Role = { href: string; icon: IconName; eyebrow: string; title: string; text: string };

const GROUPS: { title: string; note: string; roles: Role[] }[] = [
  {
    title: "Docentes",
    note: "Registrar una sola vez",
    roles: [
      { href: "/libro", icon: "book", eyebrow: "Docente", title: "Libro de clases", text: "Asistencia por clase, leccionario con firma, notas y anotaciones. Se registra una sola vez." },
      { href: "/panel/profesor-jefe", icon: "alert", eyebrow: "Profesor jefe", title: "¿Quién necesita atención?", text: "Indicadores del curso, alertas explicadas y ranking de progreso." },
      { href: "/copiloto", icon: "spark", eyebrow: "Docente", title: "Copiloto Docente", text: "Guías, pruebas, rúbricas y planificaciones como borrador." },
      { href: "/refuerzos", icon: "star", eyebrow: "Estudiante · profesor jefe", title: "Refuerzos y recompensas", text: "Niveles, insignias, canje validado por el profesor jefe y metas cooperativas del curso." },
    ],
  },
  {
    title: "Estudiantes y familias",
    note: "Progreso personal y comunicación",
    roles: [
      { href: "/panel/estudiante", icon: "user", eyebrow: "Estudiante", title: "¿Cómo voy?", text: "Mi progreso, mis reconocimientos y mi posición en el ranking de mejora." },
      { href: "/panel/apoderado", icon: "home", eyebrow: "Apoderado", title: "¿Mi hijo está bien esta semana?", text: "Resumen semanal en lenguaje simple." },
      { href: "/mensajes", icon: "chat", eyebrow: "Familias y colegio", title: "Comunicados y mensajes", text: "Comunicados con confirmación de lectura y mensajería con horario de contacto." },
    ],
  },
  {
    title: "Gestión del colegio",
    note: "Menos carga administrativa",
    roles: [
      { href: "/panel/direccion", icon: "chart", eyebrow: "Dirección", title: "¿Cómo está el colegio?", text: "Comparación por curso en las tres dimensiones." },
      { href: "/escanear", icon: "scan", eyebrow: "Portería e inspectoría", title: "Escanear credenciales", text: "Código de barras con el RUT, desde el teléfono, con o sin red." },
      { href: "/informatica", icon: "download", eyebrow: "Encargado de informática", title: "Exportación MINEDUC", text: "Archivos de asistencia y notas con informe de consistencia." },
    ],
  },
  {
    title: "Bienestar y protección",
    note: "Lo confidencial, solo para quien corresponde",
    roles: [
      { href: "/salud", icon: "heart", eyebrow: "Enfermería", title: "Salud integral", text: "Ficha de salud, atenciones y derivación a Salvaguarda." },
      { href: "/salvaguarda", icon: "shield", eyebrow: "Encargado de Salvaguarda", title: "Expediente confidencial", text: "Acceso exclusivo con verificación, depósito sin lectura, protocolos con plazos e instrucciones mínimas." },
    ],
  },
];

export default async function Home() {
  await readState();
  const s = school();
  return (
    <main>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-text">
          <span className="brand xl" aria-hidden="true">INS<span>E</span>DU</span>
          <h1>Acompañar a cada estudiante, en una sola plataforma.</h1>
          <p>
            El docente registra una sola vez. INSEDU detecta a tiempo, reconoce el progreso y protege lo confidencial.
          </p>
          <div className="hero-actions">
            <Link href="/ingresar" className="btn primary">
              Ingresar a la demostración <Icon name="arrow" size={18} />
            </Link>
            <a href="#recorrido" className="btn secondary">Ver por perfil</a>
          </div>
          <div className="stats" aria-label="Colegio ficticio de la demostración">
            <div><strong>{s.students.length}</strong><span>estudiantes ficticios</span></div>
            <div><strong>{s.courses.length}</strong><span>cursos</span></div>
            <div><strong>3</strong><span>dimensiones: académica, salud y convivencia</span></div>
            <div><strong>1</strong><span>solo registro para el docente</span></div>
          </div>
          </div>
          <HeroVideo />
        </div>
      </section>
      <div className="wrap" id="recorrido">
        <h2 style={{ marginTop: 8 }}>Elija un perfil para recorrer la demostración</h2>
        {GROUPS.map((g) => (
          <section key={g.title}>
            <div className="group-title">
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{g.title}</h3>
              <span className="muted">{g.note}</span>
            </div>
            <div className="grid">
              {g.roles.map((r) => (
                <Link key={r.href} href={r.href} className="card">
                  <span className="card-icon"><Icon name={r.icon} /></span>
                  <span className="eyebrow">{r.eyebrow}</span>
                  <h3>{r.title}</h3>
                  <span className="muted">{r.text}</span>
                  <span className="go">Abrir <Icon name="arrow" size={16} /></span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
