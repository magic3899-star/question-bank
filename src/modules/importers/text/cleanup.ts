import type { Diagnostic } from '../../../contracts/index';
import type { LayoutProfile } from '../../layout-parser/index';

export interface TextLine {
  text: string;
  sourceIndex: number;
}
export function normalizeLines(text: string): TextLine[] {
  return text
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line, i) => ({ text: line, sourceIndex: i + 1 }));
}
export function cleanupPdf(
  lines: TextLine[],
  profile: LayoutProfile,
): { lines: TextLine[]; diagnostics: Diagnostic[] } {
  const patterns = [
    profile.stemStartPattern,
    profile.answerLabelPattern,
    profile.explanationLabelPattern,
    profile.objectiveLinePattern,
    profile.sourceTagPattern,
  ].map((p) => new RegExp(p, 'u'));
  const boundary = (text: string) =>
    patterns.some((p) => p.test(text)) || profile.choiceMarkers.some((m) => text.trimStart().startsWith(m));
  const startsContent = (text: string) =>
    new RegExp(profile.stemStartPattern, 'u').test(text) ||
    new RegExp(profile.explanationLabelPattern, 'u').test(text) ||
    profile.choiceMarkers.some((m) => text.trimStart().startsWith(m));
  const frequency = new Map<string, number>();
  lines.forEach((l) => {
    if (l.text.trim()) frequency.set(l.text.trim(), (frequency.get(l.text.trim()) ?? 0) + 1);
  });
  const diagnostics: Diagnostic[] = [];
  const result: TextLine[] = [];
  let joinable = false;
  for (const original of lines) {
    const text = original.text
      .replace(/(?<=[①-⑩])[ \t\u00a0\u3000]+|[ \t\u00a0\u3000]+(?=[①-⑩])/gu, ' ')
      .trim();
    const artifact =
      /^\s*(?:-\s*\d+\s*-|\d+(?:\s*\/\s*\d+)?)\s*$/u.test(text) ||
      (!!text && !boundary(text) && (frequency.get(original.text.trim()) ?? 0) > 1);
    if (artifact)
      diagnostics.push({
        code: 'PDF_ARTIFACT_SUSPECTED',
        severity: 'warn',
        message: `${original.sourceIndex}번째 줄에 쪽 번호 또는 반복 머리글로 의심되는 내용이 있습니다. 원문을 유지했으니 미리보기에서 확인하고 필요하면 삭제하세요.`,
      });
    const markers = [...text.matchAll(/[①-⑩]/gu)];
    const sequential = markers.length >= 2 && markers.every((m, i) => m[0] === profile.choiceMarkers[i]);
    // 라벨 뒤 원문자는 정답·해설의 참조일 수 있으므로 선지로 나누지 않는다.
    const split = sequential && !patterns.slice(1).some((p) => p.test(text));
    const parts = split
      ? [
          text.slice(0, markers[0]!.index).trim(),
          ...markers.map((m, i) => text.slice(m.index, markers[i + 1]?.index).trim()),
        ].filter(Boolean)
      : [text];
    for (const part of parts) {
      if (part && !artifact && !boundary(part) && joinable && result.at(-1)?.text) {
        result.at(-1)!.text += ` ${part}`;
      } else {
        result.push({ text: part, sourceIndex: original.sourceIndex });
        joinable = !!part && !artifact && startsContent(part);
      }
    }
  }
  return { lines: result, diagnostics };
}
