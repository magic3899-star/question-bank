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
export const textImporter: Importer = {
  kind: 'importer',
  id: 'text',
  label: '텍스트 문서',
  extensions: ['.txt'],
  async parse(input, options) {
    try {
      return parseQuestionText(new TextDecoder('utf-8', { fatal: true }).decode(input.data), {
        ...options,
        subject: typeof options?.subject === 'string' ? options.subject : '',
        sourceFile: input.fileName,
      });
    } catch {
      return {
        questions: [],
        passageGroups: [],
        assets: [],
        diagnostics: [
          {
            code: 'TEXT_INVALID',
            severity: 'error',
            message: `${input.fileName}: UTF-8 텍스트를 읽을 수 없습니다. UTF-8로 다시 저장한 뒤 가져오세요.`,
          },
        ],
      };
    }
  },
};
