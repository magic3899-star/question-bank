import { describe, expect, it } from 'vitest';
import type { ExamSnapshot, Question, RuleSet } from '../../contracts/index';
import { questionContentKey } from '../content-model/index';
import { standardConstraints } from '../constraints/index';
import { createSelector } from '../selector/index';
import { shufflers } from '../shuffler/index';
import { verifySnapshot } from '../exam-snapshot/index';
import { segmentKey } from '../objective-code/index';
import { deepFreeze } from '../../../tests/fixtures/builders';
import { makeExamBank, makeExamRules } from '../../../tests/fixtures/examBank';
import { assertSnapshotMatchesSource } from '../../../tests/e2e/assertSnapshotMatchesSource';
import { generateExams, regenerateExam, replaceQuestion } from './index';

const bank = deepFreeze(makeExamBank());
const sources = new Map(bank.questions.map((question) => [question.id, question]));
const shuffle = { shuffleQuestionOrder: true, shuffleChoices: true, balanceAnswerPositions: true };
const generationDeps = { selector: createSelector(standardConstraints), shufflers };
const replaceDeps = { constraints: standardConstraints, shufflers };

function run(seed: string, rules: RuleSet = makeExamRules('law')): ExamSnapshot[] {
  const result = generateExams(
    {
      rules,
      candidates: bank.questions,
      assets: bank.assets,
      history: [],
      seed,
      shuffle,
      titleTemplate: '가짜 모의고사 {회차}회',
      createdAt: '2026-01-01T00:00:00.000Z',
      examIdPrefix: 'fake',
    },
    generationDeps,
  );
  expect(result.ok).toBe(true);
  return result.snapshots;
}

function assertRunIntegrity(snapshots: readonly ExamSnapshot[]): void {
  const ids = snapshots.flatMap((s) => s.items.filter((i) => !i.blank).map((i) => i.sourceQuestionId));
  const keys = ids.map((id) => questionContentKey(sources.get(id)!));
  expect(new Set(ids).size, '회차 간 같은 문제가 있습니다.').toBe(ids.length);
  expect(new Set(keys).size, '회차 간 같은 지문이 있습니다.').toBe(keys.length);
  for (const snapshot of snapshots) {
    expect(verifySnapshot(snapshot)).toEqual([]);
    assertSnapshotMatchesSource(snapshot, sources);
  }
}

