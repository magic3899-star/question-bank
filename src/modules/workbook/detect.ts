import type { BookKind, SourceLine } from './types';

export const answerStart = /^(\d{3})\s*[〉>]{2,3}\s*정답\s*([①②③④⑤])/u;
export const answerBoundary = /^(\d{3})\s*(?:[〉>]+\s*정답|정답)/u;

export function hasFirstChoice(lines: readonly SourceLine[], index: number): boolean {
  for (let next = index + 1; next <= index + 40 && next < lines.length; next++) {
    const text = lines[next].text;
    if (
      text === 'PART' ||
      /^\d{3}$/u.test(text) ||
      /^(?:KILLER POINT|출제 연도 기출 내용|제\s+\d+\s+장)/u.test(text) ||
      lines[next].noise
    )
      break;
    if (!lines[next].noise && /^①/u.test(text)) return true;
  }
  return false;
}

export function detectBook(lines: readonly string[]): BookKind {
  if (lines.filter((line) => answerStart.test(line.trim())).length >= 20) return 'answers';
  const entries = lines.map((text, index) => ({ text: text.trim(), sourceLine: index + 1, noise: false }));
  let count = 0;
  for (let index = 0; index < entries.length; index++) {
    if (/^\d{3}$/u.test(entries[index].text) && hasFirstChoice(entries, index)) count++;
  }
  return count >= 20 ? 'questions' : 'unknown';
}
