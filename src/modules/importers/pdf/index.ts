import type { Diagnostic, ImportDraft, Importer } from '../../../contracts/index';
import { cleanupOcrLines, parseQuestionText, reportProgress } from '../text/index';
import type { OcrRecognize, TextOptions } from '../text/index';
import { extractPdfLines, PdfReadError, renderPdfPages } from './extract';
export { extractPdfLines, PdfReadError } from './extract';

type PageImages = AsyncIterable<{ png: Uint8Array; page: number; pages: number }>;

export interface PdfDependencies {
  /** 테스트에서 pdf.js 없이 줄 목록을 주입하기 위한 자리. */
  extract?: (data: Uint8Array) => Promise<{ lines: string[]; pages: number }>;
  /** 글자 없는 PDF(스캔본)를 읽을 때 쪽을 그림으로 만드는 함수. */
  renderPages?: (data: Uint8Array) => PageImages;
  /** 글자 인식(OCR). 없으면 스캔본 PDF 는 오류로 안내한다. */
  ocr?: OcrRecognize;
  /** OCR 로 읽을 최대 쪽 수. 너무 길면 시간이 오래 걸리므로 나누어 가져오게 한다. */
  maxOcrPages?: number;
}

const MAX_OCR_PAGES = 100;
/** 한 번에 인식을 맡겨 두는 쪽 수(인식기 수와 맞춘다). */
const OCR_PARALLEL = 2;

const failed = (diagnostic: Diagnostic): ImportDraft => ({
  questions: [],
  passageGroups: [],
  assets: [],
  diagnostics: [diagnostic],
});

export function createPdfImporter(deps: PdfDependencies = {}): Importer {
  const extract = deps.extract ?? extractPdfLines;
  const renderPages = deps.renderPages ?? ((data: Uint8Array) => renderPdfPages(data));
  const maxOcrPages = deps.maxOcrPages ?? MAX_OCR_PAGES;
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
      let lines = extracted.lines;
      const notes: Diagnostic[] = [];
      if (lines.join('').replace(/\s/gu, '').length < 10) {
        if (!deps.ocr)
          return failed({
            code: 'PDF_NO_TEXT',
            severity: 'error',
            message: `${input.fileName}: PDF에서 글자를 찾지 못했습니다. 그림으로만 된 PDF(스캔본)는 글자 인식(OCR)이 필요한데 이 환경에서는 쓸 수 없습니다. Word로 변환한 뒤 가져오세요.`,
          });
        if (extracted.pages > maxOcrPages)
          return failed({
            code: 'PDF_TOO_LONG_FOR_OCR',
            severity: 'error',
            message: `${input.fileName}: 스캔본 PDF가 ${extracted.pages}쪽입니다. 글자 인식은 한 파일에 ${maxOcrPages}쪽까지 가능합니다. PDF를 나눈 뒤 가져오세요.`,
          });
        try {
          lines = await recognizePages(input.data, renderPages, deps.ocr, options);
        } catch (cause) {
          const code = cause instanceof PdfReadError ? cause.code : 'OCR_FAILED';
          const reason =
            cause instanceof PdfReadError
              ? cause.message
              : '글자 인식 중 오류가 났습니다. 프로그램을 다시 시작한 뒤 시도하세요.';
          return failed({ code, severity: 'error', message: `${input.fileName}: ${reason}` });
        }
        if (lines.join('').replace(/\s/gu, '').length < 10)
          return failed({
            code: 'OCR_NO_TEXT',
            severity: 'error',
            message: `${input.fileName}: 글자 인식으로도 글자를 찾지 못했습니다. 화질이 낮거나 글자가 없는 스캔본일 수 있습니다. 더 선명하게 스캔한 파일로 다시 가져오세요.`,
          });
        notes.push({
          code: 'PDF_OCR_USED',
          severity: 'warn',
          message: `그림으로 된 PDF(스캔본)라 글자 인식(OCR)으로 읽었습니다(${extracted.pages}쪽). 인식 오류가 있을 수 있으니 모든 문제를 원본과 대조하세요. 특히 ①~⑤ 번호, 정답 표기, 숫자·기호·한자를 확인하세요.`,
        });
      }
      const textOptions: TextOptions = {
        ...options,
        subject: typeof options?.subject === 'string' ? options.subject : '',
        sourceFile: input.fileName,
        pdfCopyCleanup: options?.pdfCopyCleanup !== false,
        joinWrappedLinesWith: options?.joinWrappedLinesWith === 'none' ? 'none' : 'space',
      };
      const draft = parseQuestionText(lines.join('\n'), textOptions);
      return {
        ...draft,
        diagnostics: [
          ...notes,
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

/** 쪽을 한 장씩 그려 인식기에 맡기고, 쪽 순서대로 이어 붙인 줄을 돌려준다. */
async function recognizePages(
  data: Uint8Array,
  renderPages: (data: Uint8Array) => PageImages,
  ocr: OcrRecognize,
  options: Record<string, unknown> | undefined,
): Promise<string[]> {
  const jobs: Promise<string[]>[] = [];
  let finished = 0;
  let total = 0;
  const track = (job: Promise<string[]>) =>
    job.then((result) => {
      finished++;
      reportProgress(options, { label: '글자 인식(OCR)', done: finished, total });
      return result;
    });
  for await (const page of renderPages(data)) {
    total = page.pages;
    jobs.push(track(ocr(page.png)));
    // 그린 쪽이 쌓여 메모리를 먹지 않도록 인식이 앞서 끝나길 기다린다.
    if (jobs.length - finished >= OCR_PARALLEL) await Promise.race(jobs.slice(finished));
  }
  const perPage = await Promise.all(jobs);
  return cleanupOcrLines(perPage.flat());
}

export const pdfImporter: Importer = createPdfImporter();
