import { describe, expect, it } from 'vitest';
import type { Constraint, ConstraintSpec, SelectionContext } from '../../../contracts/index';
import { createRng } from '../../rng/index';
import { deepFreeze, makeChoice, makeHistoryEntry, makeQuestion, para } from '../../../../tests/fixtures/builders';
import { noOverlapAcrossExams as plugin } from './index';

describe('no-overlap-across-exams', () => {
  const a = makeQuestion({ id: 'a', objectiveCode: '과목 1-2-3' });
  const b = makeQuestion({ id: 'b', stem: [para('다른 가짜 문제')], objectiveCode: '과목 1-3-4' });
  const spec: ConstraintSpec = { kind: plugin.id, params: { scope: 'all' } };
  const ctx: SelectionContext = { rng: createRng('constraint'), history: [] };
  const state: Parameters<NonNullable<Constraint['filterCandidates']>>[2] = {
    examIndex: 1, chosenSoFar: [], currentChosen: [], slot: { id: 'slot', chosen: [], pool: [a, b] }, ctx,
  };
  state.chosenSoFar = [{ questions: [a], blanks: [], slotOfQuestion: {} }];
  it('정상 후보 제외와 결과 검증을 제공한다', () => {
    expect(plugin.filterCandidates!(spec, [a, b], state)).toEqual([b]);
    expect(plugin.verify!(spec, [{ questions: [a], blanks: [], slotOfQuestion: {} }, { questions: [a], blanks: [], slotOfQuestion: {} }], ctx).some((d) => d.code === 'OVERLAP_ACROSS_EXAMS')).toBe(true);
    expect(plugin.verify!(spec, [], ctx)).toEqual([]);
  });
  it('잘못된 매개변수는 후보를 유지하고 검증 오류를 반환한다', () => {
    const invalid = { ...spec, params: { scope: 'exam' } };
    const candidates = [a, b];
    expect(plugin.filterCandidates!(invalid, candidates, state)).toBe(candidates);
    expect(plugin.verify!(invalid, [], ctx)[0]).toMatchObject({ severity: 'error', code: 'CONSTRAINT_PARAMS_INVALID' });
  });
  it.each([null, [], '잘못된 값'])('매개변수 객체가 아니면 실패 진단을 반환한다: %j', (params) => {
    const invalid = { ...spec, params } as unknown as ConstraintSpec;
    const candidates = [a, b];
    expect(plugin.filterCandidates!(invalid, candidates, state)).toBe(candidates);
    expect(plugin.verify!(invalid, [], ctx)[0].code).toBe('CONSTRAINT_PARAMS_INVALID');
  });
  it('빈 후보와 얼린 입력을 변형하지 않는다', () => {
    const input = deepFreeze(structuredClone({ spec, candidates: [a, b], history: ctx.history, currentChosen: state.currentChosen, chosenSoFar: state.chosenSoFar, slot: state.slot }));
    const before = structuredClone(input);
    const local = { ...state, ctx: { ...ctx, history: input.history }, currentChosen: input.currentChosen, chosenSoFar: input.chosenSoFar, slot: input.slot };
    plugin.filterCandidates!(input.spec, input.candidates, local);
    plugin.verify!(input.spec, [{ questions: input.candidates, blanks: [], slotOfQuestion: {} }], local.ctx);
    expect(plugin.filterCandidates!(input.spec, [], local)).toEqual([]);
    expect(input).toEqual(before);
  });

  it('같은 시험 내부 중복은 회차 간 중복으로 판단하지 않는다', () => {
    expect(plugin.verify!(spec, [{ questions: [a, a], blanks: [], slotOfQuestion: {} }], ctx)).toEqual([]);
    expect(plugin.filterCandidates!(spec, [a], { ...state, chosenSoFar: [] })).toEqual([a]);
  });

});
