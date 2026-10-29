import { describe, expect, it } from 'vitest';
import type { AssetData, ExamSnapshot } from '../../contracts/index';
import { deepFreeze, makeQuestion, makeRuleSet, makeSelectedExam, para } from '../../../tests/fixtures/builders';
import { canonicalJson, sha256Hex } from '../content-model/index';
import { buildSnapshot, verifySnapshot } from './index';
import type { BuildSnapshotInput } from './index';

function input(): BuildSnapshotInput {
  return { exam: makeSelectedExam({ questions: [makeQuestion()], slotOfQuestion: { 'question-1': 'slot-1' } }),
    rules: makeRuleSet({ startNumber: 21 }), examIndex: 0, seed: '가짜 시드', title: '가짜 시험',
    examId: 'fake-exam', createdAt: '2026-01-01T00:00:00Z', assets: {} };
}

function asset(id: string): AssetData {
  return { id, mime: 'image/png', dataBase64: 'YWJj', sha256: sha256Hex('abc') };
}

describe('시험지 확정본', () => {
  it('현재 선지 위치로 라벨과 복수 정답을 만들고 입력과 내용 서식을 깊이 복사한다', () => {
    const data = input();
    const question = data.exam.questions[0];
    question.grade = 'A';
    question.answerChoiceIds = ['choice-1', 'choice-3'];
    question.choices.reverse();
    question.stem = [para('끝 공백  ', { underline: true })];
    const before = structuredClone(data);
    const { snapshot, diagnostics } = buildSnapshot(deepFreeze(data));
    expect(diagnostics).toEqual([]);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.items[0]).toMatchObject({ number: 21, sourceQuestionId: question.id,
      answerLabels: ['③', '⑤'], objectiveCode: question.objectiveCode, grade: 'A' });
    expect(snapshot.items[0].choices.map((choice) => choice.label)).toEqual([...'①②③④⑤']);
    expect(snapshot.items[0].stem).toStrictEqual(question.stem);
    expect(snapshot.items[0].stem).not.toBe(question.stem);
    expect(data).toStrictEqual(before);
    expect(verifySnapshot(snapshot)).toEqual([]);
  });

  it('선지 10개까지 지원하고 초과·없는 정답 ID는 오류로 알린다', () => {
    const data = input();
    data.exam.questions[0].choices = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, content: [para(`${i}`)] }));
    data.exam.questions[0].answerChoiceIds = ['c9'];
    expect(buildSnapshot(data).snapshot.items[0].answerLabels).toEqual(['⑩']);
    data.exam.questions[0].choices.push({ id: 'c10', content: [] });
    data.exam.questions[0].answerChoiceIds.push('missing');
    expect(buildSnapshot(data).diagnostics.map((d) => d.code)).toEqual(['LABEL_OVERFLOW', 'ANSWER_CHOICE_MISSING']);
  });

  it.each(['slot', 'end'] as const)('빈 번호를 %s 위치에 넣고 최종 순서로 번호를 붙인다', (blankPlacement) => {
    const data = input();
    data.blankPlacement = blankPlacement;
    data.rules.slots = ['empty', 'a', 'b', 'last'].map((id) => ({ id, label: id, count: 3, filter: { kind: 'all' } }));
    data.exam.questions = ['a1', 'a2', 'b1'].map((id) => makeQuestion({ id }));
    data.exam.slotOfQuestion = { a1: 'a', a2: 'a', b1: 'b' };
    data.exam.blanks = [{ slotId: 'b', count: 2 }, { slotId: 'a', count: 1 }, { slotId: 'empty', count: 1 }, { slotId: 'last', count: 1 }];
    const snapshot = buildSnapshot(data).snapshot;
    expect(snapshot.items.map((item) => item.sourceQuestionId)).toEqual(blankPlacement === 'slot'
      ? ['', 'a1', 'a2', '', 'b1', '', '', ''] : ['a1', 'a2', 'b1', '', '', '', '', '']);
    expect(snapshot.items.map((item) => item.number)).toEqual([21, 22, 23, 24, 25, 26, 27, 28]);
    expect(snapshot.items.filter((item) => item.blank)).toHaveLength(5);
    expect(verifySnapshot(snapshot)).toEqual([]);
  });

  it.each([['a1', 'b1', 'a2'], ['b1', 'a1', 'a2']])('슬롯 순서가 섞였으면 빈 번호를 뒤로 모은다: %j', (...ids) => {
    const data = input();
    data.rules.slots = ['a', 'b'].map((id) => ({ id, label: id, count: 3, filter: { kind: 'all' } }));
    data.exam.questions = ids.map((id) => makeQuestion({ id }));
    data.exam.slotOfQuestion = { a1: 'a', a2: 'a', b1: 'b' };
    data.exam.blanks = [{ slotId: 'a', count: 1 }];
    expect(buildSnapshot(data).snapshot.items.map((item) => item.sourceQuestionId)).toEqual([...ids, '']);
  });

  it('모든 내용 영역과 중첩 표의 이미지를 수집하고 자산도 복사해 동결한다', () => {
    const data = input();
    const question = data.exam.questions[0];
    question.passage = [{ type: 'table', rows: [[[{ type: 'table', rows: [[[{ type: 'image', assetId: 'passage' }]]] }]]] }];
    question.stem.push({ type: 'image', assetId: 'stem' });
    question.choices[0].content.push({ type: 'image', assetId: 'choice' });
    question.explanation.push({ type: 'image', assetId: 'explanation' });
    data.assets = Object.fromEntries(['passage', 'stem', 'choice', 'explanation', 'unused'].map((id) => [id, asset(id)]));
    const snapshot = buildSnapshot(data).snapshot;
    expect(Object.keys(snapshot.assets)).toEqual(['passage', 'stem', 'choice', 'explanation']);
    expect(snapshot.assets.stem).not.toBe(data.assets.stem);
    expect(verifySnapshot(snapshot)).toEqual([]);
    expect(() => { snapshot.assets.stem.mime = 'image/gif'; }).toThrow(TypeError);
    expect(() => { snapshot.items[0].choices[0].content.push(para('변조')); }).toThrow(TypeError);
    expect(() => { snapshot.items[0].stem[0] = para('변조'); }).toThrow(TypeError);
    expect(() => { snapshot.title = '변조'; }).toThrow(TypeError);
  });

  it('누락 이미지·데이터 해시 불일치·깨진 base64를 오류로 보고하면서 계속 만든다', () => {
    const data = input();
    data.exam.questions[0].stem.push(...['missing', 'bad-hash', 'bad-base64'].map((assetId) => ({ type: 'image' as const, assetId })));
    data.assets = { 'bad-hash': { ...asset('bad-hash'), sha256: '0'.repeat(64) },
      'bad-base64': { ...asset('bad-base64'), dataBase64: '!!' } };
    const built = buildSnapshot(data);
    expect(built.snapshot.items).toHaveLength(1);
    expect(built.diagnostics.map((d) => d.code)).toEqual(['ASSET_MISSING', 'ASSET_HASH_MISMATCH', 'ASSET_HASH_MISMATCH']);
    expect(built.diagnostics[0]).toMatchObject({ severity: 'error', ref: { questionId: 'question-1' } });
    expect(built.diagnostics[0].message).toContain('missing');
    expect(built.diagnostics[0].message).toContain('이미지를 다시 가져오세요');
    expect(verifySnapshot(built.snapshot).map((d) => d.code)).toEqual(built.diagnostics.map((d) => d.code));
  });

  it('메타데이터로 해시를 계산하고 같은 입력은 같으며 선지 한 글자 변경은 다르다', () => {
    const data = input();
    data.exam.questions[0].passage = [{ type: 'image', assetId: 'image' }];
    data.assets = { image: asset('image') };
    const original = buildSnapshot(data).snapshot;
    expect(buildSnapshot(data).snapshot).toStrictEqual(original);
    expect(original.contentHash).toBe(sha256Hex(canonicalJson({ items: original.items,
      assets: { image: { id: 'image', mime: 'image/png', sha256: sha256Hex('abc') } } })));
    data.exam.questions[0].choices[0].content = [para('한 글자 변경')];
    expect(buildSnapshot(data).snapshot.contentHash).not.toBe(original.contentHash);
    const copy = structuredClone(original);
    copy.assets.image.dataBase64 = 'YWJk';
    expect(verifySnapshot(copy).map((d) => d.code)).toContain('ASSET_HASH_MISMATCH');
  });

  const mutations: [string, (snapshot: ExamSnapshot) => void][] = [
    ['CONTENT_HASH_MISMATCH', (s) => { s.items[0].stem = [para('변조')]; }],
    ['NUMBER_NOT_CONTIGUOUS', (s) => { s.items[1].number += 1; }],
    ['LABEL_INVALID', (s) => { s.items[0].choices[0].label = '⑩'; }],
    ['ANSWER_LABEL_INVALID', (s) => { s.items[0].answerLabels = ['⑩']; }],
    ['ANSWER_LABEL_INVALID', (s) => { s.items[0].answerLabels = ['②', '①']; }],
    ['BLANK_NOT_EMPTY', (s) => { s.items[1].stem = [para('빈 번호 변조')]; }],
  ];
  it.each(mutations)('복사본 변조를 잡는다: %s', (code, mutate) => {
    const data = input();
    data.exam.blanks = [{ slotId: 'slot-1', count: 1 }];
    const copy = structuredClone(buildSnapshot(data).snapshot);
    mutate(copy);
    expect(verifySnapshot(copy).map((d) => d.code)).toContain(code);
  });

  it('문제와 슬롯이 비어 있거나 passage가 없어도 처리한다', () => {
    const data = input();
    delete data.exam.questions[0].passage;
    expect(buildSnapshot(data).snapshot.items[0].passage).toBeUndefined();
    data.exam = makeSelectedExam();
    expect(verifySnapshot(buildSnapshot(data).snapshot)).toEqual([]);
    data.exam.blanks = [{ slotId: 'slot-1', count: 2 }];
    expect(buildSnapshot(data).snapshot.items.every((item) => item.blank)).toBe(true);
  });
});
