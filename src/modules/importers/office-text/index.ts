import type { Diagnostic, ImportDraft, Importer } from '../../../contracts/index';
import { decodeTextBytes, parseQuestionText } from '../text/index';
import { extractHtmlLines } from './html';
import { extractHwpxLines } from './hwpx';
import { extractOdtLines } from './odt';
import { extractRtfLines } from './rtf';

interface Format {
  label: string;
  extract(data: Uint8Array): Promise<string[]> | string[];
}

function htmlLines(data: Uint8Array): string[] {
  const html = decodeTextBytes(data);
  if (html === undefined) throw new Error('HTML 파일의 글자 인코딩을 읽을 수 없습니다.');
  return extractHtmlLines(html);
}

const formats: Record<string, Format> = {
  '.hwpx': { label: '한글(.hwpx)', extract: extractHwpxLines },
  '.odt': { label: 'OpenDocument(.odt)', extract: extractOdtLines },
  '.rtf': { label: 'RTF', extract: extractRtfLines },
  '.html': { label: 'HTML', extract: htmlLines },
  '.htm': { label: 'HTML', extract: htmlLines },
};

const extensionOf = (fileName: string) => /\.[^.]+$/u.exec(fileName)?.[0].toLowerCase() ?? '';
const failed = (diagnostic: Diagnostic): ImportDraft => ({
  questions: [],
  passageGroups: [],
  assets: [],
  diagnostics: [diagnostic],
});

/**
 * 글자만 읽을 수 있는 문서 형식(한글 hwpx, OpenDocument, RTF, HTML)을 가져온다.
 * 문단 단위로 읽으므로 PDF 와 달리 줄 이어 붙이기 보정을 하지 않는다.
 */
export const officeTextImporter: Importer = {
  kind: 'importer',
  id: 'office-text',
  label: '한글·OpenDocument·RTF·HTML 문서',
  extensions: Object.keys(formats),
  async parse(input, options) {
    const format = formats[extensionOf(input.fileName)];
    if (!format)
      return failed({
        code: 'DOCUMENT_UNSUPPORTED',
        severity: 'error',
        message: `${input.fileName}: 지원하지 않는 형식입니다.`,
      });
    let lines: string[];
    try {
      lines = await format.extract(input.data);
    } catch (cause) {
      const known = cause instanceof Error && /[가-힣]/u.test(cause.message);
      return failed({
        code: 'DOCUMENT_INVALID',
        severity: 'error',
        message: `${input.fileName}: ${format.label} 문서를 읽을 수 없습니다. ${
          known ? (cause as Error).message : '파일이 손상되었거나 형식이 다릅니다.'
        }`,
      });
    }
    const text = lines.join('\n');
    if (text.replace(/\s/gu, '').length < 10)
      return failed({
        code: 'DOCUMENT_NO_TEXT',
        severity: 'error',
        message: `${input.fileName}: 문서에서 글자를 찾지 못했습니다. 글자가 아닌 그림으로만 된 문서일 수 있습니다.`,
      });
    const draft = parseQuestionText(text, {
      ...options,
      subject: typeof options?.subject === 'string' ? options.subject : '',
      sourceFile: input.fileName,
      pdfCopyCleanup: false,
    });
    return {
      ...draft,
      diagnostics: [
        {
          code: 'DOCUMENT_TEXT_ONLY',
          severity: 'info',
          message: `${format.label} 문서는 글자만 읽습니다. 밑줄·굵게·표·그림·수식은 가져오지 않으므로 미리보기에서 원본과 비교해 확인하세요. 서식이 중요하면 Word(.docx)로 저장해 가져오세요.`,
        },
        ...draft.diagnostics,
      ],
    };
  },
};
