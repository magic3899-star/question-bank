import { describe, expect, it } from 'vitest';
import type { FilterSpec, RuleSet } from '../../contracts/index';
import { deepFreeze, makeRuleSet } from '../../../tests/fixtures/builders';
import { describeRuleSet, presetRuleSets, RULESET_SCHEMA_VERSION, slotsTotalCount, validateRuleSet } from './index';

describe('출제 규칙', () => {
  it('정상 규칙과 프리셋은 오류 없이 검증된다', () => {
    expect(RULESET_SCHEMA_VERSION).toBe(1);
    expect(validateRuleSet(makeRuleSet())).toEqual([]);
    for (const preset of presetRuleSets()) expect(validateRuleSet(preset).filter((d) => d.severity === 'error')).toEqual([]);
    const [anatomy, law] = presetRuleSets();
    expect(slotsTotalCount(anatomy)).toBe(7);
    expect(anatomy.slots).toHaveLength(6);
    expect(anatomy).toMatchObject({ subject: 'anatomy', examCount: 4, startNumber: 21 });
    expect(law).toMatchObject({ subject: 'law', examCount: 4, startNumber: 1 });
    expect(law.slots).toHaveLength(4);
    expect(slotsTotalCount(law)).toBe(20);
    expect(law.name).toBe('의료관계법규');
    expect(law.note).toBeUndefined();
    expect(anatomy.constraints.some((c) => c.needsConfirmation)).toBe(false);
    expect(validateRuleSet(law).some((d) => d.code === 'UNCONFIRMED_RULE')).toBe(false);
    anatomy.slots[0].count = 999;
    expect(slotsTotalCount(presetRuleSets()[0])).toBe(7);
  });
  it.each<Partial<RuleSet>>([{ id: ' ' }, { name: '' }, { subject: '' }, { schemaVersion: 0 }, { examCount: 0 }, { examCount: 1.5 }, { startNumber: 0.1 }, { slots: [] }])('필수 값 오류를 안내한다: %j', (override) => {
    expect(validateRuleSet(makeRuleSet(override)).some((d) => d.severity === 'error')).toBe(true);
  });
  it('슬롯 ID와 개수를 검사한다', () => {
    const rules = makeRuleSet();
    rules.slots.push({ ...rules.slots[0], count: -1 });
    expect(validateRuleSet(rules).filter((d) => d.severity === 'error')).toHaveLength(2);
    rules.slots[0].id = '';
    expect(validateRuleSet(rules).some((d) => d.message.includes('식별자'))).toBe(true);
  });
  it.each<FilterSpec>([{ kind: 'objectivePrefix', prefixes: [] }, { kind: 'objectivePrefix', prefixes: ['해부 1--'] },
    { kind: 'tag', tags: [] }, { kind: 'tag', tags: [' '] }, { kind: 'sourceTag', values: [] }, { kind: 'sourceTag', values: [''] }])('필터 필수 필드를 검사한다: %j', (filter) => {
    const rules = makeRuleSet(); rules.slots[0].filter = filter;
    expect(validateRuleSet(rules).some((d) => d.severity === 'error')).toBe(true);
  });
  it('알 수 없는 제약과 필터를 진단한다', () => {
    const rules = makeRuleSet({ constraints: [{ kind: 'missing', params: {} }] });
    expect(validateRuleSet(rules, []).some((d) => d.code === 'UNKNOWN_CONSTRAINT')).toBe(true);
    expect(validateRuleSet(rules)).toEqual([]);
    rules.slots[0].filter = { kind: 'bad' } as unknown as FilterSpec;
    expect(validateRuleSet(rules).some((d) => d.code === 'RULESET_INVALID')).toBe(true);
  });
  it('잘못된 필터 배열이나 누락된 필터도 예외 대신 안내한다', () => {
    for (const filter of [undefined, { kind: 'objectivePrefix' }, { kind: 'tag', tags: '가짜' }, { kind: 'sourceTag', values: [1] }]) {
      const rules = makeRuleSet();
      rules.slots[0].filter = filter as unknown as FilterSpec;
      expect(validateRuleSet(rules).some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
    }
    for (const prefixes of [['해부'], ['해부 1 -'], ['해부　2 - 2']]) {
      const rules = makeRuleSet(); rules.slots[0].filter = { kind: 'objectivePrefix', prefixes };
      expect(validateRuleSet(rules)).toEqual([]);
    }
  });
  it('한국어 요약을 제공하며 입력을 바꾸지 않는다', () => {
    const rules = deepFreeze(presetRuleSets()[0]);
    const before = structuredClone(rules);
    const lines = describeRuleSet(rules);
    expect(lines).toContain('회차 4개, 각 7문제');
    expect(lines.some((line) => line.startsWith("슬롯 '해부 1~2단원': 2문제"))).toBe(true);
    expect(lines.some((line) => line.includes('회차 간 동일 문제 금지') && !line.includes('확인 필요'))).toBe(true);
    validateRuleSet(rules); slotsTotalCount(rules);
    expect(rules).toEqual(before);
  });
});

it('확정 프리셋의 슬롯·제약·설명에 중단원 엄격 구분과 단일 중단원 면제를 반영한다', () => {
  const [anatomy, law] = presetRuleSets();
  expect(law.slots.map((s) => [s.count, s.filter])).toEqual([1, 2, 3, 4].map((unit) => [5, { kind: 'objectivePrefix', prefixes: [`법규 ${unit}`] }]));
  for (const rules of [anatomy, law]) {
    expect(rules.constraints.find((c) => c.kind === 'no-overlap-across-exams')).toEqual({ kind: 'no-overlap-across-exams', params: { scope: 'all' } });
    expect(rules.constraints.find((c) => c.kind === 'no-duplicate-content')).toEqual({ kind: 'no-duplicate-content', params: { scope: 'run' } });
    expect(describeRuleSet(rules)).toContain('후보가 모자라면 빈 번호로 남습니다');
  }
  expect(law.constraints.filter((c) => c.needsConfirmation)).toHaveLength(0);
  expect(law.constraints.find((c) => c.params.depth === 3)).toEqual({ kind: 'distinct-by-segment', params: { depth: 3, scope: 'exam', mode: 'strict' } });
  expect(law.constraints.find((c) => c.params.depth === 2)).toEqual({ kind: 'distinct-by-segment',
    params: { depth: 2, mode: 'strict-unless-single', scope: 'slot' }, needsConfirmation: false,
    note: '한 대단원의 문제는 중단원이 서로 달라야 하며, 중단원이 하나뿐인 대단원은 면제합니다. 중단원이 문제 수보다 적으면 남는 자리는 빈 번호로 남습니다.' });
  const summary = describeRuleSet(law).join('\n');
  expect(summary).toContain('반드시 서로 다르게');
  expect(summary).toContain('중단원이 하나뿐인 대단원은 면제');
  expect(summary).toContain('중단원이 문제 수보다 적으면 남는 자리는 빈 번호');
  expect(summary).not.toContain('확인 필요');
  expect(summary).not.toContain('가능하면');
});

it('요약도 생략된 기본 모드·prefer·exam 범위의 차이를 설명한다', () => {
  const rules = makeRuleSet({ constraints: [{ kind: 'distinct-by-segment', params: { depth: 2, scope: 'slot' } }] });
  expect(describeRuleSet(rules).join('\n')).toContain('하나뿐이면 면제');
  rules.constraints[0].params.mode = 'prefer';
  expect(describeRuleSet(rules).join('\n')).toContain('가능하면 서로 다르게');
  rules.constraints[0].params = { depth: 2, scope: 'exam', mode: 'strict-unless-single' };
  expect(describeRuleSet(rules).join('\n')).not.toContain('면제');
});
