/**
 * Catálogo de protocolos internos que activa el Encargado de Salvaguarda.
 *
 * Los nombres y plazos son valores POR DEFECTO: cada establecimiento los ajusta a su
 * Reglamento Interno. El único plazo fijado por ley aquí es el deber de denuncia de
 * delitos que afecten a estudiantes: 24 horas desde que se toma conocimiento
 * (Código Procesal Penal, arts. 175 letra e y 176).
 */

export type ProtocolDef = {
  id: string;
  name: string;
  /** Acción con plazo que se crea al activar el protocolo. */
  dueAction?: string;
  /** Horas desde la activación para cumplir la acción. */
  dueHours?: number;
  /** Organismos sugeridos para el registro de cumplimiento. */
  reportTo?: string[];
  legalBasis?: string;
};

export const PROTOCOLS: ProtocolDef[] = [
  {
    id: "posible_delito",
    name: "Maltrato, abuso u otro hecho que podría constituir delito",
    dueAction: "Presentar denuncia",
    dueHours: 24,
    reportTo: ["Ministerio Público", "Carabineros de Chile", "Policía de Investigaciones"],
    legalBasis: "Código Procesal Penal, arts. 175 y 176",
  },
  {
    id: "vulneracion_derechos",
    name: "Vulneración de derechos (sin indicio de delito)",
    dueAction: "Solicitar medida de protección o derivar a la red local",
    dueHours: 72,
    reportTo: ["Tribunal de Familia", "Oficina Local de la Niñez"],
    legalBasis: "Ley 21.430 y Reglamento Interno",
  },
  {
    id: "riesgo_vital",
    name: "Riesgo para la vida o integridad (ideación o conducta autolesiva)",
    dueAction: "Contactar al apoderado y derivar a atención de salud",
    dueHours: 4,
    reportTo: ["Centro de salud", "Servicio de urgencia"],
    legalBasis: "Reglamento Interno",
  },
  {
    id: "consumo",
    name: "Consumo de alcohol u otras drogas",
    dueAction: "Entrevista con apoderado y plan de acompañamiento",
    dueHours: 72,
    reportTo: ["Programa de prevención comunal", "Centro de salud"],
    legalBasis: "Reglamento Interno",
  },
];

export const protocolById = (id: string) => PROTOCOLS.find((p) => p.id === id);
