import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStorage } from '../../../modules/storage/index';
import type { Storage } from '../../../modules/storage/index';
import { makeQuestion, para } from '../../../../tests/fixtures/builders';
import { defaultSettings } from '../settings';
import { createBankService } from './bank';
import { createAppInfoService } from './app-info';

describe('화면용 문제은행 서비스', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = openStorage(':memory:');
  });
  afterEach(() => storage.close());
  const service = () => createBankService(storage, () => defaultSettings);
  it('빈 저장소에도 설정 과목과 0개 통계를 반환한다', async () => {
    expect(await service().stats()).toEqual({
      total: 0,
      bySubject: [
        { subject: 'law', name: '법규', count: 0, withoutObjective: 0 },
        { subject: 'anatomy', name: '해부', count: 0, withoutObjective: 0 },
      ],
      warnings: { withoutObjective: 0 },
    });
    expect(await service().list({ offset: 0, limit: 50 })).toEqual({ items: [], total: 0 });
    expect(await service().objectiveTree('law')).toEqual([]);
  });
  it('통계·경고·80자 미리보기·페이지·검색·누락 목표를 조합한다', async () => {
    await storage.questions.upsertMany([
      makeQuestion({
        id: 'a',
        subject: 'law',
        objectiveCode: '법규 1-1-1',
        stem: [para('한'.repeat(90))],
        passage: [],
        grade: 'A',
      }),
      makeQuestion({ id: 'b', subject: 'law', objectiveCode: ' ', stem: [para('검색용 가짜 문제')] }),
      makeQuestion({ id: 'c', subject: 'new', objectiveCode: undefined }),
    ]);
    const stats = await service().stats();
    expect(stats.total).toBe(3);
    expect(stats.warnings.withoutObjective).toBe(2);
    expect(stats.bySubject.find((s) => s.subject === 'new')).toMatchObject({ name: 'new', count: 1 });
    const list = await service().list({ subject: 'law', offset: 0, limit: 1 });
    expect(list.total).toBe(2);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      id: 'a',
      grade: 'A',
      hasPassage: false,
      hasImage: false,
      choiceCount: 5,
      stemPreview: '한'.repeat(80),
    });
    expect((await service().list({ offset: 1, limit: 1 })).items[0].id).toBe('b');
    expect(
      (await service().list({ text: '검색용', withoutObjective: true, offset: 0, limit: 50 })).items.map(
        (q) => q.id,
      ),
    ).toEqual(['b']);
    expect((await service().list({ offset: 99, limit: 50 })).items).toEqual([]);
    expect(
      (await service().list({ withoutObjective: true, offset: 0, limit: 50 })).items.every(
        (q) => q.warnings > 0,
      ),
    ).toBe(true);
  });
  it('목표 필터는 1과 14를 구분하고 계층 개수를 누적한다', async () => {
    await storage.questions.upsertMany(
      ['법규 1-1-2', '법규 1-2-3', '법규 14-1-1', '잘못된코드', undefined].map((objectiveCode, i) =>
        makeQuestion({ id: String(i), subject: 'law', objectiveCode }),
      ),
    );
    expect((await service().list({ objectivePrefix: '법규 1', offset: 0, limit: 50 })).total).toBe(2);
    const tree = await service().objectiveTree('law');
    expect(tree.map((n) => [n.code, n.count])).toEqual([
      ['법규 1', 2],
      ['법규 14', 1],
    ]);
    expect(tree[0].children[1]).toMatchObject({
      code: '법규 1-2',
      count: 1,
      children: [{ code: '법규 1-2-3', count: 1, children: [] }],
    });
  });
  it('본문·지문·선지·해설의 중첩 표까지 사용 자산만 중복 없이 반환한다', async () => {
    for (const id of ['used', 'unused'])
      await storage.assets.put({ id, mime: 'image/png', sha256: '', dataBase64: '' });
    await storage.questions.upsertMany([
      makeQuestion({
        id: 'asset',
        stem: [
          {
            type: 'table',
            rows: [
              [
                [
                  { type: 'image', assetId: 'used' },
                  { type: 'image', assetId: 'missing' },
                ],
              ],
            ],
          },
        ],
        explanation: [{ type: 'image', assetId: 'used' }],
      }),
    ]);
    const detail = await service().get('asset');
    expect(detail.question.id).toBe('asset');
    expect(Object.keys(detail.assets)).toEqual(['used']);
    expect((await service().list({ offset: 0, limit: 1 })).items[0].hasImage).toBe(true);
  });
  it.each([
    null,
    {},
    { offset: -1, limit: 10 },
    { offset: 0, limit: 0 },
    { offset: 0, limit: 101 },
    { offset: 0.5, limit: 10 },
    { offset: 0, limit: 10, text: 1 },
    { offset: 0, limit: 10, withoutObjective: 'yes' },
  ])('잘못된 검색 입력을 한국어로 거부한다: %j', async (input) => {
    await expect(service().list(input)).rejects.toThrow(/[가-힣]/u);
  });
  it('잘못된 ID·과목과 없는 문제를 안내한다', async () => {
    await expect(service().get('')).rejects.toThrow('문제 ID');
    await expect(service().get('missing')).rejects.toThrow('목록을 새로');
    await expect(service().objectiveTree(42)).rejects.toThrow('과목');
  });
  it('800문제에서 페이지 경계를 넘어도 각 페이지는 최대 50문제만 반환한다', async () => {
    await storage.questions.upsertMany(
      Array.from({ length: 800 }, (_, i) =>
        makeQuestion({ id: `fake-${String(i).padStart(4, '0')}`, subject: 'law' }),
      ),
    );
    const first = await service().list({ offset: 0, limit: 50 });
    const last = await service().list({ offset: 750, limit: 50 });
    expect(first.items).toHaveLength(50);
    expect(last.items).toHaveLength(50);
    expect(last.total).toBe(800);
    expect(first.items[0].id).toBe('fake-0000');
    expect(last.items[49].id).toBe('fake-0799');
    expect(first.items.some((q) => last.items.some((other) => other.id === q.id))).toBe(false);
  });
  it('앱 정보를 복사해서 반환한다', () => {
    const info = createAppInfoService({
      version: '1',
      dataDir: 'fake',
      dbPath: 'fake/db',
      isPackaged: false,
    });
    const value = info.get();
    value.version = 'changed';
    expect(info.get().version).toBe('1');
  });
});
