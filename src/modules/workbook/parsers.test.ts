import { describe, expect, it } from 'vitest';
import { parseAnswerBook } from './answer-book';
import { parseQuestionBook } from './question-book';
import { isNoise } from './noise';
import type { ParseContext } from './types';
import { buildVocabulary } from './vocabulary';

const context = (): ParseContext => ({ diagnostics: [], estimated: 0, discarded: 0 });
const book = (lines: string[]) => ({ name: '가짜 책', lines });
const question = (tail: string[]) => book(['PART', '03', '치아형태학', '001', '가짜 사과나무?', ...tail]);

describe('줄 잡음과 문제집 경계', () => {
  it.each([
    '2027 가짜 시리즈 치과위생사 국가시험 - 1교시54',
    '치과위생사 국가시험 - 1교시2',
    '치과위생사 국가시험 1교시',
    '2027 가짜 SERIES',
    'PART 02 구강해부학 55',
    'H · Y · G · I · E · N · I · S · TPART01 의료관계법규',
    'D · E · N · T · A · L H · Y · G · I · E · N · I · S · T',
    'DENTAL HYGIENIST',
    'D E N TA L H Y G I E N I S T …',
    '02',
    '11',
    'Memo',
  ])('잡음 %s만 제거한다', (text) => expect(isNoise(text)).toBe(true));

  it.each([
    '가짜 Memo 내용',
    'DENTAL HYGIENIST 사과나무',
    '가짜 국가시험 1교시 문제',
    '001',
    '123',
    'PART',
    '제 1 장 사과나무',
    '사과나무 02',
    'PART 02 구강해부학 55 가짜 본문',
  ])('본문 %s은 잡음으로 분류하지 않는다', (text) => expect(isNoise(text)).toBe(false));

  it.each(['KILLER POINT 가짜', '출제 연도 기출 내용', '제 2 장 가짜', 'Memo', 'PART'])(
    '%s에서 마지막 선지와 다음 구간을 분리한다',
    (boundary) => {
      const parsed = parseQuestionBook(
        question(['① 하나 ② 둘', boundary, '엉뚱한 요약']),
        buildVocabulary([]),
        context(),
      );
      expect(parsed).toHaveLength(1);
      expect(parsed[0].choices).toEqual(['하나', '둘']);
    },
  );

  it.each(['① 하나', '① ② 둘'])('불완전한 선지 %s는 오류로 제외한다', (choices) => {
    const ctx = context();
    const parsed = parseQuestionBook(question([choices]), buildVocabulary([]), ctx);
    expect(parsed).toHaveLength(0);
    expect(ctx.diagnostics.some((d) => d.code === 'WORKBOOK_CHOICES_BROKEN')).toBe(true);
  });

  it('첫 ① 뒤의 순서 역전은 경고하고 뒤 문제는 독립적으로 해석한다', () => {
    const ctx = context();
    const parsed = parseQuestionBook(
      question(['① 하나', '③ 셋', '② 둘', '002', '둘째 가짜?', '① 두하나 ② 두둘']),
      buildVocabulary([]),
      ctx,
    );
    expect(parsed.map((entry) => entry.number)).toEqual([1, 2]);
    expect(parsed[0].choices).toEqual(['하나', '셋', '둘']);
    expect(parsed[1].choices).toEqual(['두하나', '두둘']);
    expect(ctx.diagnostics.filter((d) => d.code === 'WORKBOOK_CHOICE_LABEL_TYPO')).toHaveLength(1);
    expect(ctx.diagnostics.some((d) => d.code === 'WORKBOOK_CHOICES_BROKEN')).toBe(false);
  });

  it('기대 번호는 첫 선지가 12줄 뒤에 있어도 문제로 확정한다', () => {
    expect(
      parseQuestionBook(
        question([...Array<string>(12).fill('가짜 줄'), '① 하나 ② 둘']),
        buildVocabulary([]),
        context(),
      ),
    ).toHaveLength(1);
  });

  it('본문 문단과 긴 선지를 같은 사전으로 이으며 원본 줄 위치를 보존한다', () => {
    const ctx = context();
    const parsed = parseQuestionBook(
      book([
        'Memo',
        'PART',
        '03',
        '치아형태학',
        '001',
        '가짜 사과',
        '나무?',
        '• 바나나',
        '는 과일',
        '(가) 가짜 보기',
        '※ 가짜 참고',
        '<가짜 조건>',
        '① 사과',
        '나무 ② 바나나',
        '는 과일',
      ]),
      buildVocabulary(['앞 사과나무 뒤']),
      ctx,
    );
    expect(parsed[0]).toMatchObject({
      sourceLine: 5,
      stem: ['가짜 사과나무?', '• 바나나는 과일', '(가) 가짜 보기', '※ 가짜 참고', '<가짜 조건>'],
      choices: ['사과나무', '바나나는 과일'],
    });
    expect(ctx.estimated).toBe(2);
  });

  it('마지막 선지의 이어지는 12줄은 허용하고 13줄이면 제외한다', () => {
    expect(
      parseQuestionBook(
        question(['① 하나 ② 둘', ...Array<string>(12).fill('가짜')]),
        buildVocabulary([]),
        context(),
      ),
    ).toHaveLength(1);
    const ctx = context();
    expect(
      parseQuestionBook(
        question(['① 하나 ② 둘', ...Array<string>(13).fill('가짜')]),
        buildVocabulary([]),
        ctx,
      ),
    ).toHaveLength(0);
    expect(ctx.diagnostics.some((d) => d.code === 'WORKBOOK_CHOICES_BROKEN')).toBe(true);
  });
});

