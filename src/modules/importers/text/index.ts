import type { Block, ImportDraft, Importer } from '../../../contracts/index';
import { parseLayout, standardProfile, validateProfile } from '../../layout-parser/index';
import type { LayoutOptions, LayoutProfile } from '../../layout-parser/index';
import { cleanupPdf, normalizeLines } from './cleanup';

export interface TextOptions extends LayoutOptions {
  profile?: LayoutProfile;
  pdfCopyCleanup?: boolean;
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
      : cleanupPdf(normalized, profile);
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
export function parseExplanationText(
  text: string,
  profile: LayoutProfile = standardProfile,
): { number: string; explanation: Block[] }[] {
  const errors = validateProfile(profile);
  if (errors.length) throw new Error(`해설 양식 설정을 확인하세요. ${errors.join(' ')}`);
  const pattern = new RegExp(
    profile.explanationNumberPattern ?? standardProfile.explanationNumberPattern!,
    'u',
  );
  const result: { number: string; explanation: Block[] }[] = [];
  for (const line of normalizeLines(text)) {
    const match = pattern.exec(line.text);
    if (match?.[1]) result.push({ number: match[1], explanation: [] });
    const content = match ? line.text.slice(match[0].length) : line.text;
    if (result.length && content.trim())
      result.at(-1)!.explanation.push({ type: 'paragraph', runs: [{ text: content }] });
  }
  return result;
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
