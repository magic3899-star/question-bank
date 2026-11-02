import { describe, expect, it } from 'vitest';
import type { LayoutBlock, LayoutOptions } from './index';
import { parseLayout, standardProfile, validateProfile } from './index';
import { blocksToPlainText } from '../content-model/index';

const blocks = (lines: string[]): LayoutBlock[] =>
  lines.map((text, i) => ({
    text,
    sourceIndex: i + 1,
    kind: 'paragraph',
    block: { type: 'paragraph', runs: [{ text }] },
  }));
const record = (n = 1, grade = 'A', stem = '가짜 문제'): string[] => [
  `${n}. ${stem}`,
  '가짜 예문',
  '① 가짜 하나',
  '② 가짜 둘',
  '정답: ①',
  '해설: 가짜 설명',
  `과목 1-1-${n} (${grade})`,
];
const parse = (lines: string[], options: Partial<LayoutOptions> = {}) =>
  parseLayout(blocks(lines), standardProfile, { subject: 'dummy', sourceFile: '가짜', ...options });

describe('형식 중립 문제 해석 규칙', () => {
  it('문제·예문·선지·정답·해설·목표·위치를 복원하고 번호는 선지 내용에 남기지 않는다', () => {
    const result = parse(record());
    const q = result.questions[0]!;
    expect(blocksToPlainText(q.question.stem)).toBe('가짜 문제');
    expect(blocksToPlainText(q.question.passage!)).toBe('가짜 예문');
    expect(q.question.choices.map((c) => blocksToPlainText(c.content))).toEqual(['가짜 하나', '가짜 둘']);
    expect(q.question.answerChoiceIds).toEqual(['c1']);
    expect(blocksToPlainText(q.question.explanation)).toBe('가짜 설명');
    expect(q.question).toMatchObject({ objectiveCode: '과목 1-1-1', grade: 'A' });
    expect(q.sourceLocation).toContain('1번째 문단');
  });
  it('등급·목표·중복 제외는 기존 순서를 유지하고 각각 해제할 수 있다', () => {
    const noObjective = record(2).slice(0, -1);
    const lines = [...record(1, 'B'), ...noObjective, ...record(3), ...record(4)];
    const result = parse(lines);
    expect(result.questions.map((q) => q.question.extra.originalNumber)).toEqual(['3']);
    expect(result.diagnostics.map((d) => d.code)).toEqual([
      'SKIPPED_BY_GRADE',
      'SKIPPED_NO_OBJECTIVE',
      'SKIPPED_DUPLICATE_PASSAGE',
    ]);
    expect(
      parse(lines, { includeGrades: null, requireObjective: false, dedupeByPassage: false }).questions,
    ).toHaveLength(4);
  });
  it('출처 태그는 닫는 꺾쇠가 없어도 문제를 닫고 저장하지 않는다', () => {
    const result = parse([...record().slice(0, -1), '<2026-1-2', ...record(2, 'A', '다음 문제')], {
      requireObjective: false,
      includeGrades: null,
    });
    expect(result.questions).toHaveLength(2);
    expect(result.questions.every((q) => q.question.sourceTag === undefined)).toBe(true);
    expect(blocksToPlainText(result.questions[0]!.question.explanation)).toBe('가짜 설명');
  });
  it('번호가 붙은 예문과 해설의 단일 목록은 새 문제로 오인하지 않는다', () => {
    const result = parse([
      '1. 가짜 문제',
      '1. 번호 예문',
      '① 가',
      '② 나',
      '정답: ①',
      '해설: 설명',
      '2. 해설 목록',
      '① 단일 참조',
      '과목 1-1-1 (A)',
    ]);
    expect(result.questions).toHaveLength(1);
    expect(blocksToPlainText(result.questions[0]!.question.passage!)).toBe('1. 번호 예문');
    expect(blocksToPlainText(result.questions[0]!.question.explanation)).toContain('2. 해설 목록');
  });
  it('앞보기는 표와 이미지를 건너뛰며 포함 문제에서 쓰는 자산 ID만 반환한다', () => {
    const input = blocks(record());
    input.splice(1, 0, {
      block: { type: 'table', rows: [[[{ type: 'image', assetId: 'used' }]]] },
      text: '',
      sourceIndex: 2,
      kind: 'table',
    });
    expect(parseLayout(input, standardProfile, { subject: 'dummy' }).usedAssetIds).toEqual(['used']);
    expect(
      parseLayout(input, standardProfile, { subject: 'dummy', includeGrades: ['B'] }).usedAssetIds,
    ).toEqual([]);
  });
  it('상자 안의 라벨 모양 문단은 문제 경계로 쓰지 않는다', () => {
    const input = blocks(record());
    input.splice(1, 0, {
      text: '정답: ⑤',
      sourceIndex: 2,
      kind: 'box',
      block: { type: 'paragraph', runs: [{ text: '정답: ⑤' }] },
    });
    const q = parseLayout(input, standardProfile, { subject: 'dummy' }).questions[0]!.question;
    expect(blocksToPlainText(q.passage!)).toContain('정답: ⑤');
    expect(q.answerChoiceIds).toEqual(['c1']);
  });
  it('해설의 번호 참조로 전체 선지를 고정하고 선지 자체 고정은 독립적이다', () => {
    const lines = record();
    lines[2] = '① 위의 항목';
    lines[5] = '해설: ② 참조';
    const result = parse(lines);
    expect(result.questions[0]!.question.shufflePolicy).toBe('lock-all');
    expect(result.questions[0]!.question.choices[0]!.fixedPosition).toBe(true);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'CHOICES_LOCKED_BY_REFERENCE',
      ref: { draftIndex: 0 },
    });
    expect(parse(lines, { lockChoicesOnReference: false }).questions[0]!.question.shufflePolicy).toBe('free');
  });
  it('문서 진단의 소유 문제와 필터 후 인덱스를 연결한다', () => {
    const result = parseLayout(
      blocks([...record(1, 'B'), ...record(2)]),
      standardProfile,
      { subject: 'dummy' },
      [
        { position: 3, diagnostic: { code: 'FAKE', severity: 'warn', message: '가짜 첫 진단' } },
        { position: 10, diagnostic: { code: 'KEPT', severity: 'warn', message: '가짜 두 번째 진단' } },
      ],
    );
    expect(result.diagnostics.some((d) => d.code === 'FAKE')).toBe(false);
    expect(result.diagnostics.find((d) => d.code === 'KEPT')?.ref?.draftIndex).toBe(0);
  });
  it('자동 원문자 정보와 프로파일 교체도 형식에 의존하지 않는다', () => {
    const input = blocks(record());
    input[2]!.text = '가짜 하나';
    input[2]!.block = { type: 'paragraph', runs: [{ text: '가짜 하나' }] };
    input[2]!.circledNumbering = true;
    const result = parseLayout(input, standardProfile, { subject: 'dummy' });
    expect(result.questions[0]!.question.choices).toHaveLength(2);
    expect(result.diagnostics.some((d) => d.code === 'AUTO_NUMBERING_RESTORED')).toBe(true);
    expect(validateProfile({ ...standardProfile, stemStartPattern: '[' }).length).toBeGreaterThan(0);
  });
  it('앞부분과 중간 버려진 내용은 구간별 진단을 내며 빈 입력·잘못된 옵션을 안전하게 처리한다', () => {
    expect(
      parse(['가짜 제목', '가짜 부제', ...record(), '남은 내용']).diagnostics.map((d) => d.code),
    ).toEqual(['PREAMBLE_IGNORED', 'UNPARSED_BLOCKS']);
    expect(parse([]).questions).toEqual([]);
    expect(parse(record(), { subject: '' }).diagnostics[0]!.code).toBe('SUBJECT_REQUIRED');
    expect(parse(record(), { includeGrades: 3 as unknown as string[] }).diagnostics[0]!.code).toBe(
      'GRADE_FILTER_INVALID',
    );
    const input = blocks(record());
    const copy = structuredClone(input);
    expect(parseLayout(input, standardProfile, { subject: 'dummy' })).toEqual(
      parseLayout(input, standardProfile, { subject: 'dummy' }),
    );
    expect(input).toEqual(copy);
  });
});
