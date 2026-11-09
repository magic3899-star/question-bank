import { findSubjectById, findSubjectByName } from '../subject-catalog/index';
import type { CatalogSubject } from '../subject-catalog/index';
import { hasFirstChoice } from './detect';
import { appendWrapped } from './join';
import { prepareLines } from './noise';
import type { ParseContext, ParsedQuestion, WorkbookBook } from './types';
import type { Vocabulary } from './vocabulary';

const paragraphStart = /^(?:[•ㆍ※㉠-㉤<]|-|(\([가나다]\)))/u;
const endOfQuestion = /^(?:KILLER POINT|출제 연도 기출 내용|제\s+\d+\s+장)/u;
const labels = '①②③④⑤';
const choiceMarkers = /[⓪①-⑳㉑-㉟㊱-㊿]/gu;

export function parseQuestionBook(
  book: WorkbookBook,
  vocab: Vocabulary,
  context: ParseContext,
): ParsedQuestion[] {
  const lines = prepareLines(book.lines, context);
  const result: ParsedQuestion[] = [];
  const counts = new Map<string, number>();
  let subject: CatalogSubject | undefined;
  let expected = 1;
  let current: ParsedQuestion | undefined;
  let broken = false;
  let labelTypo = false;
  let continuations = 0;
  let stemLines: string[] = [];
  const report = (code: string, message: string, severity: 'warn' | 'error' = 'warn'): void => {
    context.diagnostics.push({ code, severity, message: `${book.name}: ${message}` });
  };
  const finish = (): void => {
    if (!current) return;
    if (stemLines.length > 8) current.stem = stemLines;
    else {
      for (const line of stemLines)
        appendWrapped(current.stem, line, vocab, context, paragraphStart.test(line));
    }
    if (!broken && current.stem.length && !current.choices.length) {
      report(
        'SKIPPED_NO_TEXT_CHOICES',
        `${findSubjectById(current.subjectId)!.name} ${current.number}번: 선지가 그림 안에 있어 글자로 읽지 못했습니다. 그림 문제는 이 가져오기로는 넣을 수 없으니 문제 추가에서 직접 입력하세요.`,
      );
    } else if (
      broken ||
      current.choices.length < 2 ||
      current.choices.length > 5 ||
      current.choices.some((choice) => !choice.trim())
    ) {
      report(
        'WORKBOOK_CHOICES_BROKEN',
        `${current.number}번: 선지가 2~5개이고 번호 표기가 ①~⑤인지, 내용이 비어 있지 않고 이어지는 줄이 12줄 이하인지 확인하고 다시 가져오세요.`,
        'error',
      );
    } else {
      if (labelTypo)
        report(
          'WORKBOOK_CHOICE_LABEL_TYPO',
          `${findSubjectById(current.subjectId)!.name} ${current.number}번: 선지 번호 표기가 순서와 달라(예: ④가 두 번) 나온 순서대로 읽었습니다. 선지 내용을 확인하세요.`,
        );
      result.push(current);
      counts.set(current.subjectId, (counts.get(current.subjectId) ?? 0) + 1);
    }
    current = undefined;
  };
  const appendChoice = (text: string): void => {
    if (++continuations > 12) broken = true;
    else appendWrapped(current!.choices, text, vocab, context);
  };
  for (let index = 0; index < lines.length; index++) {
    const { text, noise, sourceLine } = lines[index];
    if (text === 'PART') {
      finish();
      subject = undefined;
      for (let next = index + 1; next <= index + 6 && next < lines.length; next++) {
        if (lines[next].text === 'PART') break;
        const found = findSubjectByName(lines[next].text);
        if (found) {
          subject = found;
          if (!counts.has(found.id)) counts.set(found.id, 0);
          break;
        }
      }
      expected = 1;
      if (!subject)
        report(
          'WORKBOOK_PART_UNKNOWN',
          `${sourceLine}줄 PART의 과목을 확인하세요. 이 구간은 제외합니다.`,
          'error',
        );
      continue;
    }
    const number = /^\d{3}$/u.test(text) ? Number(text) : undefined;
    const startsQuestion =
      subject &&
      number !== undefined &&
      (number === expected || (number > expected && number <= expected + 5 && hasFirstChoice(lines, index)));
    if (subject && startsQuestion) {
      finish();
      if (number > expected) {
        report('WORKBOOK_NUMBER_GAP', `${subject.name} ${expected}번~${number - 1}번이 문제집에 없습니다`);
      }
      expected = number + 1;
      current = { subjectId: subject.id, number, stem: [], choices: [], sourceLine };
      broken = false;
      labelTypo = false;
      continuations = 0;
      stemLines = [];
      continue;
    }
    if (noise || endOfQuestion.test(text)) {
      finish();
      continue;
    }
    if (!current || !text) continue;
    const markers = [...text.matchAll(choiceMarkers)];
    if (markers.length && (current.choices.length > 0 || markers[0].index === 0)) {
      const prefix = text.slice(0, markers[0].index).trim();
      if (prefix && current.choices.length) appendChoice(prefix);
      for (let marker = 0; marker < markers.length; marker++) {
        const match = markers[marker];
        if (!labels.includes(match[0])) broken = true;
        if (match[0] !== labels[current.choices.length]) labelTypo = true;
        current.choices.push(text.slice(match.index! + 1, markers[marker + 1]?.index).trim());
      }
      continuations = 0;
    } else if (current.choices.length) {
      appendChoice(text);
    } else stemLines.push(text);
  }
  finish();
  for (const [id, count] of counts) {
    context.diagnostics.push({
      code: 'WORKBOOK_QUESTION_COUNT',
      severity: 'warn',
      message: `${book.name}: ${findSubjectById(id)!.name}에서 ${count}문제를 읽었습니다. 원본의 과목별 문제 개수와 번호 연속성을 확인하세요.`,
    });
  }
  return result;
}
