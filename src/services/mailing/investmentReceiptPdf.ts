import { jsPDF } from "jspdf";
import type {
  ReceiptDocument,
  ReceiptDocumentLine,
} from "./investmentReceiptDocument";

const MARGIN_MM = 15;
const PAGE_WIDTH_MM = 210;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const LINE_HEIGHT_MM = 5;
const FOOTER_SIZE = 9;
const BODY_SIZE = 10;
const HEADING_SIZE = 16;
const AMOUNT_SIZE = 14;
const SECTION_SIZE = 12;

function sanitizePdfText(text: string): string {
  return text
    .replace(/\u2212/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "-");
}

function wrapText(doc: jsPDF, text: string, maxWidthMm: number): string[] {
  return doc.splitTextToSize(sanitizePdfText(text), maxWidthMm) as string[];
}

function addWrappedLines(
  doc: jsPDF,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number
): number {
  let cursorY = y;
  for (const line of lines) {
    doc.text(sanitizePdfText(line), x, cursorY);
    cursorY += lineHeight;
  }
  return cursorY;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed <= pageHeight - MARGIN_MM) {
    return y;
  }
  doc.addPage();
  return MARGIN_MM;
}

function addLabelValue(doc: jsPDF, line: ReceiptDocumentLine, y: number): number {
  const prefix = `${line.label}: `;
  const prefixWidth = doc.getTextWidth(prefix);
  const valueMaxWidth = CONTENT_WIDTH_MM - prefixWidth;
  const valueLines = wrapText(doc, line.value, valueMaxWidth);

  let cursorY = ensureSpace(doc, y, LINE_HEIGHT_MM * Math.max(1, valueLines.length));

  if (valueLines.length <= 1) {
    doc.text(sanitizePdfText(`${prefix}${line.value}`), MARGIN_MM, cursorY);
    return cursorY + LINE_HEIGHT_MM;
  }

  doc.text(sanitizePdfText(prefix), MARGIN_MM, cursorY);
  cursorY = addWrappedLines(
    doc,
    valueLines,
    MARGIN_MM + prefixWidth,
    cursorY,
    LINE_HEIGHT_MM
  );
  return cursorY + 2;
}

export function buildReceiptPdfBuffer(document: ReceiptDocument): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  let y = MARGIN_MM;

  doc.setFontSize(FOOTER_SIZE);
  doc.setFont("helvetica", "normal");
  y = addWrappedLines(
    doc,
    wrapText(doc, document.brand, CONTENT_WIDTH_MM),
    MARGIN_MM,
    y,
    LINE_HEIGHT_MM
  );

  y = ensureSpace(doc, y, LINE_HEIGHT_MM * 2);
  doc.setFontSize(HEADING_SIZE);
  doc.setFont("helvetica", "bold");
  y = addWrappedLines(
    doc,
    wrapText(doc, document.heading, CONTENT_WIDTH_MM),
    MARGIN_MM,
    y + 2,
    LINE_HEIGHT_MM + 1
  );

  doc.setFontSize(AMOUNT_SIZE);
  doc.setFont("helvetica", "bold");
  y = addWrappedLines(
    doc,
    wrapText(doc, document.amount, CONTENT_WIDTH_MM),
    MARGIN_MM,
    y + 2,
    LINE_HEIGHT_MM + 1
  );

  doc.setFontSize(BODY_SIZE);
  doc.setFont("helvetica", "normal");
  y = addWrappedLines(
    doc,
    wrapText(doc, `Description: ${document.description}`, CONTENT_WIDTH_MM),
    MARGIN_MM,
    y + 2,
    LINE_HEIGHT_MM
  );

  for (const section of document.sections) {
    y = ensureSpace(doc, y, LINE_HEIGHT_MM * 3);
    y += 4;
    doc.setFontSize(SECTION_SIZE);
    doc.setFont("helvetica", "bold");
    y = addWrappedLines(
      doc,
      wrapText(doc, section.title, CONTENT_WIDTH_MM),
      MARGIN_MM,
      y,
      LINE_HEIGHT_MM + 1
    );

    doc.setFontSize(BODY_SIZE);
    doc.setFont("helvetica", "normal");
    for (const line of section.lines) {
      y = addLabelValue(doc, line, y);
    }
  }

  y = ensureSpace(doc, y, LINE_HEIGHT_MM * 4);
  y += 6;
  doc.setFontSize(FOOTER_SIZE);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  addWrappedLines(
    doc,
    wrapText(doc, document.footer, CONTENT_WIDTH_MM),
    MARGIN_MM,
    y,
    LINE_HEIGHT_MM
  );
  doc.setTextColor(0, 0, 0);

  return Buffer.from(doc.output("arraybuffer"));
}
