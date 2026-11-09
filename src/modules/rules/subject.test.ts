import { describe, expect, it } from 'vitest';
import { subjectCatalog } from '../subject-catalog/index';
import { subjectRuleSet, validateRuleSet } from './index';

describe('과목별 기본 출제 규칙', () => {
  it.each(subjectCatalog)('$name의 문항 수·접두·시작 번호를 따르고 유효하다', (subject) => {
    const rules = subjectRuleSet(subject);
    expect(rules).toMatchObject({
      id: subject.id,
      name: subject.name,
      subject: subject.id,
      examCount: 4,
      startNumber: subject.startNumber,
      schemaVersion: 1,
    });
    expect(rules.slots).toEqual([
      {
        id: `${subject.id}-all`,
        label: `${subject.name} 전체`,
        count: subject.questionCount,
        filter: { kind: 'objectivePrefix', prefixes: [subject.prefix] },
      },
    ]);
    expect(rules.constraints).toEqual([
      { kind: 'no-overlap-across-exams', params: { scope: 'all' } },
      { kind: 'no-duplicate-content', params: { scope: 'run' } },
    ]);
    expect(rules.note).toBe(
      '국시원 문항 수 기준의 기본 규칙입니다. 단원별 배분이 정해지면 슬롯을 나누어 고치세요.',
    );
    expect(validateRuleSet(rules, ['no-overlap-across-exams', 'no-duplicate-content'])).toEqual([]);
  });
});
