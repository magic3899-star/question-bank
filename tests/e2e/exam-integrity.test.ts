import { beforeEach, describe, expect, it } from 'vitest';
import type { Block, ExamSnapshot } from '../../src/contracts/index';
import { canonicalJson, questionContentKey, referencesChoiceLabels, sha256Hex } from '../../src/modules/content-model/index';
import { standardConstraints } from '../../src/modules/constraints/index';
import { createSelector } from '../../src/modules/selector/index';
import { shufflers } from '../../src/modules/shuffler/index';
import { generateExams } from '../../src/modules/generation/index';
import type { GenerationInput } from '../../src/modules/generation/index';
import { deepFreeze } from '../fixtures/builders';
import { makeExamBank, makeExamRules } from '../fixtures/examBank';
import { assertSnapshotMatchesSource } from './assertSnapshotMatchesSource';

const bank = deepFreeze(makeExamBank());
const sources = new Map(bank.questions.map((question) => [question.id, question]));
const deps = { selector: createSelector(standardConstraints), shufflers };

function input(seed: string, subject: 'law' | 'anatomy' = 'law'): GenerationInput {
  return { rules: makeExamRules(subject), candidates: bank.questions, assets: bank.assets, history: [], seed,
    shuffle: { shuffleQuestionOrder: true, shuffleChoices: true, balanceAnswerPositions: true },
    titleTemplate: '가짜 모의고사 {회차}회', createdAt: '2026-01-01T00:00:00Z', examIdPrefix: `fake-${subject}` };
}

function assertRun(snapshots: ExamSnapshot[]): void {
  const ids: string[] = [];
  const keys: string[] = [];
  for (const snapshot of snapshots) {
    assertSnapshotMatchesSource(snapshot, sources);
    for (const item of snapshot.items) if (!item.blank) {
      ids.push(item.sourceQuestionId);
      keys.push(questionContentKey(sources.get(item.sourceQuestionId)!));
      const source = sources.get(item.sourceQuestionId)!;
      if (referencesChoiceLabels([...source.explanation, ...source.stem, ...(source.passage ?? [])])) {
        expect(item.choices.map((choice) => choice.sourceChoiceId)).toEqual(source.choices.map((choice) => choice.id));
      }
    }
  }
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(keys).size).toBe(keys.length);
}

// 시드 100개를 한 테스트에서 동기로 돌리면 vitest 워커가 1분 넘게 막혀 RPC 시간 초과가 나므로 묶음으로 나눈다.
const SEED_TOTAL = 100;
const SEED_CHUNK = 10;

