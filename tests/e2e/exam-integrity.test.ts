import { describe, expect, it } from 'vitest';
import type { Block, ExamSnapshot } from '../../src/contracts/index';
import { canonicalJson, questionContentKey, sha256Hex } from '../../src/modules/content-model/index';
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
    }
  }
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(keys).size).toBe(keys.length);
}

describe('선택 → 섞기 → 확정본 종단 무결성', () => {
  it('2과목 300문제 은행을 100개 시드로 생성하고 원본·정답·고정 위치·재현성을 검증한다', () => {
    const seen = new Set<string>();
    expect(bank.questions).toHaveLength(300);
    for (let seed = 0; seed < 100; seed++) {
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
    expect([...seen].some((id) => sources.get(id)!.shufflePolicy === 'lock-all')).toBe(true);
    expect([...seen].some((id) => sources.get(id)!.answerChoiceIds.length > 1)).toBe(true);
    expect([...seen].some((id) => sources.get(id)!.choices.some((c) => c.fixedPosition))).toBe(true);
  }, 90_000);

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
