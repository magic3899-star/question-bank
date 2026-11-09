import type { ImportDraft } from '../../contracts/index';
import { findSubjectById, subjectCatalog } from '../subject-catalog/index';
import { parseAnswerBook } from './answer-book';
import { isValidDraft, makeDraftQuestion } from './build-question';
import { parseQuestionBook } from './question-book';
import type { ParseContext, ParsedAnswer, ParsedQuestion, WorkbookBook, WorkbookOptions } from './types';
import { buildVocabulary } from './vocabulary';

interface Located<T> {
  entry: T;
  book: string;
}

const keyOf = (entry: { subjectId: string; number: number }): string => `${entry.subjectId}:${entry.number}`;

export function buildWorkbookDraft(
  input: { questionBooks: WorkbookBook[]; answerBooks: WorkbookBook[] },
  options: WorkbookOptions = {},
): ImportDraft {
  const draft: ImportDraft = { questions: [], diagnostics: [], assets: [], passageGroups: [] };
  const context: ParseContext = { diagnostics: draft.diagnostics, estimated: 0, discarded: 0 };
  const grades = options.includeGrades === undefined ? ['A'] : options.includeGrades;
  if (grades !== null && (!Array.isArray(grades) || grades.some((grade) => typeof grade !== 'string'))) {
    draft.diagnostics.push({
      code: 'GRADE_FILTER_INVALID',
      severity: 'error',
      message: '등급 필터는 문자열 배열 또는 null로 입력하세요. 모든 등급은 빈 배열로 가져올 수 있습니다.',
    });
    return draft;
  }
  const vocab = buildVocabulary([...input.questionBooks, ...input.answerBooks].flatMap((book) => book.lines));
  const questions = new Map<string, Located<ParsedQuestion>>();
  const answers = new Map<string, Located<ParsedAnswer>>();
  const collect = <T extends { subjectId: string; number: number }>(
    books: WorkbookBook[],
    parser: (book: WorkbookBook) => T[],
    target: Map<string, Located<T>>,
    code: string,
  ): void => {
    for (const book of books) {
      for (const entry of parser(book)) {
        const key = keyOf(entry);
        if (target.has(key))
          draft.diagnostics.push({
            code,
            severity: 'warn',
            message: `${book.name} ${findSubjectById(entry.subjectId)!.name} ${entry.number}번이 중복되어 앞의 항목을 사용합니다. 중복 문서를 확인하세요.`,
          });
        else target.set(key, { entry, book: book.name });
      }
    }
  };
  collect(
    input.questionBooks,
    (book) => parseQuestionBook(book, vocab, context),
    questions,
    'WORKBOOK_DUPLICATE_QUESTION',
  );
  collect(
    input.answerBooks,
    (book) => parseAnswerBook(book, vocab, context),
    answers,
    'WORKBOOK_DUPLICATE_ANSWER',
  );
  let noObjective = 0;
  const answerOnly: string[] = [];
  for (const subject of subjectCatalog) {
    const subjectQuestions = [...questions.values()]
      .filter(({ entry }) => entry.subjectId === subject.id)
      .sort((a, b) => a.entry.number - b.entry.number);
    const subjectAnswers = [...answers.values()].filter(({ entry }) => entry.subjectId === subject.id);
    if (!subjectQuestions.length && !subjectAnswers.length) continue;
    let imported = 0;
    let missingObjective = 0;
    const orphaned = subjectAnswers.filter(({ entry }) => !questions.has(keyOf(entry))).length;
    if (orphaned) answerOnly.push(`${subject.name} ${orphaned}건`);
    for (const { entry, book } of subjectQuestions) {
      const match = answers.get(keyOf(entry));
      const location = `${book} ${subject.name} ${entry.number}번`;
      const skip = (code: string, reason: string): void => {
        draft.diagnostics.push({
          code,
          severity: code === 'SKIPPED_NO_OBJECTIVE' || code === 'SKIPPED_BY_GRADE' ? 'info' : 'warn',
          message: `${location}: ${reason}`,
        });
      };
      if (!match?.entry.answerLabel) {
        skip('SKIPPED_NO_ANSWER', '대응하는 정답이 없어 제외했습니다. 같은 과목·번호의 정답을 확인하세요.');
        continue;
      }
      if ('①②③④⑤'.indexOf(match.entry.answerLabel) >= entry.choices.length) {
        skip(
          'SKIPPED_ANSWER_OUT_OF_RANGE',
          '정답이 선지 범위를 벗어나 제외했습니다. 선지 개수와 정답을 확인하세요.',
        );
        continue;
      }
      if (!match.entry.objectiveCode && options.requireObjective !== false) {
        missingObjective++;
        noObjective++;
        skip(
          'SKIPPED_NO_OBJECTIVE',
          '학습목표 코드가 없어 제외했습니다. 학습목표 줄을 추가하거나 requireObjective를 false로 바꾸세요.',
        );
        continue;
      }
      if (grades?.length && !grades.includes('A')) {
        skip('SKIPPED_BY_GRADE', '등급 A로 제외했습니다. 등급 필터를 바꾸면 가져올 수 있습니다.');
        continue;
      }
      const question = makeDraftQuestion(entry, match.entry, book, match.book, options);
      if (!isValidDraft(question)) {
        skip(
          'SKIPPED_INVALID',
          '본문·선지·정답의 무결성을 확인할 수 없어 제외했습니다. 내용을 고쳐 다시 가져오세요.',
        );
        continue;
      }
      if (entry.stem.length > 8 || /그림|표를|아래 표|다음 표|도표/u.test(entry.stem.join(' '))) {
        draft.diagnostics.push({
          code: 'WORKBOOK_FIGURE_MISSING',
          severity: 'warn',
          message: `${location}: 그림·표가 있는 문제로 보입니다. 이 가져오기는 그림을 읽지 못하므로, 저장한 뒤 문제 편집에서 그림을 넣어 주세요.`,
          ref: { draftIndex: draft.questions.length },
        });
      }
      draft.questions.push(question);
      imported++;
    }
    draft.diagnostics.push({
      code: 'WORKBOOK_SUBJECT_SUMMARY',
      severity: 'info',
      message: `${subject.name}: 문제집 ${subjectQuestions.length}문제 · 정답집 ${subjectAnswers.length}건 → 가져올 수 있음 ${imported}문제 (학습목표 없음 ${missingObjective})`,
    });
  }
  if (answerOnly.length)
    draft.diagnostics.push({
      code: 'WORKBOOK_ANSWER_ONLY',
      severity: 'info',
      message: `문제집에 없는 정답: ${answerOnly.join(' · ')}. 문제집 누락 여부를 확인하세요.`,
    });
  if (noObjective)
    draft.diagnostics.push({
      code: 'WORKBOOK_NO_OBJECTIVE_SUMMARY',
      severity: 'info',
      message: `학습목표가 없는 ${noObjective}문제를 제외했습니다. 학습목표 줄을 추가하거나 requireObjective를 false로 바꾸세요.`,
    });
  if (context.discarded)
    draft.diagnostics.push({
      code: 'WORKBOOK_NOISE_REMOVED',
      severity: 'info',
      message: `반복 머리글·꼬리말·쪽번호 등 잡음 ${context.discarded}줄을 버렸습니다. 원본의 줄 구성을 확인하세요.`,
    });
  if (context.estimated)
    draft.diagnostics.push({
      code: 'WORKBOOK_JOIN_ESTIMATED',
      severity: 'info',
      message: `줄 끝 낱말이 쪼개졌는지 처음 보는 조합 ${context.estimated}곳은 짐작으로 이었습니다. 문제 미리보기에서 띄어쓰기를 확인하세요.`,
    });
  return draft;
}
