import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '../../../contracts/index';
import { openStorage } from '../../../modules/storage/index';
import type { Storage } from '../../../modules/storage/index';
import { createEditorService } from './editor';
import { createBankService } from './bank';
import { defaultSettings } from '../settings';

const paragraph = (text: string) => [{ type: 'paragraph' as const, runs: [{ text }] }];
const fake = (): Question => ({
  id: '',
  schemaVersion: 1,
  subject: 'fake',
  type: 'mcq',
  stem: paragraph('가짜 문항'),
  choices: Array.from({ length: 5 }, (_, i) => ({
    id: `c${i + 1}`,
    content: paragraph(`가짜 선지 ${i + 1}`),
  })),
  answerChoiceIds: ['c1'],
  explanation: [],
  shufflePolicy: 'free',
  tags: [],
  extra: {},
  createdAt: '',
  updatedAt: '',
});
const textQuestion = (n: number) =>
  `${n}. 가짜 문항 ${n}\n① 첫 선지\n② 둘째 선지\n③ 셋째 선지\n④ 넷째 선지\n⑤ 다섯째 선지`;
describe('직접 추가 편집 서비스', () => {
  let storage: Storage;
  let service: ReturnType<typeof createEditorService>;
  let tick: number;
  beforeEach(() => {
    storage = openStorage(':memory:');
    tick = 0;
    service = createEditorService(storage, {
      now: () => `2026-11-02T00:00:${String(tick++).padStart(2, '0')}.000Z`,
      id: () => `fake-${tick++}`,
    });
  });
  afterEach(() => storage.close());
  const save = async (question = fake(), force = false) => {
    const result = await service.save({ question, assets: [], force });
    if (!result.saved) throw new Error('가짜 테스트 중복');
    return result;
  };
  it('추가·편집의 ID와 생성 시각을 보존하고 삭제·복원한다', async () => {
    const first = await save();
    expect(first.question.id).toMatch(/^fake-/u);
    const edited = await save({ ...first.question, grade: 'B', createdAt: '조작' });
    expect(edited.previous).toEqual(first.question);
    expect(edited.question.createdAt).toBe(first.question.createdAt);
    expect(edited.question.updatedAt).not.toBe(first.question.updatedAt);
    const removed = await service.delete([first.question.id]);
    expect(await storage.questions.count()).toBe(0);
    await service.restore(removed);
    expect(await storage.questions.get(first.question.id)).toEqual(edited.question);
  });
  it('같은 과목의 같은 지문을 알리고 자기 자신은 제외하며 확인 후 저장한다', async () => {
    const first = await save();
    const duplicate = await service.save({ question: fake(), assets: [] });
    expect(duplicate).toMatchObject({ saved: false, duplicates: [{ id: first.question.id }] });
    expect(await storage.questions.count()).toBe(1);
    expect((await save(first.question)).question.id).toBe(first.question.id);
    await save(fake(), true);
    await save({ ...fake(), subject: 'other' });
    expect(await storage.questions.count()).toBe(3);
  });
  it('정답 누락은 차단하고 목표·해설 누락은 저장 가능한 진단이다', async () => {
    expect(service.validate(fake())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'OBJECTIVE_MISSING', severity: 'warn' }),
        expect.objectContaining({ code: 'EXPLANATION_EMPTY', severity: 'info' }),
      ]),
    );
    await expect(save({ ...fake(), answerChoiceIds: [] })).rejects.toThrow('정답');
    await expect(save({ ...fake(), objectiveCode: '잘못된 코드' })).rejects.toThrow('학습목표');
    await expect(
      save({ ...fake(), choices: Array.from({ length: 11 }, () => fake().choices[0]!) }),
    ).rejects.toThrow('2~10');
    await expect(service.save({ question: null, assets: [] })).rejects.toThrow(/[가-힣]/u);
    await expect(service.save({ question: { ...fake(), id: 'missing' }, assets: [] })).rejects.toThrow(
      '없습니다',
    );
    expect(() => service.validate({ ...fake(), stem: [{ type: 'script' }] })).toThrow('블록');
    await expect(
      save({
        ...fake(),
        choices: fake().choices.map((c, i) =>
          i === 0 ? { ...c, content: paragraph('① 번호를 지울 선지') } : c,
        ),
      }),
    ).rejects.toThrow('원문자');
  });
  it('기존 가져오기 자산 ID를 보존하고 원문자 참조는 명시적으로 해제한 경우만 섞는다', async () => {
    const legacy = { id: 'legacy-image', sha256: 'legacy', mime: 'image/png', dataBase64: 'ZmFrZQ==' };
    await storage.assets.put(legacy);
    const q = {
      ...fake(),
      passage: [{ type: 'image' as const, assetId: legacy.id }],
      explanation: paragraph('③ 선지 설명'),
    };
    const result = await service.save({ question: q, assets: [legacy] });
    expect(result).toMatchObject({ saved: true, question: { shufflePolicy: 'lock-all' } });
    const unlocked = await save({
      ...q,
      stem: paragraph('별도의 가짜'),
      extra: { allowChoiceShuffle: true },
    });
    expect(unlocked.question.shufflePolicy).toBe('free');
  });
  it('이미지 크기·형식·변조·누락을 거부하고 해시 자산을 저장한다', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const asset = service.addAsset({ bytes, mime: 'image/png' });
    expect(service.addAsset({ bytes, mime: 'image/png' })).toEqual(asset);
    for (const value of [
      { bytes, mime: 'image/jpeg' },
      { bytes: new Uint8Array(), mime: 'image/png' },
      { bytes: new Uint8Array(10 * 1024 * 1024 + 1), mime: 'image/png' },
      { bytes, mime: 'image/svg+xml' },
    ])
      expect(() => service.addAsset(value)).toThrow(/[가-힣]/u);
    const q = { ...fake(), passage: [{ type: 'image' as const, assetId: asset.id }] };
    await expect(service.save({ question: q, assets: [] })).rejects.toThrow('이미지');
    await expect(service.save({ question: q, assets: [{ ...asset, sha256: 'fake' }] })).rejects.toThrow(
      '식별자',
    );
    expect((await service.save({ question: q, assets: [asset] })).saved).toBe(true);
    expect(await storage.assets.get(asset.id)).toEqual(asset);
  });
  it('1개·여러 문제를 목표·등급 없이 분리하고 원래 번호·정답 누락 진단을 보존한다', () => {
    expect(service.parseText({ text: textQuestion(1), subject: 'fake' }).questions).toHaveLength(1);
    const batch = service.parseText({ text: `${textQuestion(1)}\n${textQuestion(2)}`, subject: 'fake' });
    expect(batch.questions).toHaveLength(2);
    expect(batch.questions.map((q) => q.extra.originalNumber)).toEqual(['1', '2']);
    expect(
      batch.questions.every(
        (q) => q.extra.addBatchId === batch.batchId && !q.id && !q.answerChoiceIds.length,
      ),
    ).toBe(true);
    expect(batch.diagnostics.filter((d) => d.code === 'ANSWER_MISSING')).toHaveLength(2);
    expect(() => service.parseText({ text: '', subject: 'fake' })).toThrow('글자');
  });
  it('해설 번호·정답을 분리하고 같은 묶음의 일치 번호만 일괄 적용한다', async () => {
    const explanations = service.parseExplanations({ text: '01. 정답 ③\n가짜 해설\n9. 짝 없음' });
    expect(explanations.map((e) => [e.number, e.answerPositions])).toEqual([
      ['01', [3]],
      ['9', []],
    ]);
    const first = (await save({ ...fake(), extra: { addBatchId: 'batch', originalNumber: '01' } })).question;
    const second = (
      await save({ ...fake(), stem: paragraph('다른 가짜'), extra: { addBatchId: 'batch', addOrder: 2 } })
    ).question;
    const pair = {
      questionId: first.id,
      number: '01',
      explanation: explanations[0]!.explanation,
      answerPositions: [3],
    };
    const changed = await service.applyExplanations({ pairs: [pair] });
    expect(changed[0]).toMatchObject({ answerChoiceIds: ['c3'], explanation: paragraph('가짜 해설') });
    expect(changed[0]!.updatedAt).not.toBe(first.updatedAt);
    for (const invalid of [
      { ...pair, number: '1' },
      { ...pair, questionId: 'missing' },
      { ...pair, answerPositions: [10] },
    ])
      await expect(service.applyExplanations({ pairs: [invalid] })).rejects.toThrow(/[가-힣]/u);
    await expect(
      service.applyExplanations({ pairs: [pair, { questionId: second.id, number: '9', explanation: [] }] }),
    ).rejects.toThrow('번호');
    expect((await storage.questions.get(second.id))?.explanation).toEqual([]);
    await service.applyExplanations({
      pairs: [{ questionId: second.id, number: '2', explanation: paragraph('나중 해설') }],
    });
    const bank = createBankService(storage, () => defaultSettings);
    expect((await bank.list({ offset: 0, limit: 50, withoutExplanation: true })).total).toBe(0);
  });
  it('줄 잇기와 추출 정답을 전달하고 범위 오류 시 묶음 전체를 저장하지 않는다', async () => {
    const text = '1. 가짜 자\n는?\n① 첫째\n② 둘째';
    expect(
      service.parseText({ text, subject: 'fake', joinWrappedLinesWith: 'none' }).questions[0]!.stem,
    ).toEqual(paragraph('가짜 자는?'));
    expect(() => service.parseText({ text, subject: 'fake', joinWrappedLinesWith: 'auto' })).toThrow(
      '줄바꿈',
    );
    expect(() => service.parseExplanations({ text: '1. 설명', joinWrappedLinesWith: true })).toThrow(
      '줄바꿈',
    );
    const entries = service.parseExplanations({
      text: '1. [정답] ③\n가짜 자\n는 설명\n2. 정답 9\n다른 설명',
      joinWrappedLinesWith: 'none',
    });
    expect(entries[0]).toMatchObject({
      answerLabels: ['③'],
      answerPositions: [3],
      explanation: paragraph('가짜 자는 설명'),
    });
    const first = (await save({ ...fake(), extra: { addBatchId: 'batch', originalNumber: '1' } })).question;
    const second = (
      await save({
        ...fake(),
        stem: paragraph('다른 가짜'),
        extra: { addBatchId: 'batch', originalNumber: '2' },
      })
    ).question;
    await expect(
      service.applyExplanations({
        pairs: entries.map((entry, index) => ({
          questionId: [first.id, second.id][index],
          number: entry.number,
          explanation: entry.explanation,
          answerPositions: entry.answerPositions,
        })),
      }),
    ).rejects.toThrow('선지 범위');
    expect((await storage.questions.get(first.id))!.explanation).toEqual([]);
    await service.applyExplanations({
      pairs: [{ questionId: first.id, number: '1', explanation: entries[0]!.explanation }],
    });
    expect((await storage.questions.get(first.id))!.answerChoiceIds).toEqual(['c1']);
    await service.applyExplanations({
      pairs: [
        {
          questionId: first.id,
          number: '1',
          explanation: entries[0]!.explanation,
          answerPositions: entries[0]!.answerPositions,
        },
      ],
    });
    expect((await storage.questions.get(first.id))!.answerChoiceIds).toEqual(['c3']);
  });
  it('목록 필터는 빈 표·공백 해설도 누락으로 보고 목표 자동완성은 과목별로 중복 제거한다', async () => {
    await save({ ...fake(), objectiveCode: '가짜 1-1-1', explanation: paragraph(' ') });
    await save({
      ...fake(),
      stem: paragraph('다른 가짜'),
      objectiveCode: '가짜 1-1-1',
      explanation: paragraph('해설'),
    });
    const bank = createBankService(storage, () => defaultSettings);
    expect((await bank.list({ offset: 0, limit: 50, withoutExplanation: true })).total).toBe(1);
    expect(await service.objectiveCodes('fake')).toEqual(['가짜 1-1-1']);
    expect(await service.objectiveCodes('other')).toEqual([]);
    await expect(bank.list({ offset: 0, limit: 50, withoutExplanation: 'x' })).rejects.toThrow('필터');
    vi.spyOn(storage.questions, 'upsertMany').mockRejectedValueOnce(new Error('가짜 저장 실패'));
    await expect(save({ ...fake(), stem: paragraph('실패') })).rejects.toThrow('가짜 저장 실패');
    expect(await storage.questions.count()).toBe(2);
  });
});
