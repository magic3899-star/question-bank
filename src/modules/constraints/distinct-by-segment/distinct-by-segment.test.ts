import { describe, expect, it } from 'vitest';
import type { Constraint, ConstraintSpec, SelectionContext } from '../../../contracts/index';
import { createRng } from '../../rng/index';
import {
  deepFreeze,
  makeChoice,
  makeHistoryEntry,
  makeQuestion,
  makeSegmentPool,
  para,
} from '../../../../tests/fixtures/builders';
import { distinctBySegment as plugin } from './index';

describe('distinct-by-segment', () => {
  const a = makeQuestion({ id: 'a', objectiveCode: '과목 1-2-3' });
  const b = makeQuestion({ id: 'b', stem: [para('다른 가짜 문제')], objectiveCode: '과목 1-3-4' });
  const spec: ConstraintSpec = { kind: plugin.id, params: { depth: 2, mode: 'strict' } };
  const ctx: SelectionContext = { rng: createRng('constraint'), history: [] };
  const state: Parameters<NonNullable<Constraint['filterCandidates']>>[2] = {
    examIndex: 1,
    chosenSoFar: [],
    currentChosen: [],
    slot: { id: 'slot', chosen: [], pool: [a, b] },
    ctx,
  };
  state.currentChosen = [a];
  it('정상 후보 제외와 결과 검증을 제공한다', () => {
    expect(plugin.filterCandidates!(spec, [a, b], state)).toEqual([b]);
    expect(
      plugin.verify!(spec, [{ questions: [a, a], blanks: [], slotOfQuestion: {} }], ctx).some(
        (d) => d.code === 'SEGMENT_NOT_DISTINCT',
      ),
    ).toBe(true);
    expect(plugin.verify!(spec, [], ctx)).toEqual([]);
  });
  it('잘못된 매개변수는 후보를 유지하고 검증 오류를 반환한다', () => {
    const invalid = { ...spec, params: { depth: 0 } };
    const candidates = [a, b];
    expect(plugin.filterCandidates!(invalid, candidates, state)).toBe(candidates);
    expect(plugin.verify!(invalid, [], ctx)[0]).toMatchObject({
      severity: 'error',
      code: 'CONSTRAINT_PARAMS_INVALID',
    });
  });
  it.each([null, [], '잘못된 값'])('매개변수 객체가 아니면 실패 진단을 반환한다: %j', (params) => {
    const invalid = { ...spec, params } as unknown as ConstraintSpec;
    const candidates = [a, b];
    expect(plugin.filterCandidates!(invalid, candidates, state)).toBe(candidates);
    expect(plugin.verify!(invalid, [], ctx)[0].code).toBe('CONSTRAINT_PARAMS_INVALID');
  });
  it('빈 후보와 얼린 입력을 변형하지 않는다', () => {
    const input = deepFreeze(
      structuredClone({
        spec,
        candidates: [a, b],
        history: ctx.history,
        currentChosen: state.currentChosen,
        chosenSoFar: state.chosenSoFar,
        slot: state.slot,
      }),
    );
    const before = structuredClone(input);
    const local = {
      ...state,
      ctx: { ...ctx, history: input.history },
      currentChosen: input.currentChosen,
      chosenSoFar: input.chosenSoFar,
      slot: input.slot,
    };
    plugin.filterCandidates!(input.spec, input.candidates, local);
    plugin.verify!(input.spec, [{ questions: input.candidates, blanks: [], slotOfQuestion: {} }], local.ctx);
    expect(plugin.filterCandidates!(input.spec, [], local)).toEqual([]);
    expect(input).toEqual(before);
  });

  it('슬롯 범위는 해당 슬롯에서만 거르고 잘못된 목표 코드는 통과시킨다', () => {
    const slotSpec = { ...spec, params: { depth: 2, scope: 'slot', mode: 'strict' } };
    expect(
      plugin.filterCandidates!(slotSpec, [a], { ...state, slot: { id: 'next', chosen: [], pool: [a, b] } }),
    ).toEqual([a]);
    expect(
      plugin.filterCandidates!(slotSpec, [a], { ...state, slot: { id: 'next', chosen: [a], pool: [a, b] } }),
    ).toEqual([]);
    const missing = makeQuestion({ objectiveCode: undefined });
    const bad = makeQuestion({ objectiveCode: '해부 ?' });
    expect(plugin.filterCandidates!(spec, [missing, bad], state)).toEqual([missing, bad]);
    expect(
      plugin.verify!(spec, [{ questions: [missing, bad], blanks: [], slotOfQuestion: {} }], ctx),
    ).toEqual([]);
    expect(
      plugin.verify!(slotSpec, [{ questions: [a, a], blanks: [], slotOfQuestion: {} }], ctx)[0].code,
    ).toBe('SEGMENT_NOT_DISTINCT');
    for (const params of [{ depth: 1.5 }, { depth: '2' }, { depth: 2, scope: 'all' }])
      expect(plugin.verify!({ ...spec, params }, [], ctx)[0].code).toBe('CONSTRAINT_PARAMS_INVALID');
  });
});

