import type { Importer } from '../../contracts/index';
import { docxImporter } from './docx/index';
import { officeTextImporter } from './office-text/index';
import { pdfImporter } from './pdf/index';
import { textImporter } from './text/index';

export { docxImporter, standardProfile, validateProfile } from './docx/index';
export type { LayoutProfile } from './docx/index';
export { textImporter, parseQuestionText, parseExplanationText } from './text/index';
export type { TextOptions } from './text/index';
export { createPdfImporter, pdfImporter } from './pdf/index';
export { officeTextImporter } from './office-text/index';

/** 가져오기 화면이 쓰는 모든 형식. 형식을 늘릴 때는 여기에만 추가한다. */
export const allImporters: readonly Importer[] = [
  docxImporter,
  pdfImporter,
  officeTextImporter,
  textImporter,
];

export const importerExtensions: readonly string[] = allImporters.flatMap((importer) => importer.extensions);
