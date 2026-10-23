export const metadata = { title: "Privacidad y protección de datos" };

export default function Privacidad() {
  return (
    <main className="wrap" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <h1>Privacidad y protección de datos</h1>
        <p className="lead">Cómo trata INSEDU la información de estudiantes, familias y funcionarios.</p>
      </div>

      <p className="notice">
        Esta instalación es una <strong>demostración</strong>: todas las personas, cursos y registros son ficticios.
        No ingrese datos reales.
      </p>

      <section className="section">
        <h2>Principios</h2>
        <ul>
          <li>Cada perfil ve solo lo que necesita para su función; los permisos se aplican en el servidor.</li>
          <li>La información confidencial (revelaciones, salud mental, antecedentes de protección) se guarda cifrada en una
            bóveda separada, a la que accede únicamente el Encargado de Salvaguarda o su suplente formal.</li>
          <li>Todo acceso a la bóveda queda registrado y puede auditarse.</li>
          <li>Las correcciones del registro oficial exigen motivo y conservan el valor anterior.</li>
          <li>El asistente de inteligencia artificial nunca recibe contenido de la bóveda ni datos reales mientras se use un
            servicio gratuito.</li>
        </ul>
      </section>

      <section className="section">
        <h2>Piloto con datos reales</h2>
        <p>
          Antes de trabajar con datos reales, el piloto contará con revisión jurídica, términos de uso, consentimientos y
          evaluación de impacto en protección de datos, conforme a la legislación chilena vigente.
        </p>
      </section>
    </main>
  );
}
