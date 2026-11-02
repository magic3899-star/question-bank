import type { Block, Diagnostic } from '../../../contracts/index';
import { standardProfile, validateProfile } from '../../layout-parser/index';
import type { LayoutProfile } from '../../layout-parser/index';
import { cleanupPdf, normalizeLines } from './cleanup';
import type { JoinWrappedLinesWith, TextLine } from './cleanup';

export interface ExplanationTextOptions {
  profile?: LayoutProfile;
  joinWrappedLinesWith?: JoinWrappedLinesWith;
  pdfCopyCleanup?: boolean;
}
export interface TextExplanation {
  number: string;
  explanation: Block[];
  answerLabels?: string[];
  diagnostics?: Diagnostic[];
}
export function parseExplanationText(
  text: string,
  options: ExplanationTextOptions | LayoutProfile = {},
): TextExplanation[] {
  const config = 'id' in options ? { profile: options } : options;
  const profile = config.profile ?? standardProfile;
  const errors = validateProfile(profile);
  if (errors.length) throw new Error(`해설 양식 설정을 확인하세요. ${errors.join(' ')}`);
  const pattern = new RegExp(
    profile.explanationNumberPattern ?? standardProfile.explanationNumberPattern!,
    'u',
  );
  const normalized = normalizeLines(text);
  const groups: { number: string; lines: TextLine[] }[] = [];
  for (const line of normalized) {
    const match = pattern.exec(line.text);
    if (match?.[1]) groups.push({ number: match[1], lines: [] });
    if (groups.length)
      groups.at(-1)!.lines.push({ ...line, text: match ? line.text.slice(match[0].length) : line.text });
  }
  const artifacts =
    config.pdfCopyCleanup === false
      ? []
      : cleanupPdf(normalized, profile, config.joinWrappedLinesWith, true).diagnostics;
  return groups.map((group) => {
    const labels: string[] = [];
    let bodyStarted = false;
    const lines = group.lines.map((line) => {
      const answer =
        !bodyStarted &&
        /^\s*(?:\[정답\]|정답|답)\s*[:：]?\s*((?:[①-⑩]|\d+)(?:[ \t,，]+(?:[①-⑩]|\d+))*)\s*$/u.exec(line.text);
      if (answer) {
        labels.push(...(answer[1]!.match(/[①-⑩]|\d+/gu) ?? []));
        return { ...line, text: '' };
      }
      if (line.text.trim()) bodyStarted = true;
      return line;
    });
    const cleaned =
      config.pdfCopyCleanup === false
        ? { lines, diagnostics: [] }
        : cleanupPdf(lines, profile, config.joinWrappedLinesWith, true, normalized);
    return {
      number: group.number,
      explanation: cleaned.lines
        .filter((line) => line.text.trim())
        .map((line): Block => ({ type: 'paragraph', runs: [{ text: line.text }] })),
      ...(labels.length ? { answerLabels: [...new Set(labels)] } : {}),
      ...(artifacts.length ? { diagnostics: artifacts } : {}),
    };
  });
}
