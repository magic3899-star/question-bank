import type { Importer } from '../../../contracts/index';
import { cleanupOcrLines, parseQuestionText, reportProgress } from '../text/index';
import type { OcrRecognize } from '../text/index';

export interface ImageImporterDependencies {
  /** 글자 인식(OCR). 없으면 이미지는 읽을 수 없다고 안내한다. */
  ocr?: OcrRecognize;
}

/** 사진·스캔 이미지(.png .jpg .bmp .webp)를 글자 인식(OCR)으로 읽어 문제를 만든다. */
export function createImageImporter(deps: ImageImporterDependencies = {}): Importer {
  return {
    kind: 'importer',
    id: 'image',
    label: '이미지(글자 인식)',
    extensions: ['.png', '.jpg', '.jpeg', '.bmp', '.webp'],
    async parse(input, options) {
      const fail = (code: string, message: string) => ({
        questions: [],
        passageGroups: [],
        assets: [],
        diagnostics: [{ code, severity: 'error' as const, message: `${input.fileName}: ${message}` }],
      });
      if (!deps.ocr)
        return fail('OCR_UNAVAILABLE', '이미지는 글자 인식(OCR)이 필요한데 이 환경에서는 쓸 수 없습니다.');
      let lines: string[];
      try {
        reportProgress(options, { label: '글자 인식(OCR)', done: 0, total: 1 });
        lines = cleanupOcrLines(await deps.ocr(input.data));
        reportProgress(options, { label: '글자 인식(OCR)', done: 1, total: 1 });
      } catch {
        return fail(
          'OCR_FAILED',
          '이미지를 읽을 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식입니다(PNG·JPG·BMP·WebP).',
        );
      }
      if (lines.join('').replace(/\s/gu, '').length < 10)
        return fail(
          'OCR_NO_TEXT',
          '글자 인식으로 글자를 찾지 못했습니다. 더 선명한 이미지로 다시 가져오세요.',
        );
      const draft = parseQuestionText(lines.join('\n'), {
        ...options,
        subject: typeof options?.subject === 'string' ? options.subject : '',
        sourceFile: input.fileName,
        pdfCopyCleanup: options?.pdfCopyCleanup !== false,
      });
      return {
        ...draft,
        diagnostics: [
          {
            code: 'IMAGE_OCR_USED',
            severity: 'warn',
            message:
              '이미지를 글자 인식(OCR)으로 읽었습니다. 인식 오류가 있을 수 있으니 모든 문제를 원본과 대조하세요. 특히 ①~⑤ 번호, 정답 표기, 숫자·기호·한자를 확인하세요.',
          },
          ...draft.diagnostics,
        ],
      };
    },
  };
}