describe('정답집 문단과 학습목표', () => {
  it('제목·불릿·선지 해설 문단을 나누고 중간 코드도 제거한 뒤 마지막 코드를 사용한다', () => {
    const ctx = context();
    const parsed = parseAnswerBook(
      book([
        '001〉〉>정답③',
        '가짜 사과',
        '나무',
        '◆ 형태 1 - 1 - 2',
        '• 바나나',
        '는 과일',
        'ㆍ 둘째',
        '- 셋째',
        '※ 참고',
        'cf) 가짜',
        '① → 가짜',
        '2) 둘째',
        '◆ 형태   1-2-3',
        'Memo',
        '55',
        '002 〉〉〉 정답 ①',
        '둘째 가짜',
        '• 둘째 불릿',
      ]),
      buildVocabulary(['앞 사과나무 뒤']),
      ctx,
    );
    expect(parsed[0]).toMatchObject({
      subjectId: 'morphology',
      number: 1,
      answerLabel: '③',
      titleParagraph: '가짜 사과나무',
      objectiveCode: '형태 1-2-3',
      sourceLine: 1,
      paragraphs: ['• 바나나는 과일', 'ㆍ 둘째', '- 셋째', '※ 참고', 'cf) 가짜', '① → 가짜', '2) 둘째'],
    });
    expect(parsed[1].objectiveCode).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain('◆');
    expect(ctx.diagnostics.some((d) => d.code === 'WORKBOOK_PART_MISMATCH')).toBe(true);
  });

  it('첫 줄부터 불릿이면 제목을 만들지 않는다', () => {
    const parsed = parseAnswerBook(
      book(['001 〉〉〉 정답 ①', '• 가짜 불릿', '◆ 법규 1-1-1']),
      buildVocabulary([]),
      context(),
    );
    expect(parsed[0].titleParagraph).toBe('');
    expect(parsed[0].paragraphs).toEqual(['• 가짜 불릿']);
  });

  it('잘못된 마지막 학습목표를 이전 코드로 대체하지 않는다', () => {
    const parsed = parseAnswerBook(
      book(['001 〉〉〉 정답 ①', '◆ 법규 1-1-1', '◆ 법규 코드오류']),
      buildVocabulary([]),
      context(),
    );
    expect(parsed[0].objectiveCode).toBeUndefined();
  });
});
