import { describe, expect, it } from 'vitest';
import { makeChoice, makeHistoryEntry, makeQuestion, makeRuleSet, para } from './builders';

describe('가짜 데이터 빌더', () => {
  it('명시한 필드와 서식을 적용한다', () => {
    expect(para('가짜', { underline: true }).runs).toEqual([{ text: '가짜', underline: true }]);
    expect(makeChoice({ id: 'changed' }).id).toBe('changed');
    expect(makeQuestion({ subject: 'changed' }).subject).toBe('changed');
    expect(makeRuleSet({ examCount: 3 }).examCount).toBe(3);
    expect(makeHistoryEntry({ examId: 'changed' }).examId).toBe('changed');
  });

  it('호출마다 독립된 객체를 만들고 선지 번호를 내용에 넣지 않는다', () => {
    const first = makeQuestion();
    first.tags.push('가짜 변경');
    first.choices[0].content.push(para('가짜 추가'));
    expect(makeQuestion().tags).toEqual(['가짜태그']);
    expect(makeQuestion().choices[0].content).toHaveLength(1);
    expect(JSON.stringify(makeQuestion().choices)).not.toMatch(/[①-⑤]/);
  });
});
