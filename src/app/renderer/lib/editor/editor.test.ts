import { describe, expect, it } from 'vitest';
import { explanationAnswerState, autoPolicy, matchExplanations, newQuestion } from './index';

describe('편집기 작업 묶음', () => {
  it('계속 추가는 과목·학습목표·등급만 유지한다', () => {
    const old = { ...newQuestion('fake'), id: 'old', grade: 'A', objectiveCode: '가짜 1-1-1' };
    expect(newQuestion(old.subject, old)).toMatchObject({
      id: '',
      subject: 'fake',
      grade: 'A',
      objectiveCode: '가짜 1-1-1',
      explanation: [],
      extra: {},
    });
  });
  it('원문자 참조는 자동 잠금, 사용자 해제는 유지한다', () => {
    const q = {
      ...newQuestion('fake'),
      explanation: [{ type: 'paragraph' as const, runs: [{ text: '정답 ③ 설명' }] }],
    };
    expect(autoPolicy(q).shufflePolicy).toBe('lock-all');
    expect(autoPolicy({ ...q, extra: { allowChoiceShuffle: true } }).shufflePolicy).toBe('free');
  });
  it('앞자리 0을 보존하며 불일치·누락·중복 번호를 구별한다', () => {
    const q = newQuestion('fake');
    const matched = matchExplanations(
      [
        { ...q, extra: { originalNumber: '01' } },
        { ...q, extra: {} },
        { ...q, extra: { originalNumber: '3' } },
      ],
      [
        { number: '01', explanation: [], answerPositions: [1] },
        { number: '9', explanation: [], answerPositions: [] },
      ],
    );
    expect(matched.rows.map((r) => r.number)).toEqual(['01', '2', '3']);
    expect(matched.rows.map((r) => !!r.explanation)).toEqual([true, false, false]);
    expect(matched.unmatched.map((r) => r.number)).toEqual(['9']);
    expect(
      matchExplanations(
        [q],
        [
          { number: '1', explanation: [], answerPositions: [] },
          { number: '1', explanation: [], answerPositions: [] },
        ],
      ).rows[0]?.ambiguous,
    ).toBe(true);
  });
});

describe('해설 정답 적용 선택', () => {
  it('빈 정답만 기본 선택하고 기존 정답의 불일치와 범위 오류를 구별한다', () => {
    const question = newQuestion('fake');
    const explanation = { number: '1', explanation: [], answerPositions: [3] };
    expect(explanationAnswerState(question, explanation)).toEqual({
      defaultApply: true,
      conflict: false,
      invalid: false,
    });
    expect(explanationAnswerState({ ...question, answerChoiceIds: ['c1'] }, explanation)).toEqual({
      defaultApply: false,
      conflict: true,
      invalid: false,
    });
    expect(explanationAnswerState({ ...question, answerChoiceIds: ['c3'] }, explanation).conflict).toBe(
      false,
    );
    expect(explanationAnswerState(question, { ...explanation, answerPositions: [] }).defaultApply).toBe(
      false,
    );
    expect(explanationAnswerState(question, { ...explanation, answerPositions: [6] }).invalid).toBe(true);
  });
});
