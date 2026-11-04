import type { Diagnostic, ImportDraft, Importer } from '../../../contracts/index';
import { parseQuestionText } from '../text/index';
import type { TextOptions } from '../text/index';
import { extractPdfLines, PdfReadError } from './extract';

export interface PdfDependencies {
  /** 테스트에서 pdf.js 없이 줄 목록을 주입하기 위한 자리. */
  extract?: (data: Uint8Array) => Promise<{ lines: string[]; pages: number }>;
}

const failed = (diagnostic: Diagnostic): ImportDraft => ({
  questions: [],
  passageGroups: [],
  assets: [],
  diagnostics: [diagnostic],
});

export function createPdfImporter(deps: PdfDependencies = {}): Importer {
  const extract = deps.extract ?? extractPdfLines;
  return {
    kind: 'importer',
    id: 'pdf',
    label: 'PDF 문서',
    extensions: ['.pdf'],
    async parse(input, options) {
      let extracted: { lines: string[]; pages: number };
      try {
        extracted = await extract(input.data);
      } catch (cause) {
        const code = cause instanceof PdfReadError ? cause.code : 'PDF_INVALID';
        const reason = cause instanceof PdfReadError ? cause.message : 'PDF를 읽을 수 없습니다.';
        return failed({ code, severity: 'error', message: `${input.fileName}: ${reason}` });
      }
      const text = extracted.lines.join('\n');
      if (text.replace(/\s/gu, '').length < 10)
        return failed({
          code: 'PDF_NO_TEXT',
          severity: 'error',
          message: `${input.fileName}: PDF에서 글자를 찾지 못했습니다. 그림으로만 된 PDF(스캔본)는 읽을 수 없으니, 글자를 드래그해 복사할 수 있는 PDF를 쓰거나 Word로 변환한 뒤 가져오세요.`,
        });
      const textOptions: TextOptions = {
        ...options,
        subject: typeof options?.subject === 'string' ? options.subject : '',
        sourceFile: input.fileName,
        pdfCopyCleanup: options?.pdfCopyCleanup !== false,
        joinWrappedLinesWith: options?.joinWrappedLinesWith === 'none' ? 'none' : 'space',
      };
      const draft = parseQuestionText(text, textOptions);
      return {
        ...draft,
        diagnostics: [
          {
            code: 'PDF_TEXT_ONLY',
            severity: 'info',
            message: `PDF는 글자만 읽습니다(${extracted.pages}쪽). 밑줄·굵게·표·그림·수식은 가져오지 않으므로 미리보기에서 원본과 비교해 확인하세요. 서식이 중요하면 Word 파일로 가져오세요.`,
          },
          ...draft.diagnostics,
        ],
      };
    },
  };
}

export const pdfImporter: Importer = createPdfImporter();
