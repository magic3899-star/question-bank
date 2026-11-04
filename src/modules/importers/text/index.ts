import type { ImportDraft, Importer } from '../../../contracts/index';
import { parseLayout, standardProfile, validateProfile } from '../../layout-parser/index';
import type { LayoutOptions, LayoutProfile } from '../../layout-parser/index';
import { cleanupPdf, normalizeLines } from './cleanup';
import type { JoinWrappedLinesWith } from './cleanup';
export { parseExplanationText } from './explanation';
export type { ExplanationTextOptions, TextExplanation } from './explanation';
export type { JoinWrappedLinesWith } from './cleanup';

export interface TextOptions extends LayoutOptions {
  profile?: LayoutProfile;
  pdfCopyCleanup?: boolean;
  joinWrappedLinesWith?: JoinWrappedLinesWith;
}
export function parseQuestionText(text: string, options: TextOptions): ImportDraft {
  const profile = options.profile ?? standardProfile;
  const errors = validateProfile(profile);
  if (errors.length)
    return {
      questions: [],
      passageGroups: [],
      assets: [],
      diagnostics: [
        {
          severity: 'error',
          code: 'LAYOUT_INVALID',
          message: `문서 양식 설정을 확인하세요. ${errors.join(' ')}`,
        },
      ],
    };
  const normalized = normalizeLines(text);
  const cleaned =
    options.pdfCopyCleanup === false
      ? { lines: normalized, diagnostics: [] }
      : cleanupPdf(normalized, profile, options.joinWrappedLinesWith);
  const parsed = parseLayout(
    cleaned.lines.map((line) => ({
      block: { type: 'paragraph', runs: [{ text: line.text }] },
      text: line.text,
      sourceIndex: line.sourceIndex,
      kind: 'paragraph',
    })),
    profile,
    options,
  );
  return {
    questions: parsed.questions,
    assets: [],
    passageGroups: [],
    diagnostics: [...parsed.diagnostics, ...cleaned.diagnostics],
  };
}
/**
 * 텍스트 파일 바이트를 글자로 바꾼다. UTF-8 이 아니면 한국어 Windows 메모장의 'ANSI'(CP949)로 다시 읽는다.
 * 어느 쪽도 아니면 undefined.
 */
export function decodeTextBytes(data: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    // UTF-8 이 아니면 CP949 로 시도한다.
  }
  try {
    const text = new TextDecoder('euc-kr', { fatal: true }).decode(data);
    // 잘못된 변환은 제어 문자나 대체 문자가 섞이므로 걸러 낸다.
    return /[\u0000-\u0008\u000e-\u001f\ufffd]/u.test(text) ? undefined : text;
  } catch {
    return undefined;
  }
}

export const textImporter: Importer = {
  kind: 'importer',
  id: 'text',
  label: '텍스트 문서',
  extensions: ['.txt', '.md'],
  async parse(input, options) {
    const text = decodeTextBytes(input.data);
    if (text === undefined)
      return {
        questions: [],
        passageGroups: [],
        assets: [],
        diagnostics: [
          {
            code: 'TEXT_INVALID',
            severity: 'error',
            message: `${input.fileName}: 텍스트를 읽을 수 없습니다. 메모장에서 UTF-8로 다시 저장한 뒤 가져오세요.`,
          },
        ],
      };
    return parseQuestionText(text, {
      ...options,
      subject: typeof options?.subject === 'string' ? options.subject : '',
      sourceFile: input.fileName,
    });
  },
};