describe('선택 → 섞기 → 확정본 종단 무결성', () => {
  // 무거운 동기 테스트 사이에 이벤트 루프를 돌려 vitest RPC 응답(60초 제한)이 처리되게 한다.
  beforeEach(() => new Promise<void>((resolve) => { setImmediate(resolve); }));
  const seen = new Set<string>();
  const chunkStarts = Array.from({ length: SEED_TOTAL / SEED_CHUNK }, (_, index) => index * SEED_CHUNK);
  it.each(chunkStarts)('2과목 300문제 은행, 시드 %i부터 10개: 원본·정답·고정 위치·재현성을 검증한다', (start) => {
    expect(bank.questions).toHaveLength(300);
    for (let seed = start; seed < start + SEED_CHUNK; seed++) {
      for (const subject of ['law', 'anatomy'] as const) {
        const data = deepFreeze(input(`integrity/${seed}`, subject));
        const before = JSON.stringify(data);
        const result = generateExams(data, deps);
        expect(result.ok).toBe(true);
        expect(result.snapshots).toHaveLength(4);
        expect(result.snapshots.every((snapshot) => snapshot.items.length === 15 && snapshot.items.every((item) => !item.blank))).toBe(true);
        assertRun(result.snapshots);
        expect(JSON.stringify(generateExams(data, deps).snapshots)).toBe(JSON.stringify(result.snapshots));
        expect(JSON.stringify(data)).toBe(before);
        result.snapshots.flatMap((s) => s.items).forEach((item) => seen.add(item.sourceQuestionId));
      }
    }
  }, 60_000);

  it('시드 100개 전체에서 lock-all·복수 정답·고정 선지 문제가 실제로 검증 대상에 포함되었다', () => {
    expect(seen.size).toBeGreaterThan(0);
    expect([...seen].some((id) => sources.get(id)!.shufflePolicy === 'lock-all')).toBe(true);
    expect([...seen].some((id) => sources.get(id)!.answerChoiceIds.length > 1)).toBe(true);
    expect([...seen].some((id) => sources.get(id)!.choices.some((c) => c.fixedPosition))).toBe(true);
    for (const field of ['explanation', 'stem', 'passage'] as const) {
      expect([...seen].some((id) => referencesChoiceLabels(sources.get(id)![field] ?? []))).toBe(true);
    }
  });

  it('참조 문제의 잠금을 일부러 풀면 실제 섞기 결과가 원본 순서 검사에서 실패한다', () => {
    const candidates = structuredClone(bank.questions.filter((question) => question.subject === 'law'
      && referencesChoiceLabels([...question.explanation, ...question.stem, ...(question.passage ?? [])])));
    candidates.forEach((question) => { question.shufflePolicy = 'free'; });
    const data = input('reference-unlocked');
    data.candidates = candidates;
    data.rules = { ...data.rules, examCount: 1, constraints: [],
      slots: [{ id: 'references', label: '가짜 참조 문항', count: candidates.length, filter: { kind: 'all' } }] };
    const result = generateExams(data, deps);
    expect(result.ok).toBe(true);
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].items.some((item) => item.choices.map((c) => c.sourceChoiceId).join(',')
      !== sources.get(item.sourceQuestionId)!.choices.map((c) => c.id).join(','))).toBe(true);
    const unlockedSources = new Map(candidates.map((question) => [question.id, question]));
    expect(() => assertSnapshotMatchesSource(result.snapshots[0], unlockedSources))
      .toThrow('해설·본문의 선지 번호 참조와 선지 순서가 어긋납니다.');
  });

  it('서로 다른 시드는 서로 다른 전체 확정본을 생성한다', () => {
    const first = generateExams(input('different/1'), deps);
    const second = generateExams(input('different/2'), deps);
    expect(first.snapshots.map((s) => s.contentHash)).not.toEqual(second.snapshots.map((s) => s.contentHash));
    expect(first.historyEntries.map((h) => h.questionIds)).not.toEqual(second.historyEntries.map((h) => h.questionIds));
  });

  it('후보 부족 규칙도 네 회차와 빈 번호를 만들고 모든 원본 대조를 통과한다', () => {
    const data = input('shortage');
    data.candidates = bank.questions.filter((q) => q.subject === 'law').slice(0, 12);
    const before = structuredClone(data);
    const result = generateExams(deepFreeze(data), deps);
    expect(result.ok).toBe(true);
    expect(result.snapshots).toHaveLength(4);
    expect(result.snapshots.every((s) => s.items.length === 15)).toBe(true);
    expect(result.snapshots.some((s) => s.items.some((item) => item.blank))).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'SLOT_SHORTAGE')).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'SLOT_BLANK')).toBe(true);
    assertRun(result.snapshots);
    result.historyEntries.forEach((history, i) => {
      expect(history.questionIds).toEqual(result.snapshots[i].items.filter((item) => !item.blank).map((item) => item.sourceQuestionId));
    });
    expect(data).toStrictEqual(before);
  });

  function firstParagraph(blocks: Block[]): Extract<Block, { type: 'paragraph' }> {
    const paragraph = blocks.find((block) => block.type === 'paragraph');
    if (!paragraph || paragraph.type !== 'paragraph') throw new Error('가짜 문단을 찾을 수 없습니다.');
    return paragraph;
  }

  const corruptions: [string, (snapshot: ExamSnapshot) => void][] = [
    ['지문 한 글자 변경', (s) => { firstParagraph(s.items[0].passage!).runs[0].text += 'X'; }],
    ['정답 라벨 이동', (s) => {
      const item = s.items[0];
      item.answerLabels = [item.choices.find((c) => !item.answerLabels.includes(c.label))!.label];
    }],
    ['선지 내용 교체', (s) => {
      const [a, b] = s.items[0].choices;
      [a.content, b.content] = [b.content, a.content];
    }],
    ['정규화로 숨을 수 있는 공백 변경', (s) => { firstParagraph(s.items[0].stem).runs[0].text += ' '; }],
    ['밑줄 서식 제거', (s) => { firstParagraph(s.items[0].passage!).runs[0].underline = false; }],
  ];
  it.each(corruptions)('원본 대조 헬퍼가 고의 훼손을 잡는다: %s', (_, mutate) => {
    const original = generateExams(input('meta'), deps).snapshots[0];
    const copy = structuredClone(original);
    mutate(copy);
    expect(() => assertSnapshotMatchesSource(copy, sources)).toThrow();
    // 해시를 다시 만든 훼손본도 원본 대조에서 검출해야 한다.
    const metadata = Object.fromEntries(Object.entries(copy.assets).map(([key, asset]) => [key, { id: asset.id, mime: asset.mime, sha256: asset.sha256 }]));
    copy.contentHash = sha256Hex(canonicalJson({ items: copy.items, assets: metadata }));
    expect(() => assertSnapshotMatchesSource(copy, sources)).toThrow();
    assertSnapshotMatchesSource(original, sources);
  });
});
