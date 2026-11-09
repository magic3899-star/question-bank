import { describe, expect, it } from 'vitest';
import { numberedWorkbook } from '../../../tests/fixtures/workbook';
import { blocksToPlainText } from '../content-model/index';
import { buildWorkbookDraft } from './index';
import { parseQuestionBook } from './question-book';
import type { ParseContext } from './types';
import { buildVocabulary } from './vocabulary';

describe('선지 번호 오타 복구', () => {
  it.each([
    ['①', '③'],
    ['②', '①'],
    ['①', '②', '②'],
    ['④', '③', '②', '①'],
    ['①', '②', '③', '④', '④'],
    ['①', '②', '③', '③', '⑤'],
  ])('표기 %j는 나온 순서대로 읽고 문제당 경고 하나를 남긴다', (...labels) => {
    const choices = labels.map((_, index) => `가짜 선지 ${index + 1}`);
    const fixture = numberedWorkbook([
      { number: 1, lines: ['가짜 번호 오타?', labels.map((label, i) => `${label} ${choices[i]}`).join(' ')] },
    ]);
    const context: ParseContext = { diagnostics: [], estimated: 0, discarded: 0 };
    const parsed = parseQuestionBook(fixture.questionBooks[0], buildVocabulary([]), context);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].choices).toEqual(choices);
    expect(context.diagnostics.filter((d) => d.code === 'WORKBOOK_CHOICE_LABEL_TYPO')).toEqual([
      expect.objectContaining({
        severity: 'warn',
        message:
          '가짜 번호 문제집: 의료관계법규 1번: 선지 번호 표기가 순서와 달라(예: ④가 두 번) 나온 순서대로 읽었습니다. 선지 내용을 확인하세요.',
      }),
    ]);
    expect(context.diagnostics.some((d) => d.code === 'WORKBOOK_CHOICES_BROKEN')).toBe(false);
  });

  it.each([
    { labels: ['①', '②', '③', '④', '④'], answer: '⑤', answerId: 'c5' },
    { labels: ['①', '②', '③', '③', '⑤'], answer: '⑤', answerId: 'c5' },
    { labels: ['①', '②', '③', '③', '⑤'], answer: '③', answerId: 'c3' },
  ])(
    '$labels에서 정답 $answer는 위치로 연결하고 다음 문제에 경고를 잇지 않는다',
    ({ labels, answer, answerId }) => {
      const choices = labels.map((_, index) => `가짜 선지 ${index + 1}`);
      const fixture = numberedWorkbook([
        { number: 1, lines: ['가짜 선지 오타?', ...labels.map((label, i) => `${label} ${choices[i]}`)] },
        { number: 2, lines: ['가짜 다음 문제?', '① 다음 하나 ② 다음 둘'] },
      ]);
      fixture.answerBooks[0].lines = fixture.answerBooks[0].lines.map((line, index) =>
        index === 0 ? `001 〉〉〉 정답 ${answer}` : line,
      );
      const draft = buildWorkbookDraft(fixture);
      expect(draft.questions).toHaveLength(2);
      expect(draft.questions[0].question.choices.map((choice) => blocksToPlainText(choice.content))).toEqual(
        choices,
      );
      expect(draft.questions[0].question.answerChoiceIds).toEqual([answerId]);
      expect(draft.questions[1].question.answerChoiceIds).toEqual(['c2']);
      expect(draft.diagnostics.filter((d) => d.code === 'WORKBOOK_CHOICE_LABEL_TYPO')).toHaveLength(1);
      expect(draft.diagnostics.some((d) => d.code === 'WORKBOOK_CHOICES_BROKEN')).toBe(false);
    },
  );

  it('선지 번호를 복구해도 정답 위치가 선지 개수를 넘으면 제외한다', () => {
    const fixture = numberedWorkbook([{ number: 1, lines: ['가짜 네 선지?', '① 하나 ② 둘 ⑤ 셋 ⑤ 넷'] }]);
    fixture.answerBooks[0].lines = ['001 〉〉〉 정답 ⑤', ...fixture.answerBooks[0].lines.slice(1)];
    const draft = buildWorkbookDraft(fixture);
    expect(draft.questions).toHaveLength(0);
    expect(draft.diagnostics.filter((d) => d.code === 'SKIPPED_ANSWER_OUT_OF_RANGE')).toEqual([
      expect.objectContaining({ severity: 'warn', message: expect.stringContaining('1번') }),
    ]);
    expect(draft.diagnostics.some((d) => d.code === 'WORKBOOK_CHOICES_BROKEN')).toBe(false);
  });

  it.each([
    '① 하나 ② 둘 ③ 셋 ④ 넷 ⑤ 다섯 ⑤ 여섯',
    '① 하나 ② 둘 ③ 셋 ④ 넷 ⑤ 다섯 ① 여섯 ② 일곱',
    '① 하나 ② 둘 ③ 셋 ④ 넷 ⑥ 다섯',
    '⑥ 하나 ② 둘',
    '① 하나 ⓪ 둘',
    '① 하나 ⑳ 둘',
    '① 하나 ㉑ 둘',
    '① 하나 ㊿ 둘',
    '① 하나 ①',
  ])('잘못된 선지 %s는 오류로 제외하고 다음 문제는 보존한다', (text) => {
    const fixture = numberedWorkbook([
      { number: 1, lines: ['가짜 잘못된 선지?', text] },
      { number: 2, lines: ['가짜 정상 선지?', '① 하나 ② 둘'] },
    ]);
    const draft = buildWorkbookDraft(fixture);
    expect(draft.questions.map(({ question }) => question.extra.workbook)).toEqual([
      expect.objectContaining({ number: 2 }),
    ]);
    expect(draft.diagnostics.filter((d) => d.code === 'WORKBOOK_CHOICES_BROKEN')).toEqual([
      expect.objectContaining({ severity: 'error', message: expect.stringContaining('1번') }),
    ]);
    expect(draft.diagnostics.some((d) => d.code === 'WORKBOOK_CHOICE_LABEL_TYPO')).toBe(false);
  });

  it.each([2, 3, 4, 5])('정상 순서의 선지 %i개에는 번호 오타 경고를 남기지 않는다', (count) => {
    const fixture = numberedWorkbook([
      {
        number: 1,
        lines: [
          '가짜 정상 순서?',
          ...Array.from('①②③④⑤')
            .slice(0, count)
            .map((label) => `${label} 가짜`),
        ],
      },
    ]);
    const draft = buildWorkbookDraft(fixture);
    expect(draft.questions).toHaveLength(1);
    expect(draft.questions[0].question.choices).toHaveLength(count);
    expect(draft.diagnostics.some((d) => d.code === 'WORKBOOK_CHOICE_LABEL_TYPO')).toBe(false);
  });
});
