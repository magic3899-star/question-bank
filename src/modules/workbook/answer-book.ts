import { findSubjectByPrefix, subjectCatalog } from '../subject-catalog/index';
import { parseObjectiveCode } from '../objective-code/index';
import { answerBoundary, answerStart } from './detect';
import { appendWrapped } from './join';
import { prepareLines } from './noise';
import type { ParseContext, ParsedAnswer, WorkbookBook } from './types';
import type { Vocabulary } from './vocabulary';

interface AnswerEntry extends Omit<ParsedAnswer, 'subjectId'> {
  prefixes: string[];
}

const paragraphStart = /^(?:[•ㆍ※①②③④⑤]|-|cf\)|\d+\))/u;

export function parseAnswerBook(
  book: WorkbookBook,
  vocab: Vocabulary,
  context: ParseContext,
): ParsedAnswer[] {
  const result: ParsedAnswer[] = [];
  const seen = new Set<string>();
  let segment: AnswerEntry[] = [];
  let ordinal = 0;
  let current: AnswerEntry | undefined;
  let title = true;
  const report = (code: string, message: string, severity: 'warn' | 'error' = 'warn'): void => {
    context.diagnostics.push({ code, severity, message: `${book.name}: ${message}` });
  };
  const finishSegment = (): void => {
    if (!segment.length) return;
    const counts = new Map<string, number>();
    for (const entry of segment) {
      for (const prefix of entry.prefixes) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    const ranked = [...counts].sort((a, b) => b[1] - a[1]);
    const inferred = subjectCatalog[ordinal];
    const majority = ranked[0]?.[0];
    const ambiguous = !!majority && ranked[0]?.[1] === ranked[1]?.[1];
    const subject = majority ? findSubjectByPrefix(majority) : inferred;
    if (majority && (ambiguous || !subject || subject.id !== inferred?.id)) {
      report(
        'WORKBOOK_PART_MISMATCH',
        `${ordinal + 1}번째 구간의 학습목표 접두(${majority})가 순서상 과목과 다릅니다. 접두 기준을 우선하며, 불확실한 항목은 제외합니다.`,
      );
    }
    for (const entry of segment) {
      if (!subject || ambiguous) {
        report(
          'WORKBOOK_PART_MISMATCH',
          `${entry.number}번의 과목을 확정할 수 없어 제외했습니다. 학습목표 접두를 확인하세요.`,
        );
        continue;
      }
      if (entry.prefixes.some((prefix) => prefix !== subject.prefix)) {
        entry.objectiveCode = undefined;
        report(
          'WORKBOOK_PART_MISMATCH',
          `${subject.name} ${entry.number}번: 학습목표(◆ ${entry.prefixes.join(' · ')})가 과목과 달라 비웠습니다`,
        );
      }
      const key = `${subject.id}:${entry.number}`;
      if (seen.has(key)) {
        report(
          'WORKBOOK_DUPLICATE_ANSWER',
          `${subject.name} ${entry.number}번 정답이 중복되어 앞의 항목을 사용합니다. 중복을 확인하세요.`,
        );
        continue;
      }
      seen.add(key);
      const { prefixes: _prefixes, ...answer } = entry;
      result.push({ ...answer, subjectId: subject.id });
    }
    segment = [];
    ordinal++;
  };
  for (const line of prepareLines(book.lines, context)) {
    const { text, sourceLine } = line;
    const boundary = answerBoundary.exec(text);
    if (boundary) {
      const number = Number(boundary[1]);
      if (current && number <= current.number) finishSegment();
      const match = answerStart.exec(text);
      const valid = !!match && /^[①②③④⑤]$/u.test(text.slice(match[0].length - 1).trim());
      if (!valid)
        report(
          'WORKBOOK_ANSWER_FORMAT',
          `${number}번 정답 형식이 올바르지 않습니다. 정답 뒤에 원문자 하나만 적으세요.`,
          'error',
        );
      current = {
        number,
        answerLabel: valid ? match![2] : undefined,
        titleParagraph: '',
        paragraphs: [],
        prefixes: [],
        sourceLine,
      };
      segment.push(current);
      title = true;
      continue;
    }
    if (line.noise || !text || !current) continue;
    if (/^\d{1,3}$/u.test(text)) {
      context.discarded++;
      continue;
    }
    if (text.startsWith('◆')) {
      const raw = text.slice(1).trim();
      const prefix = /^([^\s\d]+)/u.exec(raw)?.[1];
      if (prefix) current.prefixes.push(prefix);
      const parsed = parseObjectiveCode(raw);
      current.objectiveCode =
        parsed && parsed.segments.length === 3 ? `${parsed.subject} ${parsed.segments.join('-')}` : undefined;
      continue;
    }
    if (paragraphStart.test(text)) title = false;
    if (title) {
      const paragraphs = current.titleParagraph ? [current.titleParagraph] : [];
      appendWrapped(paragraphs, text, vocab, context);
      current.titleParagraph = paragraphs[0] ?? '';
    } else appendWrapped(current.paragraphs, text, vocab, context, paragraphStart.test(text));
  }
  finishSegment();
  return result;
}
