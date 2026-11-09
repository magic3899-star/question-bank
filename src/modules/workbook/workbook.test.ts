import { describe, expect, it } from 'vitest';
import { blocksToPlainText } from '../content-model/index';
import { makeWorkbookFixture, tinyWorkbook } from '../../../tests/fixtures/workbook';
import { buildWorkbookDraft, detectBook } from './index';

describe('문제집·정답집 병합', () => {
  it.each([1, 7, 42, 123456, 998877])(
    '시드 %i의 모든 문제에서 내용·정답·해설·학습목표가 같은 문제에 속한다',
    (seed) => {
      const fixture = makeWorkbookFixture({ seed, omitObjectives: true });
      const draft = buildWorkbookDraft(fixture);
      const expected = fixture.expected.filter((entry) => entry.objectiveCode);
      expect(draft.questions).toHaveLength(expected.length);
      for (const [index, { question, sourceLocation }] of draft.questions.entries()) {
        const original = expected[index];
        expect(question.subject).toBe(original.subject);
        expect(blocksToPlainText(question.stem)).toContain(original.marker);
        expect(question.choices.map((choice) => blocksToPlainText(choice.content))).toEqual(original.choices);
        expect(question.answerChoiceIds).toEqual([original.answerId]);
        expect(question.objectiveCode).toBe(original.objectiveCode);
        expect(blocksToPlainText(question.explanation)).toBe(
          `가짜해설 ${original.marker}\n• ${original.marker}_설명 바나나 사과나무\n① → ${original.marker}_선지참조`,
        );
        expect(question.explanation[0]).toEqual({
          type: 'paragraph',
          runs: [{ text: `가짜해설 ${original.marker}`, bold: true }],
        });
        expect(question.shufflePolicy).toBe('lock-all');
        expect(question.grade).toBe('A');
        expect(sourceLocation).toContain(`${original.number}번`);
        expect(question.extra.workbook).toEqual({
          questionBook: `가짜문제_${original.subject}`,
          answerBook: `가짜정답_${original.subject}`,
          number: original.number,
        });
        expect(JSON.stringify(question)).not.toMatch(/KILLER|PART|◆|기출 내용|가짜 장/);
      }
      expect(draft.assets).toEqual([]);
      expect(draft.passageGroups).toEqual([]);
      expect(draft.diagnostics.filter((d) => d.code === 'WORKBOOK_JOIN_ESTIMATED')).toHaveLength(1);
      expect(draft.diagnostics.filter((d) => d.code === 'WORKBOOK_SUBJECT_SUMMARY')).toHaveLength(3);
      for (const diagnostic of draft.diagnostics.filter((d) => d.code === 'WORKBOOK_FIGURE_MISSING')) {
        expect(blocksToPlainText(draft.questions[diagnostic.ref!.draftIndex!].question.stem)).toContain(
          '그림',
        );
      }
    },
  );

  it('학습목표 필수 옵션과 선지 참조 고정 옵션을 해제할 수 있다', () => {
    const fixture = makeWorkbookFixture({ count: 5, omitObjectives: true });
    const draft = buildWorkbookDraft(fixture, { requireObjective: false, lockChoicesOnReference: false });
    expect(draft.questions).toHaveLength(15);
    expect(draft.questions[4].question).not.toHaveProperty('objectiveCode');
    expect(draft.questions.every(({ question }) => question.shufflePolicy === 'free')).toBe(true);
  });

  it('같은 입력·옵션이면 JSON이 같고 원본 입력을 변경하지 않는다', () => {
    const fixture = makeWorkbookFixture();
    const before = JSON.stringify(fixture);
    expect(JSON.stringify(buildWorkbookDraft(fixture))).toBe(JSON.stringify(buildWorkbookDraft(fixture)));
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it('두 권의 문제집과 한 권의 정답집에서도 번호 리셋을 과목별로 처리한다', () => {
    const fixture = makeWorkbookFixture({ count: 12, omitObjectives: true, seed: 234 });
    const combined = {
      questionBooks: [
        { name: '문제 2권', lines: fixture.questionBooks[2].lines },
        { name: '문제 1권', lines: fixture.questionBooks.slice(0, 2).flatMap((book) => book.lines) },
      ],
      answerBooks: [{ name: '통합 정답', lines: fixture.answerBooks.flatMap((book) => book.lines) }],
    };
    const draft = buildWorkbookDraft(combined, { requireObjective: false });
    expect(draft.questions).toHaveLength(fixture.expected.length);
    for (const [index, { question }] of draft.questions.entries()) {
      const expected = fixture.expected[index];
      expect(question.subject).toBe(expected.subject);
      expect(question.choices.map((choice) => blocksToPlainText(choice.content))).toEqual(expected.choices);
      expect(question.answerChoiceIds).toEqual([expected.answerId]);
      expect(question.objectiveCode).toBe(expected.objectiveCode);
      expect(blocksToPlainText(question.explanation)).toContain(expected.marker);
    }
  });

  it('판별은 20개 경계와 정답집 우선 순서를 지킨다', () => {
    const small = makeWorkbookFixture({ count: 19, subjects: 1 });
    const large = makeWorkbookFixture({ count: 20, subjects: 1 });
    expect(detectBook(small.questionBooks[0].lines)).toBe('unknown');
    expect(detectBook(small.answerBooks[0].lines)).toBe('unknown');
    expect(detectBook(large.questionBooks[0].lines)).toBe('questions');
    expect(detectBook(large.answerBooks[0].lines)).toBe('answers');
    expect(detectBook([...large.questionBooks[0].lines, ...large.answerBooks[0].lines])).toBe('answers');
    expect(detectBook([])).toBe('unknown');
  });

  it('가짜 2,000문제를 2초 안에 병합한다', () => {
    const fixture = makeWorkbookFixture({ count: 100, subjects: 20 });
    const start = performance.now();
    const draft = buildWorkbookDraft(fixture);
    const elapsed = performance.now() - start;
    expect(draft.questions).toHaveLength(2000);
    expect(elapsed).toBeLessThan(2000);
  });

  it('빈 입력은 빈 초안이고 등급 필터는 docx와 같은 방식으로 처리한다', () => {
    expect(buildWorkbookDraft({ questionBooks: [], answerBooks: [] })).toEqual({
      questions: [],
      diagnostics: [],
      assets: [],
      passageGroups: [],
    });
    for (const includeGrades of [null, [], ['A']])
      expect(buildWorkbookDraft(tinyWorkbook(), { includeGrades }).questions).toHaveLength(1);
    expect(
      buildWorkbookDraft(tinyWorkbook(), { includeGrades: ['B'] }).diagnostics.some(
        (d) => d.code === 'SKIPPED_BY_GRADE',
      ),
    ).toBe(true);
    expect(
      buildWorkbookDraft(tinyWorkbook(), { includeGrades: 3 as unknown as string[] }).diagnostics[0].code,
    ).toBe('GRADE_FILTER_INVALID');
  });
});
