import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import type { Constraint, ConstraintSpec, Question, RuleSet, SelectionContext } from '../../contracts/index';
import { standardConstraints } from '../constraints/index';
import { createRng } from '../rng/index';
import {
  deepFreeze,
  makeHistoryEntry,
  makePool,
  makeQuestion,
  makeRuleSet,
  para,
} from '../../../tests/fixtures/builders';
import { createSelector, SELECTION_FILTER_CALL_LIMIT, PRECHECK_FILTER_CALL_LIMIT } from './index';

const selector = createSelector(standardConstraints);
const context = (seed = '선택'): SelectionContext => ({ rng: createRng(seed), history: [] });
const spec = (kind: string, params: Record<string, unknown> = {}): ConstraintSpec => ({ kind, params });
const ids = (result: ReturnType<typeof selector.select>): string[] =>
  result.exams.flatMap((exam) => exam.questions.map((question) => question.id));

describe('문제 선택기', () => {
  it('개수와 규칙 슬롯 순서를 지키고 tag/sourceTag/all 필터를 평가한다', () => {
    const pool = makePool(20).map((question, index) => ({
      ...question,
      tags: index < 10 ? ['앞'] : ['뒤'],
      sourceTag: index === 0 ? '희소' : '일반',
    }));
    const rules = makeRuleSet({
      slots: [
        { id: 'a', label: '태그', count: 3, filter: { kind: 'tag', tags: ['앞'] } },
        { id: 'b', label: '출처', count: 1, filter: { kind: 'sourceTag', values: ['희소'] } },
        { id: 'c', label: '전체', count: 2, filter: { kind: 'all' } },
      ],
    });
    const result = selector.select(rules, pool, context());
    expect(result.diagnostics).toEqual([]);
    const exam = result.exams[0];
    expect(exam.questions).toHaveLength(6);
    expect(exam.questions.map((question) => exam.slotOfQuestion[question.id])).toEqual([
      'a',
      'a',
      'a',
      'b',
      'c',
      'c',
    ]);
    expect(exam.questions[3].id).toBe('q0');
    expect(new Set(ids(result)).size).toBe(6);
  });
  it('같은 시드 결과는 같고 충분한 풀의 다른 시드는 달라진다', () => {
    const pool = makePool(100);
    const rules = makeRuleSet({ slots: [{ id: 'a', label: '전체', count: 10, filter: { kind: 'all' } }] });
    expect(selector.select(rules, pool, context('same'))).toEqual(
      selector.select(rules, pool, context('same')),
    );
    expect(ids(selector.select(rules, pool, context('first')))).not.toEqual(
      ids(selector.select(rules, pool, context('second'))),
    );
  });
  it('해부 1은 해부 14를 고르지 않는다', () => {
    const rules = makeRuleSet();
    rules.slots[0].filter = { kind: 'objectivePrefix', prefixes: ['해부 1-'] };
    const pool = [
      makeQuestion({ id: 'good', objectiveCode: '해부 1-2-3' }),
      makeQuestion({ id: 'bad', objectiveCode: '해부 14-1-3' }),
    ];
    expect(ids(selector.select(rules, pool, context()))).toEqual(['good']);
  });
  it('200개 시드에서 학습목표 구간 중복을 막는다', () => {
    const pool = makePool(90);
    const rules = makeRuleSet({
      slots: [{ id: 'a', label: '전체', count: 9, filter: { kind: 'all' } }],
      constraints: [spec('distinct-by-segment', { depth: 1 })],
    });
    for (let seed = 0; seed < 200; seed++) {
      const result = selector.select(rules, pool, context(String(seed)));
      expect(result.diagnostics).toEqual([]);
      expect(
        new Set(result.exams[0].questions.map((question) => question.objectiveCode?.split('-')[0])).size,
      ).toBe(9);
    }
  });
  it('100개 시드에서 4회차 간 중복을 막는다', () => {
    const rules = makeRuleSet({
      examCount: 4,
      slots: [{ id: 'a', label: '전체', count: 7, filter: { kind: 'all' } }],
      constraints: [spec('no-overlap-across-exams')],
    });
    for (let seed = 0; seed < 100; seed++) {
      const result = selector.select(rules, makePool(50), context(String(seed)));
      expect(result.diagnostics).toEqual([]);
      expect(new Set(ids(result)).size).toBe(28);
    }
  });
  it('최신 시험을 날짜로 찾아 제외한다', () => {
    const ctx = context();
    ctx.history = [
      makeHistoryEntry({ createdAt: '2026-02-01Z', questionIds: ['q0'] }),
      makeHistoryEntry({ createdAt: '2025-01-01Z', questionIds: ['q1'] }),
    ];
    const rules = makeRuleSet({ constraints: [spec('exclude-recent', { lastNExams: 1 })] });
    const result = selector.select(rules, makePool(2), ctx);
    expect(ids(result)).toEqual(['q1']);
    expect(result.diagnostics).toEqual([]);
  });
  it.each(['exam', 'run'])('완전히 동일한 문제 쌍을 %s 범위에서 제외한다', (scope) => {
    const original = makeQuestion({ id: 'a' });
    const pool = [original, { ...original, id: 'b' }, ...makePool(15)];
    const rules = makeRuleSet({
      examCount: 3,
      slots: [{ id: 'a', label: '전체', count: 5, filter: { kind: 'all' } }],
      constraints: [spec('no-duplicate-content', { scope })],
    });
    for (let seed = 0; seed < 30; seed++) {
      const result = selector.select(rules, pool, context(String(seed)));
      expect(result.diagnostics).toEqual([]);
      const groups =
        scope === 'run'
          ? [result.exams.flatMap((exam) => exam.questions)]
          : result.exams.map((exam) => exam.questions);
      for (const group of groups)
        expect(group.filter((question) => ['a', 'b'].includes(question.id)).length).toBeLessThanOrEqual(1);
    }
  });
  it('부족해도 부분 결과를 돌려주고 수량·슬롯·해결 방법을 안내한다', () => {
    const rules = makeRuleSet({
      slots: [{ id: 'a', label: '가짜 슬롯', count: 3, filter: { kind: 'all' } }],
    });
    const result = selector.select(rules, makePool(2), context());
    expect(result.exams[0].questions).toHaveLength(2);
    const diagnostic = result.diagnostics.find((d) => d.code === 'SLOT_BLANK')!;
    for (const text of ['가짜 슬롯', '필요 3개', '채움 2개', '비는 1개', '추가', '제약'])
      expect(diagnostic.message).toContain(text);
  });
  it('제약 때문에 부족하면 원인 제약과 감소 수를 안내한다', () => {
    const rules = makeRuleSet({
      slots: [{ id: 'a', label: '학습목표', count: 2, filter: { kind: 'all' } }],
      constraints: [spec('distinct-by-segment', { depth: 1 })],
    });
    const pool = makePool(3).map((question) => ({ ...question, objectiveCode: '과목 1-1-1' }));
    const result = selector.select(rules, pool, context());
    expect(result.diagnostics.find((d) => d.code === 'SLOT_BLANK')?.message).toContain(
      '학습목표 구간 중복 금지 2개',
    );
  });
  it('알 수 없는 제약은 실행을 중단하고 미확정 제약은 note와 경고한다', () => {
    const bad = makeRuleSet({ constraints: [spec('missing')] });
    expect(selector.select(bad, makePool(2), context())).toMatchObject({
      exams: [],
      diagnostics: [{ code: 'UNKNOWN_CONSTRAINT' }],
    });
    expect(selector.precheck(bad, [], context())[0].code).toBe('UNKNOWN_CONSTRAINT');
    const rules = makeRuleSet({
      constraints: [
        { ...spec('no-overlap-across-exams'), needsConfirmation: true, note: '중복 허용 여부 확인 필요' },
      ],
    });
    expect(selector.select(rules, makePool(2), context()).diagnostics[0]).toMatchObject({
      code: 'UNCONFIRMED_RULE_APPLIED',
      severity: 'warn',
      message: expect.stringContaining('중복 허용 여부 확인 필요'),
    });
  });
  it('학습목표 누락·파싱 불가 문제를 한 건의 요약으로 제외한다', () => {
    const pool = [
      makeQuestion({ objectiveCode: undefined }),
      makeQuestion({ objectiveCode: '이상' }),
      ...makePool(2),
    ];
    const result = selector.select(makeRuleSet(), pool, context());
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'NO_OBJECTIVE_EXCLUDED', message: expect.stringContaining('2개') }),
    ]);
    expect(ids(result)[0]).toMatch(/^q\d$/);
  });
  it('이전 슬롯의 탐욕 선택을 되돌려 전체 시험을 완성한다', () => {
    const pool = [
      makeQuestion({ id: 'x', sourceTag: 'A' }),
      makeQuestion({ id: 'y', sourceTag: 'A', stem: [para('다른 가짜')] }),
      makeQuestion({ id: 'u', sourceTag: 'B' }),
      makeQuestion({ id: 'v', sourceTag: 'B' }),
    ];
    const rules = makeRuleSet({
      slots: ['A', 'B'].map((tag) => ({
        id: tag,
        label: tag,
        count: 1,
        filter: { kind: 'sourceTag' as const, values: [tag] },
      })),
      constraints: [spec('no-duplicate-content')],
    });
    const duplicate = standardConstraints.find((plugin) => plugin.id === 'no-duplicate-content')!;
    let sawDeadEnd = false;
    const observed: Constraint = {
      ...duplicate,
      filterCandidates: (s, candidates, state) => {
        const filtered = duplicate.filterCandidates!(s, candidates, state);
        if (
          state.slot.id === 'B' &&
          state.currentChosen.some((question) => question.id === 'x') &&
          !filtered.length
        )
          sawDeadEnd = true;
        return filtered;
      },
    };
    const seed = Array.from({ length: 100 }, (_, index) => String(index)).find(
      (value) => createRng(value).fork('retry0').fork('exam0/slotA/attempt0').int(2) === 0,
    )!;
    const result = createSelector([observed]).select(rules, pool, context(seed));
    expect(sawDeadEnd).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.exams[0].questions).toHaveLength(2);
    expect(result.exams[0].questions[0].id).toBe('y');
  });
  it('precheck는 정적 부족·빠듯함과 시험 실행 실패를 알리며 ctx 난수 상태를 쓰지 않는다', () => {
    const rules = makeRuleSet({ examCount: 4, constraints: [spec('no-overlap-across-exams')] });
    const short = selector.precheck(rules, makePool(3), context());
    expect(short.find((d) => d.code === 'SLOT_SHORTAGE')?.message).toContain(
      '필요 4개, 가능 3개, 1개 모자라',
    );
    expect(selector.precheck(rules, makePool(4), context()).some((d) => d.code === 'SLOT_TIGHT')).toBe(true);
    const constrained = makeRuleSet({
      slots: [{ id: 'a', label: '희소', count: 2, filter: { kind: 'all' } }],
      constraints: [spec('exclude-recent', { lastNExams: 1 })],
    });
    const ctx = context('preserve');
    ctx.history = [makeHistoryEntry({ questionIds: ['q0', 'q1'] })];
    const frozen = deepFreeze({
      rules: constrained,
      pool: [...makePool(3), makeQuestion({ objectiveCode: undefined })],
      history: ctx.history,
    });
    const before = structuredClone(frozen);
    const first = selector.precheck(frozen.rules, frozen.pool, { ...ctx, history: frozen.history });
    expect(first.some((d) => d.code === 'SLOT_SHORTAGE')).toBe(true);
    expect(first.filter((d) => d.code === 'NO_OBJECTIVE_EXCLUDED')).toHaveLength(1);
    expect(ctx.rng.next()).toBe(createRng('preserve').next());
    expect(first).toEqual(
      selector.precheck(frozen.rules, frozen.pool, {
        ...ctx,
        rng: createRng('different'),
        history: frozen.history,
      }),
    );
    selector.select(frozen.rules, frozen.pool, { ...ctx, history: frozen.history });
    expect(frozen).toEqual(before);
  });
  it('슬롯 범위 상태를 매번 갱신한다', () => {
    const rules = makeRuleSet({
      slots: ['a', 'b'].map((id) => ({ id, label: id, count: 2, filter: { kind: 'all' as const } })),
      constraints: [spec('distinct-by-segment', { depth: 1, scope: 'slot' })],
    });
    const result = selector.select(rules, makePool(20), context());
    for (const slot of rules.slots) {
      const questions = result.exams[0].questions.filter(
        (question) => result.exams[0].slotOfQuestion[question.id] === slot.id,
      );
      expect(questions).toHaveLength(2);
      expect(new Set(questions.map((question) => question.objectiveCode?.split('-')[0])).size).toBe(2);
    }
  });
  it('800개 후보·6개 슬롯·4회차를 1초 이내에 선택한다', () => {
    const rules: RuleSet = makeRuleSet({
      examCount: 4,
      slots: Array.from({ length: 6 }, (_, index) => ({
        id: `s${index}`,
        label: `가짜 ${index}`,
        count: index === 0 ? 2 : 1,
        filter: { kind: 'objectivePrefix' as const, prefixes: [`과목 ${index + 1}`] },
      })),
      constraints: [
        spec('no-overlap-across-exams'),
        spec('no-duplicate-content'),
        spec('distinct-by-segment', { depth: 2 }),
      ],
    });
    const pool: Question[] = makePool(800);
    const start = performance.now();
    const result = selector.select(rules, pool, context());
    const elapsed = performance.now() - start;
    expect(result.diagnostics).toEqual([]);
    expect(result.exams.map((exam) => exam.questions.length)).toEqual([7, 7, 7, 7]);
    expect(elapsed).toBeLessThan(1000);
    console.info(`가짜 후보 800개 선택: ${Math.round(elapsed)}ms (기준 1000ms)`);
  });
});

