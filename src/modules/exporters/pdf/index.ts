import type { Exporter, ExportedFile } from '../../../contracts/index';
import { createExportFileName } from '../../content-model/index';
import { renderExamHtml } from '../../render-html/index';

export type PdfRenderer = (
  html: string,
  page: {
    paper: 'A4';
    marginMm: number;
    printBackground: true;
    pageNumbers: boolean;
  },
) => Promise<Uint8Array>;

export function createPdfExporter(renderPdf: PdfRenderer, opts?: { fontFaceCss?: string }): Exporter {
  return {
    kind: 'exporter',
    id: 'pdf',
    label: 'PDF',
    extension: 'pdf',
    async export(snapshots, options) {
      const used = new Set<string>();
      const result: ExportedFile[] = [];
      const documents = renderExamHtml(snapshots, { ...options, fontFaceCss: opts?.fontFaceCss });
      let offset = 0;
      for (const snapshot of snapshots) {
        const count = options.parts.length ? (options.combineParts ? 1 : new Set(options.parts).size) : 0;
        for (const document of documents.slice(offset, offset + count)) {
          try {
            const data = await renderPdf(document.html, {
              paper: 'A4',
              marginMm: 18,
              printBackground: true,
              pageNumbers: true,
            });
            result.push({
              fileName: createExportFileName(snapshot.title, document.part, 'pdf', used),
              mime: 'application/pdf',
              part: document.part,
              data,
            });
          } catch (error: unknown) {
            throw new Error(
              `PDF 변환에 실패했습니다. 글꼴과 인쇄 설정을 확인한 뒤 다시 시도하세요. ${error instanceof Error ? error.message : String(error)}`,
              { cause: error },
            );
          }
        }
        offset += count;
      }
      return result;
    },
  };
}
