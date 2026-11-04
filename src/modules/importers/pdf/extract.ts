/** pdf.js 가 돌려주는 글자 조각 중 이 모듈이 쓰는 부분. */
interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  width: number;
  height: number;
  transform: number[];
}
interface PdfPage {
  getTextContent(): Promise<{ items: unknown[] }>;
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: Record<string, unknown>): { promise: Promise<void> };
}
interface PdfCanvas {
  encode(format: 'png'): Promise<Uint8Array>;
}
interface PdfDocument {
  numPages: number;
  canvasFactory?: { create(width: number, height: number): { canvas: PdfCanvas; context: unknown } };
  getPage(index: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}
interface PdfJs {
  getDocument(options: Record<string, unknown>): { promise: Promise<PdfDocument> };
}

export type PdfFailure = 'PDF_PASSWORD' | 'PDF_INVALID';
export class PdfReadError extends Error {
  constructor(
    readonly code: PdfFailure,
    message: string,
  ) {
    super(message);
  }
}

// 동적 import 를 변수로 두어 번들러가 pdf.js 를 앱 번들에 합치지 않고 설치된 패키지를 그대로 읽게 한다.
const PDFJS_ENTRY = 'pdfjs-dist/legacy/build/pdf.mjs';
let loaded: Promise<PdfJs> | undefined;
function loadPdfJs(): Promise<PdfJs> {
  loaded ??= import(PDFJS_ENTRY) as Promise<PdfJs>;
  return loaded;
}

const isTextItem = (item: unknown): item is PdfTextItem =>
  typeof item === 'object' && item !== null && typeof (item as PdfTextItem).str === 'string';

/**
 * PDF 의 글자를 읽기 순서대로 줄 단위로 돌려준다.
 * PDF 에서 복사해 붙여넣을 때와 같은 순서·같은 줄바꿈이라, 붙여넣기 해석 규칙을 그대로 쓸 수 있다.
 */
export async function extractPdfLines(data: Uint8Array): Promise<{ lines: string[]; pages: number }> {
  const pdfjs = await loadPdfJs();
  let document: PdfDocument;
  try {
    // 글꼴 파일·스크립트 실행은 글자 추출에 필요 없으므로 끈다(외부 파일을 읽지 않는다).
    document = await pdfjs.getDocument({
      data: new Uint8Array(data),
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : '';
    if (name === 'PasswordException')
      throw new PdfReadError('PDF_PASSWORD', '암호가 걸린 PDF입니다. 암호를 푼 파일로 다시 가져오세요.');
    throw new PdfReadError('PDF_INVALID', 'PDF를 열 수 없습니다. 파일이 손상되었거나 PDF가 아닙니다.');
  }
  try {
    const lines: string[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const { items } = await page.getTextContent();
      let line = '';
      let lastY: number | undefined;
      let lastEnd: number | undefined;
      const flush = () => {
        const text = line.replace(/[ \t ]+$/u, '');
        if (text.trim()) lines.push(text);
        line = '';
        lastY = undefined;
        lastEnd = undefined;
      };
      for (const item of items) {
        if (!isTextItem(item)) continue;
        const x = item.transform[4] ?? 0;
        const y = item.transform[5] ?? 0;
        const size = item.height || 10;
        if (line && lastY !== undefined && Math.abs(y - lastY) > Math.max(2, size * 0.5)) flush();
        // 같은 줄에서 공백 없이 떨어진 조각(표·다단 조판)은 한 칸 띄운다.
        if (
          line &&
          lastEnd !== undefined &&
          x - lastEnd > size * 0.3 &&
          !/\s$/u.test(line) &&
          !/^\s/u.test(item.str)
        )
          line += ' ';
        line += item.str;
        lastY = y;
        lastEnd = x + item.width;
        if (item.hasEOL) flush();
      }
      flush();
    }
    return { lines, pages: document.numPages };
  } catch {
    throw new PdfReadError(
      'PDF_INVALID',
      'PDF의 글자를 읽는 중 오류가 났습니다. 다른 PDF로 다시 시도하세요.',
    );
  } finally {
    await document.destroy().catch(() => undefined);
  }
}

/** 한 쪽의 긴 변이 이 값(픽셀)을 넘지 않게 그린다. 너무 크면 인식이 느려지고 메모리를 많이 쓴다. */
const MAX_PAGE_PIXELS = 3200;

/**
 * 스캔본 PDF 의 각 쪽을 글자 인식용 PNG 로 그린다(쪽 순서대로, 한 번에 한 쪽만 메모리에 둔다).
 */
export async function* renderPdfPages(
  data: Uint8Array,
  scale = 3,
): AsyncGenerator<{ png: Uint8Array; page: number; pages: number }> {
  const pdfjs = await loadPdfJs();
  const document = await pdfjs
    .getDocument({
      data: new Uint8Array(data),
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      verbosity: 0,
    })
    .promise.catch((cause: unknown) => {
      const name = cause instanceof Error ? cause.name : '';
      throw name === 'PasswordException'
        ? new PdfReadError('PDF_PASSWORD', '암호가 걸린 PDF입니다. 암호를 푼 파일로 다시 가져오세요.')
        : new PdfReadError('PDF_INVALID', 'PDF를 열 수 없습니다. 파일이 손상되었거나 PDF가 아닙니다.');
    });
  try {
    if (!document.canvasFactory)
      throw new PdfReadError('PDF_INVALID', '쪽을 그릴 수 없습니다. 프로그램을 다시 설치하세요.');
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const base = page.getViewport({ scale: 1 });
      const fit = Math.min(scale, MAX_PAGE_PIXELS / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale: fit });
      const { canvas, context } = document.canvasFactory.create(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      yield { png: await canvas.encode('png'), page: index, pages: document.numPages };
    }
  } finally {
    await document.destroy().catch(() => undefined);
  }
}