it('불가능한 800개 후보도 전체 슬롯의 부분 결과를 결정적으로 반환한다', () => {
  const rules = makeRuleSet({
    examCount: 4,
    slots: [1, 2, 3, 4].map((unit) => ({
      id: `law${unit}`,
      label: `법규 ${unit}`,
      count: 5,
      filter: { kind: 'objectivePrefix' as const, prefixes: [`법규 ${unit}`] },
    })),
    constraints: [
      spec('distinct-by-segment', { depth: 2, scope: 'slot', mode: 'strict' }),
      spec('no-overlap-across-exams'),
      spec('no-duplicate-content'),
    ],
  });
  const pool = makePool(800).map((q, i) => ({ ...q, objectiveCode: `법규 ${1 + (i % 4)}-1-${i}` }));
  const start = performance.now();
  const result = selector.select(rules, pool, context('불가능'));
  const selectMs = performance.now() - start;
  expect(selectMs).toBeLessThan(1000);
  const checkStart = performance.now();
  const diagnostics = selector.precheck(rules, pool, context());
  const precheckMs = performance.now() - checkStart;
  expect(precheckMs).toBeLessThan(300);
  console.info(
    `불가능한 800개 후보: select ${Math.round(selectMs)}ms / precheck ${Math.round(precheckMs)}ms (CI 포함 기준 1000ms / 300ms)`,
  );
  expect(result).toEqual(selector.select(rules, pool, context('불가능')));
  expect(new Set(ids(result)).size).toBe(16);
  for (const exam of result.exams) {
    expect(exam.questions).toHaveLength(4);
    expect(exam.blanks).toEqual(rules.slots.map((slot) => ({ slotId: slot.id, count: 4 })));
    for (const slot of rules.slots)
      expect(exam.questions.filter((q) => exam.slotOfQuestion[q.id] === slot.id)).toHaveLength(1);
  }
  expect(result.diagnostics.filter((d) => d.code === 'SLOT_BLANK')).toHaveLength(16);
  expect(diagnostics.some((d) => d.code === 'SLOT_SHORTAGE')).toBe(true);
  expect([...result.diagnostics, ...diagnostics].some((d) => d.severity === 'error')).toBe(false);
});

