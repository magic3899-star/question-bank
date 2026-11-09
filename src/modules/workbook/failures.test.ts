import { describe, expect, it } from 'vitest';
import { tinyWorkbook } from '../../../tests/fixtures/workbook';
import { blocksToPlainText } from '../content-model/index';
import { buildWorkbookDraft } from './index';

describe('짝이 불확실한 문제의 제외와 진단', () => {
  it('정답 없음·정답집만 있음은 번호를 포함하고 제외 진단에 ref를 붙이지 않는다', () => {
    const fixture = tinyWorkbook([], ['002 〉〉> 정답 ①', '별도 가짜 해설', '◆ 법규 1-1-2']);
    fixture.answerBooks[0].lines = fixture.answerBooks[0].lines.slice(4);
    const draft = buildWorkbookDraft(fixture);
    expect(draft.questions).toHaveLength(0);
    expect(draft.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'SKIPPED_NO_ANSWER',
        severity: 'warn',
        message: expect.stringContaining('1번'),
      }),
    );
    expect(draft.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'WORKBOOK_ANSWER_ONLY',
        message: expect.stringContaining('의료관계법규 1건'),
      }),
    );
    expect(draft.diagnostics.every((d) => !d.ref)).toBe(true);
  });

  it.each(['001 〉〉〉 정답 ⑤', '001 〉〉>정답⑤'])('선지 범위를 넘은 %s는 제외한다', (line) => {
    const fixture = tinyWorkbook();
    fixture.answerBooks[0].lines = [line, '◆ 법규 1-1-1'];
    const draft = buildWorkbookDraft(fixture);
    expect(draft.questions).toHaveLength(0);
    expect(draft.diagnostics.some((d) => d.code === 'SKIPPED_ANSWER_OUT_OF_RANGE')).toBe(true);
  });

  it.each([
    '001 〉〉〉 정답 ① ②',
    '001 〉〉〉 정답 1',
    '001 〉 정답 ①',
    '001 정답',
    '001 〉〉〉 정답 ①②',
    '001 〉〉〉 정답 ③ 또는 ④',
  ])('잘못된 정답 형식 %s는 정답 없음으로 남긴다', (line) => {
    const fixture = tinyWorkbook();
    fixture.answerBooks[0].lines = [line, '가짜 해설', '◆ 법규 1-1-1'];
    const draft = buildWorkbookDraft(fixture);
    expect(draft.questions).toHaveLength(0);
    expect(draft.diagnostics.some((d) => d.code === 'WORKBOOK_ANSWER_FORMAT' && d.severity === 'error')).toBe(
      true,
    );
    expect(draft.diagnostics.some((d) => d.code === 'SKIPPED_NO_ANSWER')).toBe(true);
  });

  it('앞 항목이 잘못되어도 중복 정답으로 덮어쓰지 않는다', () => {
    const fixture = tinyWorkbook([], ['001 〉〉> 정답 ①', '뒤 가짜 해설', '◆ 법규 1-1-1']);
    fixture.answerBooks[0].lines = fixture.answerBooks[0].lines.map((line, index) =>
      index === 0 ? '001 〉〉〉 정답 없음' : line,
    );
    const draft = buildWorkbookDraft(fixture);
    expect(draft.questions).toHaveLength(0);
    expect(draft.diagnostics.some((d) => d.code === 'WORKBOOK_DUPLICATE_ANSWER')).toBe(true);
  });

  it('같은 책·여러 책의 중복 문제와 정답은 앞의 내용을 보존한다', () => {
    const fixture = tinyWorkbook(
      ['PART', '의료관계법규', '001', '다른 가짜 본문?', '① 뒤하나 ② 뒤둘'],
      ['001 〉〉> 정답 ①', '뒤 가짜 해설', '◆ 법규 1-1-9'],
    );
    fixture.questionBooks.push({
      name: '뒤 문제집',
      lines: ['PART', '의료관계법규', '001', '다른 본문?', '① 뒤하나 ② 뒤둘'],
    });
    fixture.answerBooks.push({ name: '뒤 정답집', lines: ['001 〉〉〉 정답 ②', '뒤 해설', '◆ 법규 1-1-8'] });
    const draft = buildWorkbookDraft(fixture);
    expect(draft.questions).toHaveLength(1);
    expect(draft.questions[0].question.answerChoiceIds).toEqual(['c3']);
    expect(draft.questions[0].question.objectiveCode).toBe('법규 1-1-1');
    expect(blocksToPlainText(draft.questions[0].question.stem)).toBe('가짜 사과나무?');
    expect(draft.diagnostics.filter((d) => d.code === 'WORKBOOK_DUPLICATE_QUESTION')).toHaveLength(2);
    expect(draft.diagnostics.filter((d) => d.code === 'WORKBOOK_DUPLICATE_ANSWER')).toHaveLength(2);
  });

  it('번호가 빠지면 다음 문제의 내용을 앞 문제에 잇거나 번호를 당겨 맞추지 않는다', () => {
    const fixture = tinyWorkbook(
      ['003', '뒤 가짜 문제?', '① 뒤하나 ② 뒤둘'],
      ['003 〉〉〉 정답 ②', '뒤 가짜 해설', '◆ 법규 1-1-3'],
    );
    const draft = buildWorkbookDraft(fixture);
    expect(draft.questions.map(({ question }) => question.extra.workbook)).toEqual([
      expect.objectContaining({ number: 1 }),
      expect.objectContaining({ number: 3 }),
    ]);
    expect(blocksToPlainText(draft.questions[0].question.stem)).toBe('가짜 사과나무?');
    expect(blocksToPlainText(draft.questions[1].question.stem)).toBe('뒤 가짜 문제?');
    expect(draft.diagnostics.filter((d) => d.code === 'WORKBOOK_NUMBER_GAP')).toEqual([
      expect.objectContaining({ severity: 'warn', message: expect.stringContaining('2번~2번') }),
    ]);
  });

  it('과목을 찾을 수 없는 PART는 이전 과목을 이어 쓰지 않는다', () => {
    const fixture = tinyWorkbook(['PART', '알수없는과목', '001', '다른 문제?', '① 뒤하나 ② 뒤둘']);
    const draft = buildWorkbookDraft(fixture);
    expect(draft.questions).toHaveLength(1);
    expect(draft.diagnostics.some((d) => d.code === 'WORKBOOK_PART_UNKNOWN')).toBe(true);
    expect(JSON.stringify(draft.questions)).not.toContain('뒤하나');
  });

  it('과목 이름은 PART 뒤 6줄 안에 정확히 일치해야 한다', () => {
    const fixture = tinyWorkbook();
    fixture.questionBooks[0].lines = [
      'PART',
      ...Array<string>(6).fill('가짜 장식'),
      '의료관계법규',
      '001',
      '가짜?',
      '① 하나 ② 둘',
    ];
    expect(buildWorkbookDraft(fixture).questions).toHaveLength(0);
  });

  it('과목 접두 동수·알 수 없는 접두는 제외하고 소수 항목의 다른 접두는 학습목표를 비운다', () => {
    for (const codes of [['법규', '해부'], ['법규', '법규', '해부'], ['가짜접두']]) {
      const fixture = tinyWorkbook([
        '002',
        '둘째 가짜?',
        '① 둘하나 ② 둘둘',
        '003',
        '셋째 가짜?',
        '① 셋하나 ② 셋둘',
      ]);
      fixture.answerBooks[0].lines = codes.flatMap((prefix, index) => [
        `00${index + 1} 〉〉〉 정답 ②`,
        `가짜해설${index + 1}`,
        `◆ ${prefix} 1-1-${index + 1}`,
      ]);
      const draft = buildWorkbookDraft(fixture);
      expect(draft.questions).toHaveLength(codes.length === 3 ? 2 : 0);
      expect(draft.diagnostics.some((d) => d.code === 'WORKBOOK_PART_MISMATCH')).toBe(true);
    }
  });

  it('접두가 없는 구간은 번호 리셋에 따른 카탈로그 순서만 사용한다', () => {
    const fixture = tinyWorkbook(['PART', '구강해부학', '001', '해부 가짜?', '① 해부하나 ② 해부둘']);
    fixture.answerBooks[0].lines = ['001 〉〉〉 정답 ①', '법규 가짜', '001 〉〉> 정답 ②', '해부 가짜'];
    const draft = buildWorkbookDraft(fixture, { requireObjective: false });
    expect(draft.questions.map(({ question }) => [question.subject, question.answerChoiceIds])).toEqual([
      ['law', ['c1']],
      ['anatomy', ['c2']],
    ]);
  });

  it('학습목표 없음은 기본 제외하고 한 번만 개수 요약을 낸다', () => {
    const fixture = tinyWorkbook();
    fixture.answerBooks[0].lines = ['001 〉〉〉 정답 ③', '가짜 제목'];
    const draft = buildWorkbookDraft(fixture);
    expect(draft.questions).toHaveLength(0);
    expect(draft.diagnostics.filter((d) => d.code === 'SKIPPED_NO_OBJECTIVE')).toEqual([
      expect.objectContaining({ severity: 'info', message: expect.stringContaining('1번') }),
    ]);
    expect(draft.diagnostics.filter((d) => d.code === 'WORKBOOK_NO_OBJECTIVE_SUMMARY')).toHaveLength(1);
    expect(buildWorkbookDraft(fixture, { requireObjective: false }).questions[0].question).not.toHaveProperty(
      'objectiveCode',
    );
  });

  it('빈 본문은 자체 검증으로 제외한다', () => {
    const fixture = tinyWorkbook();
    fixture.questionBooks[0].lines = ['PART', '의료관계법규', '001', '① 하나 ② 둘'];
    fixture.answerBooks[0].lines = ['001 〉〉〉 정답 ①', '◆ 법규 1-1-1'];
    const draft = buildWorkbookDraft(fixture);
    expect(draft.questions).toHaveLength(0);
    expect(draft.diagnostics.some((d) => d.code === 'SKIPPED_INVALID')).toBe(true);
  });
});