it('prefer는 새 구간이 있으면 우선하고 소진되면 후보를 그대로 반환한다', () => {
  const a = makeQuestion({ id: 'a', objectiveCode: '법규 1-1-1' });
  const b = makeQuestion({ id: 'b', objectiveCode: '법규 1-2-1' });
  const ctx = { rng: createRng('prefer'), history: [] };
  const state = {
    examIndex: 0,
    chosenSoFar: [],
    currentChosen: [a],
    slot: { id: 's', chosen: [a], pool: [a, b] },
    ctx,
  };
  const spec = { kind: plugin.id, params: { depth: 2, scope: 'slot', mode: 'prefer' } };
  expect(plugin.filterCandidates!(spec, [a, b], state)).toEqual([b]);
  const exhausted = [a];
  expect(plugin.filterCandidates!(spec, exhausted, state)).toBe(exhausted);
  expect(
    plugin.filterCandidates!({ ...spec, params: { ...spec.params, mode: 'strict' } }, exhausted, state),
  ).toEqual([]);
  expect(
    plugin.verify!(spec, [{ questions: [a, a], blanks: [], slotOfQuestion: { a: 's' } }], ctx)[0],
  ).toMatchObject({
    severity: 'info',
    code: 'SEGMENT_REUSED',
    message: expect.stringContaining('1번 재사용'),
  });
  expect(plugin.verify!({ ...spec, params: { ...spec.params, mode: 'bad' } }, [], ctx)[0].code).toBe(
    'CONSTRAINT_PARAMS_INVALID',
  );
});
it('사후 검증도 slotOfQuestion으로 슬롯 범위를 지킨다', () => {
  const a = makeQuestion({ id: 'a' });
  const b = makeQuestion({ id: 'b' });
  const ctx = { rng: createRng('slot'), history: [] };
  const exam = { questions: [a, b], blanks: [], slotOfQuestion: { a: 'one', b: 'two' } };
  expect(plugin.verify!({ kind: plugin.id, params: { depth: 1, scope: 'slot' } }, [exam], ctx)).toEqual([]);
});

describe('strict-unless-single', () => {
  const ctx = { rng: createRng('단일 구간 면제'), history: [] };
  it.each([undefined, 'strict-unless-single'])(
    '기본값과 명시 모드가 정적 풀의 구간 종류로만 면제를 판단한다: %s',
    (mode) => {
      const pool = makeSegmentPool(2, 3);
      const candidates = pool.slice(1, 3);
      const state = {
        examIndex: 1,
        chosenSoFar: [],
        currentChosen: [pool[0]],
        slot: { id: 's', chosen: [pool[0]], pool },
        ctx,
      };
      const spec = { kind: plugin.id, params: { depth: 2, scope: 'slot', mode } };
      expect(plugin.filterCandidates!(spec, candidates, state)).toEqual([]);
      expect(
        plugin.filterCandidates!(spec, candidates, {
          ...state,
          slot: { ...state.slot, pool: pool.slice(0, 3) },
        }),
      ).toBe(candidates);
      expect(
        plugin.filterCandidates!(spec, candidates, { ...state, slot: { ...state.slot, pool: [] } }),
      ).toBe(candidates);
      expect(plugin.filterCandidates!(spec, [], state)).toEqual([]);
    },
  );
  it('단일 구간에서도 strict는 면제하지 않고 exam 범위는 currentChosen을 기준으로 엄격히 거른다', () => {
    const pool = makeSegmentPool(1, 3);
    const candidates = pool.slice(1);
    const state = {
      examIndex: 0,
      chosenSoFar: [],
      currentChosen: [pool[0]],
      slot: { id: 'next', chosen: [], pool },
      ctx,
    };
    const spec = { kind: plugin.id, params: { depth: 2, scope: 'slot', mode: 'strict-unless-single' } };
    expect(plugin.filterCandidates!(spec, candidates, state)).toBe(candidates);
    expect(
      plugin.filterCandidates!({ ...spec, params: { ...spec.params, mode: 'strict' } }, candidates, {
        ...state,
        slot: { ...state.slot, chosen: [pool[0]] },
      }),
    ).toEqual([]);
    for (const scope of [undefined, 'exam']) {
      expect(plugin.filterCandidates!({ ...spec, params: { depth: 2, scope } }, candidates, state)).toEqual(
        [],
      );
      expect(
        plugin.filterCandidates!(
          { ...spec, params: { depth: 2, scope, mode: 'strict-unless-single' } },
          candidates,
          state,
        ),
      ).toEqual([]);
    }
  });
  it.each(['slot', 'exam'])(
    '사후 검사는 풀을 재판정할 수 없어 %s 범위의 반복을 정보로만 보고한다',
    (scope) => {
      const pool = makeSegmentPool(1, 3);
      const exam = {
        questions: pool,
        blanks: [],
        slotOfQuestion: Object.fromEntries(pool.map((q) => [q.id, 's'])),
      };
      for (const mode of [undefined, 'strict-unless-single']) {
        const diagnostics = plugin.verify!(
          { kind: plugin.id, params: { depth: 2, scope, mode } },
          [exam],
          ctx,
        );
        expect(diagnostics).toHaveLength(2);
        for (const diagnostic of diagnostics)
          expect(diagnostic).toMatchObject({
            severity: 'info',
            code: 'SEGMENT_REUSED',
            message: expect.stringContaining('면제 가능 여부는 선택 단계에서 판단했습니다'),
          });
      }
    },
  );
  it('정적 풀을 포함한 얼린 입력을 변경하지 않고 파싱되는 구간만 센다', () => {
    const pool = makeSegmentPool(1, 3);
    pool.push(makeQuestion({ id: 'bad', objectiveCode: '법규 ?' }));
    const candidates = deepFreeze(pool.slice(1));
    const state = deepFreeze({
      examIndex: 0,
      chosenSoFar: [],
      currentChosen: [pool[0]],
      slot: { id: 's', chosen: [pool[0]], pool },
      ctx,
    });
    const before = structuredClone(state.slot);
    expect(
      plugin.filterCandidates!({ kind: plugin.id, params: { depth: 2, scope: 'slot' } }, candidates, state),
    ).toBe(candidates);
    expect(state.slot).toEqual(before);
  });
});