it('prefer는 두 종류 중단원으로 5문제를 채우고 strict는 3자리를 비운다', () => {
  const pool = makePool(10).map((q, i) => ({ ...q, objectiveCode: `법규 1-${(i % 2) + 1}-${i}` }));
  for (const mode of ['strict', 'prefer']) {
    const rules = makeRuleSet({
      slots: [{ id: 's', label: '대단원', count: 5, filter: { kind: 'all' } }],
      constraints: [spec('distinct-by-segment', { depth: 2, scope: 'slot', mode })],
    });
    const result = selector.select(rules, pool, context());
    expect(result.exams[0].questions).toHaveLength(mode === 'strict' ? 2 : 5);
    expect(result.exams[0].blanks).toEqual(mode === 'strict' ? [{ slotId: 's', count: 3 }] : []);
    if (mode === 'prefer')
      expect(result.diagnostics.filter((d) => d.code === 'SEGMENT_REUSED')).toHaveLength(3);
  }
});

it('선지가 다른 동일 지문도 run 전체에서 한 번만 선택한다', () => {
  const original = makeQuestion({ id: 'first' });
  const variant = { ...original, id: 'variant', choices: [{ id: 'other', content: [para('변형 선지')] }] };
  const rules = makeRuleSet({ examCount: 4, constraints: [spec('no-duplicate-content')] });
  const result = selector.select(rules, [original, variant], context());
  expect(ids(result)).toHaveLength(1);
  expect(result.exams.flatMap((e) => e.blanks)).toHaveLength(3);
});

