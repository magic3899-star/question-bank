import { describe, expect, it } from 'vitest';
import { numberedWorkbook } from '../../../tests/fixtures/workbook';
import { blocksToPlainText } from '../content-model/index';
import { parseAnswerBook } from './answer-book';
import { buildWorkbookDraft } from './index';
import { parseQuestionBook } from './question-book';
import type { ParseContext } from './types';
import { buildVocabulary } from './vocabulary';

const body = (number: number): string[] => [`가짜 ${number}번 본문?`, '① 가짜 하나 ② 가짜 둘'];
const context = (): ParseContext => ({ diagnostics: [], estimated: 0, discarded: 0 });
const numbers = (draft: ReturnType<typeof buildWorkbookDraft>): unknown[] =>
  draft.questions.map(({ question }) => question.extra.workbook);

describe('문제집 번호와 본문 복구', () => {
  it('중간 그림 문제만 제외하고 뒤의 모든 문제를 원래 번호·정답과 연결한다', () => {
    const fixture = numberedWorkbook(
      Array.from({ length: 40 }, (_, index) => ({
        number: index + 1,
        lines: index === 33 ? ['가짜 구조를 나타낸 그림이다.'] : body(index + 1),
      })),
    );
    const draft = buildWorkbookDraft(fixture);
    const expected = Array.from({ length: 40 }, (_, index) => index + 1).filter((number) => number !== 34);
    expect(draft.questions).toHaveLength(39);
    expect(numbers(draft)).toEqual(expected.map((number) => expect.objectContaining({ number })));
    for (const [index, { question }] of draft.questions.entries()) {
      expect(blocksToPlainText(question.stem)).toBe(`가짜 ${expected[index]}번 본문?`);
      expect(question.objectiveCode).toBe(`법규 1-1-${expected[index]}`);
      expect(question.answerChoiceIds).toEqual(['c2']);
    }
    expect(draft.diagnostics.filter((d) => d.code === 'SKIPPED_NO_TEXT_CHOICES')).toEqual([
      expect.objectContaining({
        severity: 'warn',
        message: expect.stringContaining('의료관계법규 34번: 선지가 그림 안에 있어'),
      }),
    ]);
    expect(draft.diagnostics.some((d) => d.code === 'WORKBOOK_NUMBER_GAP')).toBe(false);
  });

  it.each([8, 9, 21])('본문 %i줄은 8줄 초과일 때만 줄마다 문단과 그림 경고를 남긴다', (count) => {
    const stem = Array.from({ length: count }, (_, index) => `가짜 칸 ${index + 1}`);
    const draft = buildWorkbookDraft(numberedWorkbook([{ number: 1, lines: [...stem, '① 하나 ② 둘'] }]));
    expect(draft.questions).toHaveLength(1);
    const question = draft.questions[0].question;
    expect(question.stem).toHaveLength(count > 8 ? count : 1);
    expect(blocksToPlainText(question.stem)).toBe(stem.join(count > 8 ? '\n' : ' '));
    expect(draft.diagnostics.filter((d) => d.code === 'WORKBOOK_FIGURE_MISSING')).toHaveLength(
      count > 8 ? 1 : 0,
    );
    if (count > 8)
      expect(draft.diagnostics.find((d) => d.code === 'WORKBOOK_FIGURE_MISSING')?.ref).toEqual({
        draftIndex: 0,
      });
  });

  it.each([6, 12, 13])('중간 선지의 이어지는 %i줄 상한을 검사하고 다음 문제는 살린다', (count) => {
    const continuation = Array.from({ length: count }, (_, index) => `가짜 이어짐${index + 1}`);
    const fixture = numberedWorkbook([
      { number: 1, lines: ['가짜 긴 선지?', '① 가짜 조문', ...continuation, '② 가짜 둘'] },
      { number: 2, lines: body(2) },
    ]);
    const draft = buildWorkbookDraft(fixture);
    expect(numbers(draft)).toEqual(
      (count > 12 ? [2] : [1, 2]).map((number) => expect.objectContaining({ number })),
    );
    expect(draft.diagnostics.filter((d) => d.code === 'WORKBOOK_CHOICES_BROKEN')).toHaveLength(
      count > 12 ? 1 : 0,
    );
    if (count <= 12)
      expect(blocksToPlainText(draft.questions[0].question.choices[0].content)).toBe(
        ['가짜 조문', ...continuation].join(' '),
      );
  });

  it.each([1, 5])('번호 %i개 누락은 구간당 경고 하나로 복구한다', (missing) => {
    const next = missing + 2;
    const draft = buildWorkbookDraft(
      numberedWorkbook([
        { number: 1, lines: body(1) },
        { number: next, lines: body(next) },
        { number: next + 1, lines: body(next + 1) },
      ]),
    );
    expect(numbers(draft)).toEqual([1, next, next + 1].map((number) => expect.objectContaining({ number })));
    expect(draft.diagnostics.filter((d) => d.code === 'WORKBOOK_NUMBER_GAP')).toEqual([
      expect.objectContaining({
        severity: 'warn',
        message: expect.stringContaining(`의료관계법규 2번~${next - 1}번이 문제집에 없습니다`),
      }),
    ]);
  });

  it.each([40, 41])('누락 뒤 첫 선지가 번호에서 %i줄 뒤인지 확인한다', (distance) => {
    const fixture = numberedWorkbook([
      { number: 1, lines: [...body(1), 'KILLER POINT 가짜 요약'] },
      {
        number: 3,
        lines: [...Array<string>(distance - 1).fill('가짜 칸'), '① 하나 ② 둘'],
      },
    ]);
    const draft = buildWorkbookDraft(fixture);
    expect(draft.questions).toHaveLength(distance === 40 ? 2 : 1);
    expect(draft.diagnostics.filter((d) => d.code === 'WORKBOOK_NUMBER_GAP')).toHaveLength(
      distance === 40 ? 1 : 0,
    );
  });

  it('기대 번호와 맞지 않는 숫자 본문과 요약은 문제 경계가 아니다', () => {
    const ctx = context();
    const fixture = numberedWorkbook([
      {
        number: 1,
        lines: [
          '가짜 수치',
          '001',
          '000',
          '100',
          '008',
          '2025',
          '가짜 본문?',
          '① 하나 ② 둘',
          'KILLER POINT 가짜 요약',
          '2025',
          '100',
          '가짜 요약 본문',
          '제 2 장 가짜',
        ],
      },
      { number: 2, lines: body(2) },
      { number: 3, lines: body(3) },
    ]);
    const parsed = parseQuestionBook(fixture.questionBooks[0], buildVocabulary([]), ctx);
    expect(parsed.map((entry) => entry.number)).toEqual([1, 2, 3]);
    expect(parsed[0].stem).toEqual(['가짜 수치 001 000 100 008 2025 가짜 본문?']);
    expect(parsed[0].choices).toEqual(['하나', '둘']);
    expect(parsed[1].stem).toEqual(['가짜 2번 본문?']);
    expect(ctx.diagnostics.some((d) => d.code === 'WORKBOOK_NUMBER_GAP')).toBe(false);
  });

  it('요약 직후 기대 번호의 표 50줄을 인식하고 앞뒤 문제와 요약을 분리한다', () => {
    const stem = Array.from({ length: 50 }, (_, index) => `가짜 표 칸 ${index + 1}`);
    const draft = buildWorkbookDraft(
      numberedWorkbook([
        { number: 1, lines: [...body(1), 'KILLER POINT 가짜 앞 요약', '앞 요약 내용'] },
        {
          number: 2,
          lines: [...stem, '① 표 하나 ② 표 둘', 'KILLER POINT 가짜 뒤 요약', '뒤 요약 내용'],
        },
        { number: 3, lines: body(3) },
      ]),
    );
    expect(numbers(draft)).toEqual([1, 2, 3].map((number) => expect.objectContaining({ number })));
    expect(draft.questions.map(({ question }) => blocksToPlainText(question.stem))).toEqual([
      '가짜 1번 본문?',
      stem.join('\n'),
      '가짜 3번 본문?',
    ]);
    expect(draft.questions[1].question.stem).toHaveLength(50);
    expect(
      draft.questions.map(({ question }) => question.choices.map((c) => blocksToPlainText(c.content))),
    ).toEqual([
      ['가짜 하나', '가짜 둘'],
      ['표 하나', '표 둘'],
      ['가짜 하나', '가짜 둘'],
    ]);
    expect(draft.diagnostics.filter((d) => d.code === 'WORKBOOK_FIGURE_MISSING')).toEqual([
      expect.objectContaining({ severity: 'warn', ref: { draftIndex: 1 } }),
    ]);
    expect(draft.diagnostics.some((d) => d.code === 'WORKBOOK_NUMBER_GAP')).toBe(false);
  });

  it('요약 직후 기대 번호에 글자 선지가 없으면 해당 문제만 제외한다', () => {
    const draft = buildWorkbookDraft(
      numberedWorkbook([
        { number: 1, lines: [...body(1), 'KILLER POINT 가짜 요약', '가짜 요약 내용'] },
        { number: 2, lines: Array<string>(50).fill('가짜 그림 설명') },
        { number: 3, lines: body(3) },
      ]),
    );
    expect(numbers(draft)).toEqual([1, 3].map((number) => expect.objectContaining({ number })));
    expect(draft.diagnostics.filter((d) => d.code === 'SKIPPED_NO_TEXT_CHOICES')).toEqual([
      expect.objectContaining({ severity: 'warn', message: expect.stringContaining('의료관계법규 2번:') }),
    ]);
    expect(draft.diagnostics.some((d) => d.code === 'WORKBOOK_NUMBER_GAP')).toBe(false);
  });

  it('서로 떨어진 누락 구간은 각각 경고하고 실제 번호를 유지한다', () => {
    const draft = buildWorkbookDraft(
      numberedWorkbook([1, 3, 6].map((number) => ({ number, lines: body(number) }))),
    );
    expect(numbers(draft)).toEqual([1, 3, 6].map((number) => expect.objectContaining({ number })));
    expect(draft.diagnostics.filter((d) => d.code === 'WORKBOOK_NUMBER_GAP')).toHaveLength(2);
  });
});

