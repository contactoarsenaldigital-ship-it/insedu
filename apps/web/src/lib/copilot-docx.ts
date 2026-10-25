import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImportedXmlComponent,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import katex from "katex";
import { mml2omml } from "mathml2omml";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { normalizeMath } from "@insedu/domain";
import { remarkPlugins } from "./copilot-markdown";

/**
 * Exportación del borrador del Copiloto a Word (.docx), en el navegador.
 * El Markdown se analiza con las mismas reglas que la vista (GFM + fórmulas) y cada fórmula
 * LaTeX se convierte en una ecuación nativa de Word (LaTeX → MathML con KaTeX → OMML).
 */

type Node = {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  checked?: boolean | null;
  url?: string;
  alt?: string;
  children?: Node[];
};

export type DraftMeta = { kind: string; subject: string; level: string; withStudentFields: boolean };

function parse(md: string): Node {
  const processor = unified().use(remarkParse).use(remarkPlugins);
  return processor.runSync(processor.parse(normalizeMath(md))) as unknown as Node;
}

/** mathml2omml deja a veces texto suelto (p. ej. "=" tras una sumatoria) que Word descarta: se envuelve en m:r. */
const wrapLooseText = (xml: string) =>
  xml.replace(/(<[^>]+>)([^<]+)(?=<)/g, (m, tag: string, text: string) =>
    /^<m:t[\s>]/.test(tag) || !text.trim() ? m : `${tag}<m:r><m:t xml:space="preserve">${text}</m:t></m:r>`,
  );

/** Ecuación nativa de Word. docx no tipa el XML importado como hijo de párrafo, pero lo serializa igual. */
function omml(tex: string, display: boolean): ParagraphChild | null {
  try {
    const html = katex.renderToString(tex, { output: "mathml", displayMode: display, throwOnError: true });
    const mml = html.match(/<math[\s\S]*<\/math>/)?.[0];
    if (!mml) return null;
    const clean = mml
      .replace(/<annotation[\s\S]*?<\/annotation>/g, "")
      .replace(/<mspace[^>]*\/>/g, "<mtext> </mtext>"); // mathml2omml descarta los espacios (\quad)
    // disableDecode: "&lt;" y "&amp;" deben seguir escapados para que la ecuación sea XML válido.
    const xml = wrapLooseText(mml2omml(clean, { disableDecode: true }));
    // fromXmlString devuelve el documento leído (un nodo sin nombre que Word rechaza): se usa su primer elemento.
    const parsed = ImportedXmlComponent.fromXmlString(display ? `<m:oMathPara>${xml}</m:oMathPara>` : xml);
    const element = (parsed as unknown as { root: unknown[] }).root[0];
    return element instanceof ImportedXmlComponent ? (element as unknown as ParagraphChild) : null;
  } catch {
    return null;
  }
}

type Style = { bold?: boolean; italics?: boolean; strike?: boolean; code?: boolean };

const run = (text: string, s: Style) =>
  new TextRun({ text: text.replace(/\s*\n\s*/g, " "), bold: s.bold, italics: s.italics, strike: s.strike, font: s.code ? "Consolas" : undefined });

function inline(nodes: Node[] = [], s: Style = {}): ParagraphChild[] {
  return nodes.flatMap((n): ParagraphChild[] => {
    switch (n.type) {
      case "text":
        return [run(n.value ?? "", s)];
      case "strong":
        return inline(n.children, { ...s, bold: true });
      case "emphasis":
        return inline(n.children, { ...s, italics: true });
      case "delete":
        return inline(n.children, { ...s, strike: true });
      case "inlineCode":
        return [run(n.value ?? "", { ...s, code: true })];
      case "break":
        return [new TextRun({ break: 1 })];
      case "inlineMath":
        return [omml(n.value ?? "", false) ?? run(n.value ?? "", { ...s, italics: true })];
      case "link":
        return [new ExternalHyperlink({ link: n.url ?? "", children: [new TextRun({ text: plain(n), style: "Hyperlink" })] })];
      case "image":
        return n.alt ? [run(`[${n.alt}]`, { ...s, italics: true })] : [];
      case "html":
        return [];
      default:
        return inline(n.children, s);
    }
  });
}

