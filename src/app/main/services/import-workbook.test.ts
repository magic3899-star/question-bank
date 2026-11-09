import { mkdtempSync, rmSync, writeFileSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkbookFixture } from '../../../../tests/fixtures/workbook';
import { blocksToPlainText } from '../../../modules/content-model/index';
import { PdfReadError } from '../../../modules/importers/index';
import { openStorage } from '../../../modules/storage/index';
import type { Storage } from '../../../modules/storage/index';
import { createSettingsService } from '../settings';
import { createRulesService } from './rules';
import { createEnsureSubjects } from './import-subjects';
import { createImportService } from './import';

describe('문제집·정답집 앱 연결', () => {
  let directory: string;
  let storage: Storage;
  let service: ReturnType<typeof createImportService>;
  let settings: ReturnType<typeof createSettingsService>;
  let rules: ReturnType<typeof createRulesService>;
  let nextFile: number;
  const now = () => '2026-11-09T00:00:00.000Z';
  const readPdfLines = vi.fn(async (data: Uint8Array) => ({
    lines: JSON.parse(Buffer.from(data).toString('utf8')) as string[],
    pages: 3,
  }));
  const file = (lines: readonly string[], extension = '.pdf') => {
    const path = join(directory, `가짜-${nextFile++}${extension}`);
    writeFileSync(path, JSON.stringify(lines), 'utf8');
    return path;
  };
  const fixturePaths = (fixture = makeWorkbookFixture()) => [
    file(fixture.questionBooks.slice(0, 2).flatMap((book) => book.lines)),
    ...(fixture.questionBooks.length > 2
      ? [file(fixture.questionBooks.slice(2).flatMap((book) => book.lines))]
      : []),
    file(fixture.answerBooks.flatMap((book) => book.lines)),
  ];
  const analyze = (paths: string[], options = {}) =>
    service.analyze({ paths, options: { subject: 'auto', ...options } });
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'qb-workbook-'));
    storage = openStorage(':memory:');
    nextFile = 0;
    settings = createSettingsService(join(directory, 'settings.json'), now);
    rules = createRulesService(storage, settings.get);
    readPdfLines.mockClear();
    service = createImportService(storage, {
      now,
      pickFiles: async () => [],
      readPdfLines,
      ensureSubjects: createEnsureSubjects(settings, rules),
    });
  });
  afterEach(() => {
    storage.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('두 문제집과 통합 정답집의 내용·정답·해설·목표를 그대로 검수와 저장에 전달한다', async () => {
    const fixture = makeWorkbookFixture({ omitObjectives: true });
    const paths = fixturePaths(fixture);
    const progress = vi.fn();
    const review = await service.analyze({ paths, options: { subject: 'auto' } }, progress);
    const expected = fixture.expected.filter((question) => question.objectiveCode);
    expect(review.items).toHaveLength(60);
    expect(review.files.map((entry) => [entry.questions, entry.skipped])).toEqual([
      [40, 10],
      [20, 5],
      [0, 0],
    ]);
    expect(review.files.map((entry) => entry.name)).toEqual([
      '가짜-0.pdf (문제집)',
      '가짜-1.pdf (문제집)',
      '가짜-2.pdf (정답집)',
    ]);
    expect(progress.mock.calls.map(([value]) => value)).toEqual(
      paths.flatMap((_, index) => [
        { file: `가짜-${index}.pdf`, label: '글자 읽는 중', done: 0, total: 1 },
        { file: `가짜-${index}.pdf`, label: '글자 읽는 중', done: 1, total: 1 },
      ]),
    );
    for (const [index, item] of review.items.entries()) {
      const original = expected[index];
      expect(item.draft.subject).toBe(original.subject);
      expect(blocksToPlainText(item.draft.stem)).toContain(original.marker);
      expect(item.draft.choices.map((choice) => blocksToPlainText(choice.content))).toEqual(original.choices);
      expect(item.draft.answerChoiceIds).toEqual([original.answerId]);
      expect(blocksToPlainText(item.draft.explanation)).toBe(
        `가짜해설 ${original.marker}\n• ${original.marker}_설명 바나나 사과나무\n① → ${original.marker}_선지참조`,
      );
      expect(item.draft.objectiveCode).toBe(original.objectiveCode);
    }
    const result = await service.commit({ batchId: review.batchId, patches: [] });
    expect(result.saved).toBe(60);
    for (const [index, id] of result.savedIds.entries()) {
      const saved = (await storage.questions.get(id))!;
      expect(saved).toMatchObject({
        ...review.items[index].draft,
        id,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
        extra: { ...review.items[index].draft.extra, importBatchId: review.batchId },
      });
    }
  });

  it('화면의 목표 필수·선지 고정만 전달하고 사용하지 않는 등급·지문 옵션은 무시한다', async () => {
    const review = await analyze(fixturePaths(makeWorkbookFixture({ omitObjectives: true })), {
      requireObjective: false,
      lockChoicesOnReference: false,
      includeGrades: ['B'],
      dedupeByPassage: false,
    });
    expect(review.items).toHaveLength(75);
    expect(review.items.every((item) => item.draft.shufflePolicy === 'free')).toBe(true);
    expect(review.items.filter((item) => !item.draft.objectiveCode)).toHaveLength(15);
  });

  it('PDF 아닌 파일·짝이 없는 책·알 수 없는 책·읽기 실패를 파일명과 함께 안내한다', async () => {
    const fixture = makeWorkbookFixture();
    for (const extension of ['.txt', '.csv'])
      await expect(analyze([file([], extension)])).rejects.toThrow(`PDF 파일만 고를 수 있습니다: 가짜-`);
    await expect(analyze([file(fixture.questionBooks[0].lines)])).rejects.toThrow('정답집 PDF 도 함께');
    await expect(analyze([file(fixture.answerBooks[0].lines)])).rejects.toThrow('문제집 PDF 도 함께');
    const unknown = file(['가짜 알 수 없는 책']);
    await expect(analyze([unknown])).rejects.toThrow(/가짜-\d+.pdf은 문제집도 정답집도/);
    for (const error of [
      new PdfReadError('PDF_PASSWORD', '암호를 푼 파일로 다시 가져오세요.'),
      new Error('fake'),
    ]) {
      readPdfLines.mockRejectedValueOnce(error);
      await expect(analyze([file([])])).rejects.toThrow(/가짜-\d+.pdf:/);
    }
    const large = file([]);
    truncateSync(large, 50 * 1024 * 1024 + 1);
    await expect(analyze([large])).rejects.toThrow('50MB');
  });

  it('선지가 다른 변형은 유지하고 같은 선지만 배치·은행에서 전 과목 비교로 제외한다', async () => {
    const fixture = makeWorkbookFixture({ subjects: 1 });
    const book = fixture.questionBooks[0];
    const first = fixture.expected[0];
    book.lines = book.lines.map((line) =>
      line.includes('사과나무는 어떤가요?') ? `${first.marker} 사과나무는 어떤가요?` : line,
    );
    const original = fixture.expected[2];
    book.lines = book.lines.map((line) => line.replaceAll(original.marker, fixture.expected[1].marker));
    const paths = fixturePaths(fixture);
    const review = await analyze(paths, { dedupeByPassage: false });
    expect(review.items[0].status).not.toBe('excluded');
    expect(review.items[1].status).not.toBe('excluded');
    expect(review.items[2].diagnostics.some((diagnostic) => diagnostic.code === 'DUPLICATE_IN_BATCH')).toBe(
      true,
    );
    const stored = {
      ...review.items[0].draft,
      id: 'other-subject',
      subject: 'anatomy',
      choices: review.items[0].draft.choices.map((choice) => ({
        ...choice,
        content: [
          {
            type: 'paragraph' as const,
            runs: [{ text: Array.from(blocksToPlainText(choice.content)).join(' ') }],
          },
        ],
      })),
    };
    await storage.questions.upsertMany([stored]);
    const query = vi.spyOn(storage.questions, 'query');
    const next = await analyze(paths);
    expect(query).toHaveBeenCalledExactlyOnceWith({});
    expect(next.items[0].diagnostics.some((diagnostic) => diagnostic.code === 'DUPLICATE_IN_BANK')).toBe(
      true,
    );
    expect(next.items[1].status).not.toBe('excluded');
    expect(next.items[2].status).toBe('excluded');
  });

  it('기존 2과목 사용자에게 21과목·기본 규칙을 추가하며 두 번째 저장은 추가하지 않는다', async () => {
    await rules.ensurePresets();
    const anatomy = (await storage.ruleSets.get('anatomy'))!;
    anatomy.name = '사용자가 고친 규칙';
    await storage.ruleSets.save(anatomy);
    const paths = fixturePaths(makeWorkbookFixture({ subjects: 21, count: 20 }));
    const review = await analyze(paths);
    const result = await service.commit({ batchId: review.batchId, patches: [] });
    expect(result.saved).toBe(420);
    expect(result.newSubjects).toHaveLength(19);
    expect(settings.get().subjects).toHaveLength(21);
    expect(await storage.ruleSets.list()).toHaveLength(21);
    expect(await storage.ruleSets.get('anatomy')).toEqual(anatomy);
    const second = await analyze(paths);
    const repeated = await service.commit({ batchId: second.batchId, patches: [] });
    expect(repeated.saved).toBe(0);
    expect(repeated.newSubjects).toBeUndefined();
    await createEnsureSubjects(settings, rules)(['morphology', 'morphology', 'unknown']);
    expect(settings.get().subjects).toHaveLength(21);
    expect(await storage.ruleSets.list()).toHaveLength(21);
  });

  it('과목 등록 실패 시 문제를 저장하지 않으며 같은 배치로 재시도할 수 있다', async () => {
    const ensureSubjects = vi.fn(createEnsureSubjects(settings, rules));
    service = createImportService(storage, { now, pickFiles: async () => [], readPdfLines, ensureSubjects });
    const review = await analyze(fixturePaths());
    ensureSubjects.mockRejectedValueOnce(new Error('과목 등록 실패'));
    await expect(service.commit({ batchId: review.batchId, patches: [] })).rejects.toThrow('과목 등록 실패');
    expect(await storage.questions.count()).toBe(0);
    expect((await service.commit({ batchId: review.batchId, patches: [] })).saved).toBe(75);
  });

  it('가짜 3,780문제도 한 번의 은행 조회로 분석한다', async () => {
    const query = vi.spyOn(storage.questions, 'query');
    const review = await analyze(fixturePaths(makeWorkbookFixture({ subjects: 21, count: 180 })));
    expect(review.items).toHaveLength(3780);
    expect(review.counts.excluded).toBe(0);
    expect(query).toHaveBeenCalledExactlyOnceWith({});
  });
});
