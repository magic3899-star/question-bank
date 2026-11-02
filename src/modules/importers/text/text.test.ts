import { describe, expect, it } from 'vitest';
import { parseExplanationText, parseQuestionText, textImporter } from './index';
import { standardProfile } from '../../layout-parser/index';
import { blocksToPlainText } from '../../content-model/index';

const lines = [
  '1. 가짜 본문',
  '① 가',
  '② 나',
  '③ 다',
  '④ 라',
  '⑤ 마',
  '정답: ②',
  '해설: 가짜 설명',
  '과목 1-1-1 (A)',
];
const options = { subject: 'dummy' };
describe('텍스트 가져오기와 PDF 복사 보정', () => {
  it('BOM과 CRLF·CR을 정규화하고 UTF-8 파일과 붙여넣기가 같은 문제를 만든다', async () => {
    const text = '\uFEFF' + lines.join('\r\n');
    const parsed = parseQuestionText(text, { ...options, sourceFile: '가짜.txt' });
    const file = await textImporter.parse(
      { fileName: '가짜.txt', data: new TextEncoder().encode(text) },
      options,
    );
    expect(file).toEqual(parsed);
    expect(parseQuestionText(lines.join('\r'), options).questions).toHaveLength(1);
    expect(file.questions[0]!.question.answerChoiceIds).toEqual(['c2']);
    expect(file.questions[0]!.question.choices.map((c) => blocksToPlainText(c.content))).toEqual([
      '가',
      '나',
      '다',
      '라',
      '마',
    ]);
  });
  it('한 줄의 순서대로 된 원문자와 앞뒤 특수 공백을 선지별로 나눈다', () => {
    const result = parseQuestionText(
      ['1. 가짜 본문', '\u00a0①\u3000가 ② 나 ③ 다 ④ 라 ⑤ 마', ...lines.slice(6)].join('\n'),
      options,
    );
    expect(result.questions[0]!.question.choices.map((c) => blocksToPlainText(c.content))).toEqual([
      '가',
      '나',
      '다',
      '라',
      '마',
    ]);
  });
  it('순서가 아닌 원문자와 정답·해설의 참조는 나누지 않는다', () => {
    const result = parseQuestionText(
      ['1. 가짜 ②, ① 참조', '① 가', '② 나', '정답: ① ②', '해설: ① 가 ② 나', '과목 1-1-1 (A)'].join('\n'),
      options,
    );
    const q = result.questions[0]!.question;
    expect(q.choices).toHaveLength(2);
    expect(blocksToPlainText(q.explanation)).toBe('① 가 ② 나');
    expect(q.answerChoiceIds).toEqual(['c1', 'c2']);
    expect(blocksToPlainText(q.stem)).toBe('가짜 ②, ① 참조');
  });
  it('잘린 본문·선지·해설은 공백 하나로 잇고 빈 줄은 경계로 둔다', () => {
    const result = parseQuestionText(
      [
        '1. 가짜',
        '본문',
        '① 첫',
        '선지',
        '② 둘',
        '정답: ①',
        '해설: 가짜',
        '설명',
        '',
        '따로 문단',
        '과목 1-1-1 (A)',
      ].join('\n'),
      options,
    );
    const q = result.questions[0]!.question;
    expect(blocksToPlainText(q.stem)).toBe('가짜 본문');
    expect(blocksToPlainText(q.choices[0]!.content)).toBe('첫 선지');
    expect(q.explanation).toHaveLength(2);
    expect(blocksToPlainText(q.explanation)).toBe('가짜 설명\n따로 문단');
  });
  it('보정을 끄면 원래 문단과 한 줄 선지를 그대로 둔다', () => {
    const result = parseQuestionText(['1. 가짜', '본문', '① 가 ② 나 ③ 다', ...lines.slice(6)].join('\n'), {
      ...options,
      pdfCopyCleanup: false,
    });
    expect(result.questions[0]!.question.choices).toHaveLength(1);
    expect(blocksToPlainText(result.questions[0]!.question.passage!)).toBe('본문');
  });
  it.each(['- 3 -', '3', '3/12'])('쪽 번호 %s를 삭제하지 않고 경고한다', (page) => {
    const result = parseQuestionText([...lines.slice(0, 8), page, lines[8]!].join('\n'), options);
    expect(result.diagnostics.some((d) => d.code === 'PDF_ARTIFACT_SUSPECTED')).toBe(true);
    expect(blocksToPlainText(result.questions[0]!.question.explanation)).toContain(page);
  });
  it('반복 머리글을 보존하고 의심 경고로 알린다', () => {
    const result = parseQuestionText(['가짜 반복 머리글', ...lines, '가짜 반복 머리글'].join('\n'), options);
    expect(result.diagnostics.filter((d) => d.code === 'PDF_ARTIFACT_SUSPECTED')).toHaveLength(2);
  });
  it('교체한 프로파일을 보정과 본 해석 모두 사용한다', () => {
    const profile = {
      ...standardProfile,
      stemStartPattern: '^\\s*문항(\\d+)\\)\\s*',
      answerLabelPattern: '^답=\\s*',
    };
    const result = parseQuestionText(
      ['문항01) 가짜 본문', '이어진 본문', '① 가 ② 나', '답=②', '과목 1-1-1 (A)'].join('\n'),
      { ...options, profile },
    );
    expect(result.questions[0]!.question.extra.originalNumber).toBe('01');
    expect(result.questions[0]!.question.answerChoiceIds).toEqual(['c2']);
    expect(blocksToPlainText(result.questions[0]!.question.stem)).toBe('가짜 본문 이어진 본문');
  });
  it('빈 입력·잘못된 UTF-8·프로파일·과목과 결정성을 다룬다', async () => {
    expect(parseQuestionText('', options).questions).toEqual([]);
    expect(parseQuestionText(lines.join('\n'), options)).toEqual(
      parseQuestionText(lines.join('\n'), options),
    );
    expect(parseQuestionText('', { subject: '' }).diagnostics[0]!.code).toBe('SUBJECT_REQUIRED');
    expect(
      parseQuestionText('', { ...options, profile: { ...standardProfile, stemStartPattern: '[' } })
        .diagnostics[0]!.code,
    ).toBe('LAYOUT_INVALID');
    expect(
      (await textImporter.parse({ fileName: '가짜.txt', data: new Uint8Array([255]) }, options))
        .diagnostics[0]!.code,
    ).toBe('TEXT_INVALID');
  });
});
describe('해설만 붙여넣기', () => {
  it('세 가지 번호 머리와 앞자리 0을 보존하고 번호별 여러 문단으로 나눈다', () => {
    const result = parseExplanationText(
      '가짜 제목\r\n1. 해설 가짜 하나\r추가 설명\n01) 가짜 둘\n[해설] 2번 가짜 셋',
    );
    expect(result.map((r) => r.number)).toEqual(['1', '01', '2']);
    expect(result.map((r) => blocksToPlainText(r.explanation))).toEqual([
      '가짜 하나\n추가 설명',
      '가짜 둘',
      '가짜 셋',
    ]);
  });
  it('프로파일 번호 패턴 교체와 빈 입력을 지원한다', () => {
    expect(
      parseExplanationText('해설#007 가짜 설명', {
        ...standardProfile,
        explanationNumberPattern: '^해설#(\\d+)\\s*',
      })[0],
    ).toMatchObject({ number: '007' });
    expect(parseExplanationText('')).toEqual([]);
    expect(parseExplanationText('번호 없는 설명')).toEqual([]);
    expect(() => parseExplanationText('', { ...standardProfile, explanationNumberPattern: '[' })).toThrow(
      '양식',
    );
  });
});
