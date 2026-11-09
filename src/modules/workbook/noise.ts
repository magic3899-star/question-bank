import { subjectCatalog } from '../subject-catalog/index';
import type { ParseContext, SourceLine } from './types';

const subjectNames = subjectCatalog.map((subject) => subject.name).join('|');
const noisePatterns = [
  // 책 시리즈 이름은 책마다 다르므로 '연도 + 짧은 이름' 꼴만 본다.
  /^(?:\d{4}\s+.{1,40}?\s+)?치과위생사 국가시험\s*-?\s*\d교시(?:\s*\d{1,3})?$/u,
  /^\d{4}\s+(?:[가-힣]{1,3}\s+)?[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*$/u,
  new RegExp(`^PART\\s*\\d{2}\\s+(?:${subjectNames})\\s+\\d{1,3}$`, 'u'),
  new RegExp(
    `^H\\s*·\\s*Y\\s*·\\s*G\\s*·\\s*I\\s*·\\s*E\\s*·\\s*N\\s*·\\s*I\\s*·\\s*S\\s*·\\s*TPART\\s*\\d{2}\\s+(?:${subjectNames})$`,
    'u',
  ),
  /^\d{2}$/u,
  /^Memo$/iu,
];
const decoration = /[\s·・.…]/gu;
const decorationTexts = new Set(['DENTALHYGIENIST', 'HYGIENIST']);

export function isNoise(text: string): boolean {
  return (
    noisePatterns.some((pattern) => pattern.test(text)) || decorationTexts.has(text.replace(decoration, ''))
  );
}

export function prepareLines(lines: readonly string[], context: ParseContext): SourceLine[] {
  return lines.map((line, index) => {
    const text = line.trim();
    const noise = isNoise(text);
    if (noise) context.discarded++;
    // 경계 표식을 남겨야 머리글 뒤의 요약이 마지막 선지에 붙지 않는다.
    return { text, noise, sourceLine: index + 1 };
  });
}