it('필터 호출 상한은 회차마다 적용하고 부분 결과와 경고를 보존한다', () => {
  let calls = 0;
  const observed: Constraint = {
    kind: 'constraint',
    id: 'count',
    label: '호출 집계',
    filterCandidates: (_spec, candidates) => {
      calls++;
      return candidates;
    },
  };
  const local = createSelector([observed]);
  const rules = makeRuleSet({
    examCount: 2,
    slots: [{ id: 's', label: '전체', count: 2, filter: { kind: 'all' } }],
    constraints: Array.from({ length: SELECTION_FILTER_CALL_LIMIT + 1 }, () => spec('count')),
  });
  // 작은 후보 풀에서도 반복 탐색의 작업량을 상수로 제한하는지 확인한다.
  const pool = makePool(2);
  const result = local.select(rules, pool, context());
  expect(calls).toBe(2 * SELECTION_FILTER_CALL_LIMIT);
  expect(result.diagnostics.some((d) => d.code === 'SELECTION_SEARCH_LIMIT')).toBe(true);
  calls = 0;
  local.precheck(rules, pool, context());
  expect(calls).toBe(2 * PRECHECK_FILTER_CALL_LIMIT);
});

it('정적 상한보다 적게 채워지는 탐색은 개선 없는 재시도를 중단한다', () => {
  let calls = 0;
  const local = createSelector([
    {
      kind: 'constraint',
      id: 'one',
      label: '한 문제 제한',
      filterCandidates: (_spec, candidates, state) => {
        calls++;
        return state.slot.chosen.length ? [] : candidates;
      },
    },
  ]);
  const rules = makeRuleSet({
    slots: [{ id: 's', label: '전체', count: 2, filter: { kind: 'all' } }],
    constraints: [spec('one')],
  });
  const result = local.select(rules, makePool(100), context());
  expect(result.exams[0].questions).toHaveLength(1);
  expect(result.exams[0].blanks).toEqual([{ slotId: 's', count: 1 }]);
  expect(calls).toBeLessThanOrEqual(4 * 11 * 2);
  expect(result.diagnostics.some((d) => d.code === 'SELECTION_SEARCH_LIMIT')).toBe(true);
});
