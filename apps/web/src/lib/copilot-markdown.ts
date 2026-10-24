import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { PluggableList } from "unified";

/**
 * Reglas comunes para leer el borrador del Copiloto, en la vista y en la exportación a Word:
 * tablas (GFM), fórmulas solo con $$...$$ (un "$" simple es un monto en pesos) y cada salto de
 * línea respetado (alternativas A, B, C y D en líneas seguidas).
 */
export const MATH_OPTIONS = { singleDollarTextMath: false } as const;

export const remarkPlugins: PluggableList = [remarkGfm, [remarkMath, MATH_OPTIONS], remarkBreaks];

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Nombre de archivo para PDF y Word, por ejemplo "prueba-con-pauta-matematica-1-medio". */
export const draftFileName = (kind: string, subject: string, level: string) => slug(`${kind} ${subject} ${level}`);
