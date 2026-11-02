import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { DOMParser } from '@xmldom/xmldom';
import type { Element, Node } from '@xmldom/xmldom';

const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export function parseWordXml(xml: string) {
  return new DOMParser({ onError: (level, message) => {
    if (level !== 'warning') throw new Error(`Word XML이 올바르지 않습니다: ${message}`);
  } }).parseFromString(xml, 'application/xml');
}

export function wordNodeText(node: Node): string {
  if (node.namespaceURI === wordNamespace) {
    if (node.localName === 't') return node.textContent ?? '';
    if (['br', 'cr'].includes(node.localName ?? '')) return '\n';
    if (node.localName === 'tab') return '\t';
  }
  return Array.from(node.childNodes ?? []).map(wordNodeText).join('');
}

export function wordParagraphs(root: Element): string[] {
  return Array.from(root.getElementsByTagNameNS(wordNamespace, 'p')).map(wordNodeText);
}

export async function inspectDocx(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('Word 본문이 없습니다.');
  const xml = await entry.async('string');
  const document = parseWordXml(xml);
  return { zip, xml, document, paragraphs: wordParagraphs(document.documentElement!) };
}

export async function docxPlainText(bytes: Uint8Array): Promise<string> {
  return (await inspectDocx(bytes)).paragraphs.join('\n');
}

export function xlsxCellText(value: ExcelJS.CellValue): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object' && 'richText' in value) return value.richText.map((run) => run.text).join('');
  return String(value);
}

export async function readXlsx(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(bytes).buffer);
  return workbook;
}

export async function xlsxPlainText(bytes: Uint8Array): Promise<Record<string, string[][]>> {
  const workbook = await readXlsx(bytes);
  return Object.fromEntries(workbook.worksheets.map((sheet) => [sheet.name,
    Array.from({ length: sheet.rowCount }, (_, index) => Array.from({ length: sheet.columnCount }, (_, col) =>
      xlsxCellText(sheet.getRow(index + 1).getCell(col + 1).value)))]));
}
