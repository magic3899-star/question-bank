import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import type { Constraint, RuleSet, SelectionContext } from '../../contracts/index';
import { standardConstraints } from '../constraints/index';
import { questionContentKey } from '../content-model/index';
import { segmentKey } from '../objective-code/index';
import { createRng } from '../rng/index';
import { presetRuleSets } from '../rules/index';
import { deepFreeze, makeQuestion, makeRuleSet, makeSegmentPool } from '../../../tests/fixtures/builders';
import { createSelector } from './index';

const selector = createSelector(standardConstraints);
const context = (seed = '중단원'): SelectionContext => ({ rng: createRng(seed), history: [] });
const slotRules = (mode?: string): RuleSet => makeRuleSet({ slots: [{ id: 's', label: '법규 대단원', count: 5,
  filter: { kind: 'objectivePrefix', prefixes: ['법규 1'] } }], constraints: [
  { kind: 'no-overlap-across-exams', params: {} }, { kind: 'no-duplicate-content', params: { scope: 'run' } },
  { kind: 'distinct-by-segment', params: { depth: 2, scope: 'slot', ...(mode === undefined ? {} : { mode }) } },
] });

describe('중단원 엄격 구분과 단일 중단원 면제 통합', () => {
  it.each([undefined, 'strict-unless-single'])('200개 시드에서 6종 중 5문제를 모두 다른 중단원으로 선택한다: %s', (mode) => {
    const pool = makeSegmentPool(6, 5);
    const rules = slotRules(mode);
    for (let seed = 0; seed < 200; seed++) {
      const result = selector.select(rules, pool, context(String(seed)));
      const exam = result.exams[0];
      expect(exam.questions).toHaveLength(5);
      expect(new Set(exam.questions.map((q) => segmentKey(q.objectiveCode!, 2))).size).toBe(5);
      expect(exam.blanks).toEqual([]);
      expect(result.diagnostics).toEqual([]);
    }
  });

  it.each([undefined, 'strict-unless-single'])('중단원 1종은 5문제를 모두 채우고 오류 없이 면제한다: %s', (mode) => {
    const rules = slotRules(mode);
    const result = selector.select(rules, makeSegmentPool(1, 10), context());
    expect(result.exams[0].questions).toHaveLength(5);
    expect(result.exams[0].blanks).toEqual([]);
    expect(result.diagnostics).toHaveLength(4);
    expect(result.diagnostics.every((d) => d.severity === 'info' && d.code === 'SEGMENT_REUSED')).toBe(true);
    expect(selector.precheck(rules, makeSegmentPool(1, 10), context())).toEqual([]);
  });

  it.each([1, 4])('법규 프리셋·800개 후보·중단원 %i종의 4슬롯×4회차에서 성능과 결정성을 유지한다', (segments) => {
    const rules = deepFreeze(presetRuleSets().find((r) => r.id === 'law')!);
    const pool = deepFreeze([1, 2, 3, 4].flatMap((unit) => makeSegmentPool(segments, 200 / segments, unit)));
    const before = structuredClone({ rules, pool });
    const start = performance.now();
    const result = selector.select(rules, pool, context());
    const selectMs = performance.now() - start;
    expect(selectMs).toBeLessThan(1000);
    const checkStart = performance.now();
    const check = selector.precheck(rules, pool, context());
    const precheckMs = performance.now() - checkStart;
    expect(precheckMs).toBeLessThan(300);
    console.info(`3c 가짜 후보 800개·중단원 ${segments}종: select ${Math.round(selectMs)}ms / precheck ${Math.round(precheckMs)}ms (기준 1000ms / 300ms)`);
    expect(result).toEqual(selector.select(rules, pool, context()));
    const selected = result.exams.flatMap((exam) => exam.questions);
    expect(new Set(selected.map((q) => q.id)).size).toBe(selected.length);
    expect(new Set(selected.map(questionContentKey)).size).toBe(selected.length);
    for (const exam of result.exams) {
      expect(exam.questions).toHaveLength(segments === 1 ? 20 : 16);
      expect(exam.blanks).toEqual(segments === 1 ? [] : rules.slots.map((slot) => ({ slotId: slot.id, count: 1 })));
      for (const slot of rules.slots) {
        const questions = exam.questions.filter((q) => exam.slotOfQuestion[q.id] === slot.id);
        expect(questions).toHaveLength(segments === 1 ? 5 : 4);
        expect(new Set(questions.map((q) => segmentKey(q.objectiveCode!, 2))).size).toBe(segments);
      }
    }
    expect(result.diagnostics.some((d) => d.severity === 'error' || d.code === 'SELECTION_SEARCH_LIMIT' || d.code === 'UNCONFIRMED_RULE_APPLIED')).toBe(false);
    if (segments === 4) {
      const blanks = result.diagnostics.filter((d) => d.code === 'SLOT_BLANK');
      expect(blanks).toHaveLength(16);
      for (const blank of blanks) {
        expect(blank.message).toContain('비는 1개');
        expect(blank.message).toContain('중단원이 서로 달라야 하는 규칙');
      }
      expect(check.filter((d) => d.code === 'SLOT_SHORTAGE')).toHaveLength(16);
    } else expect(check).toEqual([]);
    expect({ rules, pool }).toEqual(before);
  });

  it('2종 중 1종이 앞 회차에서 소진되어도 면제로 바꾸거나 중복으로 채우지 않는다', () => {
    const pool = [...makeSegmentPool(1, 10), ...makeSegmentPool(2, 1).slice(1)];
    const rules = slotRules('strict-unless-single');
    rules.examCount = 4;
    const result = selector.select(rules, pool, context('소진'));
    expect(result.exams.map((exam) => exam.questions.length)).toEqual([2, 1, 1, 1]);
    expect(result.exams.map((exam) => exam.blanks)).toEqual([3, 4, 4, 4].map((count) => [{ slotId: 's', count }]));
    const selected = result.exams.flatMap((exam) => exam.questions);
    expect(new Set(selected.map((q) => q.id)).size).toBe(5);
    for (const exam of result.exams) expect(new Set(exam.questions.map((q) => segmentKey(q.objectiveCode!, 2))).size).toBe(exam.questions.length);
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });

  it('모든 제약 호출에 슬롯 필터와 목표 파싱을 통과한 동일 정적 풀을 전달한다', () => {
    const valid = makeSegmentPool(2, 3);
    const pool = [...valid, ...makeSegmentPool(1, 3, 2), makeQuestion({ id: 'missing', objectiveCode: undefined }),
      makeQuestion({ id: 'bad', objectiveCode: '법규 ?' })];
    let calls = 0;
    let staticPool: readonly typeof valid[number][] | undefined;
    const observer: Constraint = { kind: 'constraint', id: 'observe', label: '정적 풀 확인', filterCandidates: (_spec, candidates, state) => {
      calls++;
      expect(state.slot.pool).toEqual(valid);
      if (staticPool) expect(state.slot.pool).toBe(staticPool);
      staticPool = state.slot.pool;
      return candidates;
    } };
    const rules = slotRules();
    rules.examCount = 2;
    rules.constraints.push({ kind: observer.id, params: {} });
    createSelector([...standardConstraints, observer]).select(rules, pool, context());
    expect(calls).toBeGreaterThan(2);
  });
});
