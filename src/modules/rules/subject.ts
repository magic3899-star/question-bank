import type { RuleSet } from '../../contracts/index';
import type { CatalogSubject } from '../subject-catalog/index';

export function subjectRuleSet(subject: CatalogSubject): RuleSet {
  return {
    id: subject.id,
    schemaVersion: 1,
    name: subject.name,
    subject: subject.id,
    examCount: 4,
    startNumber: subject.startNumber,
    slots: [
      {
        id: `${subject.id}-all`,
        label: `${subject.name} 전체`,
        count: subject.questionCount,
        filter: { kind: 'objectivePrefix', prefixes: [subject.prefix] },
      },
    ],
    constraints: [
      { kind: 'no-overlap-across-exams', params: { scope: 'all' } },
      { kind: 'no-duplicate-content', params: { scope: 'run' } },
    ],
    note: '국시원 문항 수 기준의 기본 규칙입니다. 단원별 배분이 정해지면 슬롯을 나누어 고치세요.',
  };
}
