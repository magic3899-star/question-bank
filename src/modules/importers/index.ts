import type { Importer } from '../../contracts/index';
import { docxImporter } from './docx/index';
import { createImageImporter } from './image/index';
import { officeTextImporter } from './office-text/index';
import { createPdfImporter } from './pdf/index';
import { textImporter } from './text/index';
import type { OcrRecognize } from './text/index';

export { docxImporter, standardProfile, validateProfile } from './docx/index';
export type { LayoutProfile } from './docx/index';
export { textImporter, parseQuestionText, parseExplanationText } from './text/index';
export type { ImportProgress, OcrRecognize, TextOptions } from './text/index';
export { createPdfImporter, pdfImporter, extractPdfLines, PdfReadError } from './pdf/index';
export { createImageImporter } from './image/index';
export { officeTextImporter } from './office-text/index';

/**
 * 가져오기 화면이 쓰는 모든 형식. 형식을 늘릴 때는 여기에만 추가한다.
 * ocr 를 주면 스캔본 PDF 와 이미지를 글자 인식으로 읽는다.
 */
export function createImporters(deps: { ocr?: OcrRecognize } = {}): readonly Importer[] {
  return [
    docxImporter,
    createPdfImporter({ ocr: deps.ocr }),
    officeTextImporter,
    createImageImporter({ ocr: deps.ocr }),
    textImporter,
  ];
}

export const importerExtensions: readonly string[] = createImporters().flatMap(
  (importer) => importer.extensions,
);