const plain = (n: Node): string => n.value ?? (n.children ?? []).map(plain).join("");

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

type Block = Paragraph | Table;

function blocks(nodes: Node[] = []): Block[] {
  return nodes.flatMap((n): Block[] => {
    switch (n.type) {
      case "heading":
        return [new Paragraph({ heading: HEADINGS[Math.min((n.depth ?? 1) - 1, 3)], children: inline(n.children) })];
      case "paragraph":
        return [new Paragraph({ children: inline(n.children), spacing: { after: 120 } })];
      case "math": {
        const eq = omml(n.value ?? "", true);
        return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 }, children: eq ? [eq] : [run(n.value ?? "", { italics: true })] })];
      }
      case "list":
        return list(n, 0);
      case "table":
        return [table(n)];
      case "blockquote":
        return (n.children ?? []).map(
          (c) =>
            new Paragraph({
              children: inline(c.children, { italics: true }),
              indent: { left: 567 },
              border: { left: { style: BorderStyle.SINGLE, size: 12, color: "B9C4CF", space: 8 } },
            }),
        );
      case "code":
        return (n.value ?? "").split("\n").map((line) => new Paragraph({ children: [run(line, { code: true })], shading: { type: ShadingType.CLEAR, fill: "F3F4F6" } }));
      case "thematicBreak":
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 1 } } })];
      default:
        return [];
    }
  });
}

/**
 * Las listas numeradas llevan el número escrito y no la numeración automática de Word: el modelo
 * suele cortar una lista con las alternativas y seguir en "2.", y Word reiniciaría en 1.
 */
function list(n: Node, level: number): Block[] {
  const left = 720 * (level + 1);
  return (n.children ?? []).flatMap((item, index) =>
    (item.children ?? []).flatMap((child, i): Block[] => {
      if (child.type === "list") return list(child, level + 1);
      if (child.type !== "paragraph") return blocks([child]);
      const box = i === 0 && item.checked != null ? [new TextRun(item.checked ? "☑ " : "☐ ")] : [];
      const children = [...box, ...inline(child.children)];
      if (i > 0) return [new Paragraph({ children, indent: { left }, spacing: { after: 80 } })];
      if (!n.ordered) return [new Paragraph({ children, bullet: { level }, spacing: { after: 80 } })];
      const label = level % 2 === 0 ? `${(n.start ?? 1) + index}.` : `${String.fromCharCode(97 + ((n.start ?? 1) + index - 1) % 26)}.`;
      return [new Paragraph({ children: [new TextRun(`${label}\t`), ...children], indent: { left, hanging: 360 }, tabStops: [{ type: "left", position: left }], spacing: { after: 80 } })];
    }),
  );
}

function table(n: Node): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: (n.children ?? []).map(
      (row, r) =>
        new TableRow({
          tableHeader: r === 0,
          children: (row.children ?? []).map(
            (cell) =>
              new TableCell({
                children: [new Paragraph({ children: inline(cell.children, { bold: r === 0 }) })],
                shading: r === 0 ? { type: ShadingType.CLEAR, fill: "E8EEF4" } : undefined,
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
              }),
          ),
        }),
    ),
  });
}

export function draftToDocx(md: string, meta: DraftMeta): Document {
  const header: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: `${meta.subject} · ${meta.level} · ${meta.kind}`, color: "666666", size: 18 })], spacing: { after: 120 } }),
  ];
  if (meta.withStudentFields) {
    header.push(new Paragraph({ children: [new TextRun("Nombre: ______________________________   Curso: __________   Fecha: __________")], spacing: { after: 240 } }));
  }
  return new Document({
    creator: "INSEDU · Copiloto Docente",
    title: `${meta.kind} · ${meta.subject} · ${meta.level}`,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [
      {
        // Tamaño carta, márgenes de 2 cm.
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], size: 16, color: "888888" })],
              }),
            ],
          }),
        },
        children: [...header, ...blocks(parse(md).children)],
      },
    ],
  });
}
