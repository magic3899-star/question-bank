import { mkdtempSync, rmSync, writeFileSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStorage } from '../../../modules/storage/index';
import type { Storage } from '../../../modules/storage/index';
import { buildDocx, image, p } from '../../../../tests/fixtures/docxBuilder';
import { createImportService } from './import';
import { createBankService } from './bank';
import { defaultSettings } from '../settings';

const lines = (n: number, count = 5, answer = true, grade = 'A') => [
  `${n}. 가짜 본문 ${n}`,
  ...Array.from('①②③④⑤'.slice(0, count), (label, i) => `${label} 가짜 선지 ${i}`),
  ...(answer ? ['정답: ①'] : []),
  '해설: 가짜 설명',
  `과목 1-1-${n} (${grade})`,
];
describe('가져오기 분석·검수·저장 서비스', () => {
  let directory: string;
  let storage: Storage;
  let service: ReturnType<typeof createImportService>;
  let bank: ReturnType<typeof createBankService>;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'qb-import-'));
    storage = openStorage(':memory:');
    let next = 0;
    service = createImportService(storage, {
      now: () => '2026-11-02T00:00:00.000Z',
      id: () => `fake-${next++}`,
      pickFiles: async () => [],
    });
    bank = createBankService(storage, () => defaultSettings);
  });
  afterEach(() => {
    storage.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const textFile = (text: string, name = '가짜.txt') => {
    const path = join(directory, name);
    writeFileSync(path, text, 'utf8');
    return path;
  };
  const analyze = (paths: string[], options = {}) =>
    service.analyze({ paths, options: { subject: 'dummy', ...options } });
  it('정상·경고·오류·가져오기 전 제외를 분류하고 저장 전까지 DB를 바꾸지 않는다', async () => {
    const path = textFile(
      [...lines(1), ...lines(2, 2), ...lines(3, 5, false), ...lines(4, 5, true, 'B')].join('\n'),
    );
    const review = await analyze([path]);
    expect(review.items.map((i) => i.status)).toEqual(['ok', 'warn', 'error']);
    expect(review.counts).toEqual({ ok: 1, warn: 1, error: 1, excluded: 0 });
    expect(review.skipped.map((d) => d.code)).toEqual(['SKIPPED_BY_GRADE']);
    expect(review.files[0]).toMatchObject({ name: '가짜.txt', questions: 3, skipped: 1 });
    expect(await storage.questions.count()).toBe(0);
    const result = await service.commit({ batchId: review.batchId, patches: [] });
    expect(result.saved).toBe(2);
    expect(result.notSaved).toEqual([{ index: 2, reason: expect.stringContaining('정답이 없습니다') }]);
  });
  it('은행 중복은 같은 과목에서만 탐지하고 기본 제외하며 기존 ID·목표를 안내한다', async () => {
    const path = textFile(lines(1).join('\n'));
    const first = await analyze([path]);
    const saved = await service.commit({ batchId: first.batchId, patches: [] });
    const second = await analyze([path]);
    expect(second.items[0]!.status).toBe('excluded');
    expect(second.items[0]!.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'DUPLICATE_IN_BANK',
        message: expect.stringContaining(saved.savedIds[0]!),
      }),
    );
    expect(second.items[0]!.excludedReason).toContain('과목 1-1-1');
    expect((await service.commit({ batchId: second.batchId, patches: [] })).saved).toBe(0);
    expect((await analyze([path], { subject: 'other' })).items[0]!.status).toBe('ok');
    const override = await analyze([path]);
    expect(
      (await service.commit({ batchId: override.batchId, patches: [{ index: 0, include: true }] })).saved,
    ).toBe(1);
  });
  it('여러 파일의 같은 지문도 첫 파일을 남기고 기본 제외한다', async () => {
    const review = await analyze([
      textFile(lines(1).join('\n'), '앞.txt'),
      textFile(lines(1).join('\n'), '뒤.txt'),
    ]);
    expect(review.items.map((i) => i.status)).toEqual(['warn', 'excluded']);
    expect(review.items[1]!.diagnostics.some((d) => d.code === 'DUPLICATE_IN_BATCH')).toBe(true);
  });
  it('학습목표·등급·선지 고정·포함 패치를 적용하고 재검증하여 유효한 문제만 저장한다', async () => {
    const review = await analyze([textFile([...lines(1), ...lines(2), ...lines(3)].join('\n'))]);
    const result = await service.commit({
      batchId: review.batchId,
      patches: [
        { index: 0, objectiveCode: '과목 4-2-1', grade: 'B', shufflePolicy: 'lock-all' },
        { index: 1, objectiveCode: '잘못된 목표' },
        { index: 2, include: false },
      ],
    });
    expect(result.saved).toBe(1);
    expect(result.notSaved).toEqual([
      { index: 1, reason: expect.stringContaining('학습목표') },
      { index: 2, reason: expect.stringContaining('제외') },
    ]);
    expect(await storage.questions.get(result.savedIds[0]!)).toMatchObject({
      objectiveCode: '과목 4-2-1',
      grade: 'B',
      shufflePolicy: 'lock-all',
      extra: { sourceFile: '가짜.txt', importBatchId: review.batchId },
    });
  });
  it('목표 오류가 있는 초안을 목표 입력으로 고쳐 저장할 수 있다', async () => {
    const source = lines(1);
    source[source.length - 1] = '과목 9007199254740992-1 (A)';
    const bytes = await buildDocx({ body: source.map((l) => p(l)) });
    const path = join(directory, '가짜.docx');
    writeFileSync(path, bytes);
    const review = await analyze([path]);
    expect(review.items[0]!.status).toBe('error');
    // 반환된 미리보기를 바꿔도 main의 원본 배치는 바뀌지 않는다.
    review.items[0]!.draft.objectiveCode = '미리보기 변조';
    const result = await service.commit({
      batchId: review.batchId,
      patches: [{ index: 0, objectiveCode: '과목 8-2-1' }],
    });
    expect((await storage.questions.get(result.savedIds[0]!))?.objectiveCode).toBe('과목 8-2-1');
  });
  it('가짜 DOCX 이미지 중 저장할 문제의 자산만 저장하고 순서·ID·묶음 필터·실행 취소를 보장한다', async () => {
    const body = [
      p('1. 가짜 첫 문제'),
      image({ bytes: new Uint8Array([1]) }),
      ...lines(1)
        .slice(1)
        .map((l) => p(l)),
      p('2. 가짜 둘째 문제'),
      image({ bytes: new Uint8Array([2]) }),
      ...lines(2)
        .slice(1)
        .map((l) => p(l)),
      p('3. 가짜 셋째 문제'),
      image({ bytes: new Uint8Array([3]) }),
      ...lines(3)
        .slice(1)
        .map((l) => p(l)),
    ];
    const path = join(directory, '가짜.docx');
    writeFileSync(path, await buildDocx({ body }));
    const review = await analyze([path]);
    expect(Object.keys(review.assets)).toHaveLength(3);
    expect(review.items[0]!.summary).toMatchObject({ hasPassage: true, hasImage: true });
    const result = await service.commit({ batchId: review.batchId, patches: [{ index: 1, include: false }] });
    expect(new Set(result.savedIds).size).toBe(2);
    const saved = await Promise.all(result.savedIds.map((id) => storage.questions.get(id)));
    expect(saved.map((q) => q!.createdAt)).toEqual(['2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.002Z']);
    expect(saved.map((q) => q!.extra.originalNumber)).toEqual(['1', '3']);
    const assets = Object.values(review.assets);
    for (const asset of assets)
      expect(!!(await storage.assets.get(asset.id))).toBe(asset.dataBase64 !== 'Ag==');
    expect((await bank.list({ offset: 0, limit: 50, batch: review.batchId })).total).toBe(2);
    expect((await bank.list({ offset: 0, limit: 50, batch: 'other' })).total).toBe(0);
    await bank.deleteMany(result.savedIds);
    expect(await storage.questions.count()).toBe(0);
  });
  it('파싱 실패와 빈 문서는 전체 진단 또는 빈 검수로 반환한다', async () => {
    const bad = textFile('가짜 zip 아님', '손상.docx');
    const review = await analyze([bad, textFile('')]);
    expect(review.items).toEqual([]);
    expect(review.diagnostics.some((d) => d.code === 'DOCX_INVALID')).toBe(true);
    expect((await service.commit({ batchId: review.batchId, patches: [] })).saved).toBe(0);
  });
  it('저장 중 중복 확정은 거부하고 저장소 실패 뒤에는 같은 배치를 재시도할 수 있다', async () => {
    const review = await analyze([textFile(lines(1).join('\n'))]);
    vi.spyOn(storage.questions, 'upsertMany').mockRejectedValueOnce(new Error('가짜 저장 실패'));
    await expect(service.commit({ batchId: review.batchId, patches: [] })).rejects.toThrow('가짜 저장 실패');
    const first = service.commit({ batchId: review.batchId, patches: [] });
    await expect(service.commit({ batchId: review.batchId, patches: [] })).rejects.toThrow('저장 중');
    expect((await first).saved).toBe(1);
    expect(await storage.questions.count()).toBe(1);
    await expect(service.commit({ batchId: review.batchId, patches: [] })).rejects.toThrow('다시 분석');
  });
  it('파일 크기·경로·확장자·디렉터리를 한국어로 거부한다', async () => {
    for (const path of ['relative.txt', join(directory, '없는.txt'), textFile('가짜', '가짜.csv'), directory])
      await expect(analyze([path])).rejects.toThrow(/[가-힣]/u);
    const large = textFile('');
    truncateSync(large, 50 * 1024 * 1024 + 1);
    await expect(analyze([large])).rejects.toThrow('50MB');
  });
  it('사라진 배치·중복 저장·잘못된 입력과 패치를 거부하고 취소는 저장하지 않는다', async () => {
    await expect(service.commit({ batchId: 'missing', patches: [] })).rejects.toThrow('다시 분석');
    expect(() => service.discard('missing')).toThrow('다시 분석');
    const review = await analyze([textFile(lines(1).join('\n'))]);
    for (const patches of [
      [{ index: 99 }],
      [{ index: 0, include: 'yes' }],
      [{ index: 0, objectiveCode: 3 }],
      [{ index: 0, shufflePolicy: 'x' }],
      [{ index: 0 }, { index: 0 }],
    ])
      await expect(service.commit({ batchId: review.batchId, patches })).rejects.toThrow(/[가-힣]/u);
    service.discard(review.batchId);
    expect(await storage.questions.count()).toBe(0);
    await expect(service.commit({ batchId: review.batchId, patches: [] })).rejects.toThrow('다시 분석');
    for (const value of [
      null,
      {},
      { paths: [], options: { subject: 'dummy' } },
      { paths: ['x'], options: { subject: '' } },
      { paths: ['x'], options: { subject: 'dummy', requireObjective: 'yes' } },
    ])
      await expect(service.analyze(value)).rejects.toThrow(/[가-힣]/u);
    await expect(bank.deleteMany([''])).rejects.toThrow('문제 ID');
    expect(await service.pickFiles()).toEqual([]);
  });
});
