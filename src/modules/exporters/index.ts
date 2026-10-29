import type { Exporter } from '../../contracts/index';
import { docxExporter } from './docx/index';
import { xlsxExporter } from './xlsx/index';
import { createPdfExporter } from './pdf/index';
import type { PdfRenderer } from './pdf/index';

export function createExporters(deps?: { renderPdf?: PdfRenderer; fontFaceCss?: string }): Exporter[] {
  return [docxExporter, xlsxExporter, ...(deps?.renderPdf ? [createPdfExporter(deps.renderPdf, { fontFaceCss: deps.fontFaceCss })] : [])];
}