describe('정답집 개별 접두 오타', () => {
  it('항목과 과목을 보존하고 학습목표만 비워 기본 옵션에서 제외 이유를 남긴다', () => {
    const fixture = numberedWorkbook([
      { number: 1, lines: body(1) },
      { number: 2, lines: body(2), objectivePrefix: '병리' },
      { number: 3, lines: body(3) },
    ]);
    const ctx = context();
    const parsed = parseAnswerBook(fixture.answerBooks[0], buildVocabulary([]), ctx);
    expect(parsed).toHaveLength(3);
    expect(parsed[1]).toMatchObject({ subjectId: 'law', number: 2, answerLabel: '②' });
    expect(parsed[1].objectiveCode).toBeUndefined();
    expect(ctx.diagnostics.filter((d) => d.code === 'WORKBOOK_PART_MISMATCH')).toEqual([
      expect.objectContaining({
        severity: 'warn',
        message: expect.stringContaining('의료관계법규 2번: 학습목표(◆ 병리)가 과목과 달라 비웠습니다'),
      }),
    ]);
    const draft = buildWorkbookDraft(fixture);
    expect(numbers(draft)).toEqual([1, 3].map((number) => expect.objectContaining({ number })));
    expect(draft.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'SKIPPED_NO_OBJECTIVE', message: expect.stringContaining('2번') }),
    );
    expect(draft.diagnostics.some((d) => d.code === 'SKIPPED_NO_ANSWER')).toBe(false);
    const optional = buildWorkbookDraft(fixture, { requireObjective: false });
    expect(numbers(optional)).toEqual([1, 2, 3].map((number) => expect.objectContaining({ number })));
    expect(optional.questions[1].question).not.toHaveProperty('objectiveCode');
    expect(optional.questions[1].question.answerChoiceIds).toEqual(['c2']);
    expect(blocksToPlainText(optional.questions[1].question.explanation)).toBe('가짜 2번 해설');
  });
});