describe('문제 1개 바꾸기', () => {
  it('지정한 번호만 바뀌고 나머지 문항·선지 순서는 그대로다', () => {
    for (const seed of ['r1', 'r2', 'r3', 'r4', 'r5']) {
      const snapshots = run(seed);
      const target = snapshots[1]!.items.find((item) => !item.blank)!;
      const result = replaceQuestion(
        {
          rules: makeExamRules('law'),
          candidates: bank.questions,
          assets: bank.assets,
          run: snapshots,
          examIndex: 1,
          number: target.number,
          seed,
          shuffle,
        },
        replaceDeps,
      );
      expect(result.snapshot, JSON.stringify(result.diagnostics)).toBeDefined();
      const next = result.snapshot!;
      const changed = next.items.find((item) => item.number === target.number)!;
      expect(changed.sourceQuestionId).not.toBe(target.sourceQuestionId);
      for (const before of snapshots[1]!.items.filter((item) => item.number !== target.number)) {
        const after = next.items.find((item) => item.number === before.number)!;
        expect(after.sourceQuestionId).toBe(before.sourceQuestionId);
        expect(after.choices.map((c) => c.sourceChoiceId)).toEqual(
          before.choices.map((c) => c.sourceChoiceId),
        );
      }
      const updated = snapshots.map((snapshot, index) => (index === 1 ? next : snapshot));
      assertRunIntegrity(updated);
    }
  });

  it('교체 후에도 같은 회차·슬롯의 중단원 엄격 규칙이 지켜진다', () => {
    const rules = makeExamRules('law');
    const strict = rules.constraints.some(
      (spec) => spec.kind === 'distinct-by-segment' && spec.params.scope === 'slot',
    );
    const snapshots = run('strict-check', rules);
    for (const item of snapshots[0]!.items.filter((i) => !i.blank)) {
      const result = replaceQuestion(
        {
          rules,
          candidates: bank.questions,
          assets: bank.assets,
          run: snapshots,
          examIndex: 0,
          number: item.number,
          seed: 'strict-check',
          shuffle,
        },
        replaceDeps,
      );
      if (!result.snapshot || !strict) continue;
      const slotKeys = new Map<string, string[]>();
      for (const after of result.snapshot.items.filter((i) => !i.blank)) {
        const question = sources.get(after.sourceQuestionId) as Question;
        const slot = rules.slots.find(
          (s) =>
            s.filter.kind === 'objectivePrefix' &&
            s.filter.prefixes.some((p) => (question.objectiveCode ?? '').startsWith(p)),
        );
        if (!slot) continue;
        const list = slotKeys.get(slot.id) ?? [];
        list.push(segmentKey(question.objectiveCode!, 2)!);
        slotKeys.set(slot.id, list);
      }
      for (const keys of slotKeys.values()) {
        const pool = new Set(keys);
        if (pool.size > 1) expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it('비워 둔 번호·없는 번호·없는 회차는 바꾸지 않고 진단을 돌려준다', () => {
    const snapshots = run('errors');
    const base = {
      rules: makeExamRules('law'),
      candidates: bank.questions,
      assets: bank.assets,
      run: snapshots,
      seed: 'errors',
      shuffle,
    };
    expect(replaceQuestion({ ...base, examIndex: 9, number: 1 }, replaceDeps).diagnostics[0]!.code).toBe(
      'EXAM_NOT_FOUND',
    );
    expect(replaceQuestion({ ...base, examIndex: 0, number: 999 }, replaceDeps).diagnostics[0]!.code).toBe(
      'ITEM_NOT_FOUND',
    );
  });

  it('후보가 없으면 NO_REPLACEMENT 로 이유를 알린다', () => {
    const snapshots = run('exhaust');
    const usedIds = new Set(snapshots.flatMap((s) => s.items.map((i) => i.sourceQuestionId)));
    const onlyUsed = bank.questions.filter((question) => usedIds.has(question.id));
    const target = snapshots[0]!.items.find((item) => !item.blank)!;
    const result = replaceQuestion(
      {
        rules: makeExamRules('law'),
        candidates: onlyUsed,
        assets: bank.assets,
        run: snapshots,
        examIndex: 0,
        number: target.number,
        seed: 'exhaust',
        shuffle,
      },
      replaceDeps,
    );
    expect(result.snapshot).toBeUndefined();
    expect(result.diagnostics[0]!.code).toBe('NO_REPLACEMENT');
  });

  it('같은 입력과 시드면 같은 결과다', () => {
    const snapshots = run('same');
    const target = snapshots[2]!.items.find((item) => !item.blank)!;
    const input = {
      rules: makeExamRules('law'),
      candidates: bank.questions,
      assets: bank.assets,
      run: snapshots,
      examIndex: 2,
      number: target.number,
      seed: 'same',
      shuffle,
    };
    expect(JSON.stringify(replaceQuestion(input, replaceDeps))).toBe(
      JSON.stringify(replaceQuestion(input, replaceDeps)),
    );
  });
});

describe('회차 다시 뽑기', () => {
  it('한 회차만 바뀌고 다른 회차와 겹치지 않으며 회차 ID·제목은 유지된다', () => {
    for (const seed of ['g1', 'g2', 'g3']) {
      const snapshots = run(seed);
      const result = regenerateExam(
        {
          rules: makeExamRules('law'),
          candidates: bank.questions,
          assets: bank.assets,
          run: snapshots,
          examIndex: 3,
          seed: `${seed}-again`,
          shuffle,
        },
        generationDeps,
      );
      expect(result.snapshot, JSON.stringify(result.diagnostics)).toBeDefined();
      expect(result.snapshot!.examId).toBe(snapshots[3]!.examId);
      expect(result.snapshot!.title).toBe(snapshots[3]!.title);
      expect(result.snapshot!.items[0]!.number).toBe(snapshots[3]!.items[0]!.number);
      const updated = snapshots.map((snapshot, index) => (index === 3 ? result.snapshot! : snapshot));
      assertRunIntegrity(updated);
    }
  });
});
