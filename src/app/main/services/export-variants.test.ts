import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeVariantExam } from '../../../../tests/fixtures/variantExam';
import { para } from '../../../../tests/fixtures/builders';
import type { ExamSnapshot } from '../../../contracts/index';
import { deriveVariant } from '../../../modules/generation/index';
import { shufflers } from '../../../modules/shuffler/index';
import { docxExporter } from '../../../modules/exporters/docx/index';
import { openStorage } from '../../../modules/storage/index';
import type { Storage } from '../../../modules/storage/index';
import { defaultSettings } from '../settings';
import { createExportService } from './export';
import { createGenerateService } from './generate';

let storage: Storage;
let folder: string;
const fixture = makeVariantExam();
const snapshots = [fixture.snapshot, { ...fixture.snapshot, examId: 'fake-second', title: '가짜 두 번째' }];
beforeEach(async () => {
  storage = openStorage(':memory:');
  folder = mkdtempSync(join(tmpdir(), 'qb-variants-'));
  await storage.questions.upsertMany(fixture.sources);
  await storage.ruleSets.save(fixture.rules);
});
afterEach(() => {
  vi.restoreAllMocks();
  storage.close();
  rmSync(folder, { recursive: true, force: true });
});

function services() {
  const derive = vi.fn((snapshot: ExamSnapshot) => {
    const result = deriveVariant(
      { ...fixture, snapshot, seed: `${snapshot.seed}/${snapshot.examId}` },
      { shufflers },
    );
    if (!result.snapshot) throw new Error(result.diagnostics.map((item) => item.message).join(' '));
    return result.snapshot;
  });
  const getRules = vi.fn(async (id: string) => {
    const rules = await storage.ruleSets.get(id);
    if (!rules) throw new Error('출제 규칙을 찾을 수 없습니다.');
    return rules;
  });
  const session = { snapshots, rules: fixture.rules, markSaved: vi.fn(), deriveEvenType: derive };
  const exporter = createExportService(storage, {
    renderPdf: async () => new TextEncoder().encode('가짜 PDF'),
    pickFolder: async () => folder,
    defaultFolder: () => folder,
    settings: { get: () => defaultSettings, update: (partial) => ({ ...defaultSettings, ...partial }) },
    session: () => session,
    subjectName: (id) => id,
    ruleName: async () => '가짜 규칙',
    getRules,
  });
  return { exporter, derive, getRules, session };
}
const request = {
  source: { sessionId: 'fake' },
  formats: ['pdf', 'docx', 'xlsx'],
  parts: ['questions', 'answers', 'explanations'],
  combineParts: false,
};

describe('홀수형·짝수형 동시 저장', () => {
  it.each([undefined, 'single', 'both'])(
    '시험지 종류 %s의 파일 수·제목·진행률·원본 이력만 기록한다',
    async (examTypes) => {
      const { exporter, derive } = services();
      const record = vi.spyOn(storage.history, 'record');
      const progress = vi.fn();
      const result = await exporter.export({ ...request, examTypes }, progress);
      const typeCount = examTypes === 'both' ? 2 : 1;
      expect(result!.files).toHaveLength(2 * typeCount * 3 * 3);
      expect(progress).toHaveBeenLastCalledWith({
        done: 2 * typeCount * 3,
        total: 2 * typeCount * 3,
        current: '',
      });
      expect(record).toHaveBeenCalledTimes(2);
      expect((await storage.history.list()).map((item) => item.examId).sort()).toEqual(
        snapshots.map((item) => item.examId).sort(),
      );
      for (const snapshot of snapshots) {
        expect(await storage.snapshots.get(snapshot.examId)).toEqual(snapshot);
        const even = await storage.snapshots.get(`${snapshot.examId}-even`);
        if (examTypes === 'both') {
          expect(even?.title).toBe(snapshot.title);
          expect(result!.files.filter((file) => file.examTitle === `${snapshot.title} 홀수형`)).toHaveLength(
            9,
          );
          expect(result!.files.filter((file) => file.examTitle === `${snapshot.title} 짝수형`)).toHaveLength(
            9,
          );
        } else expect(even).toBeUndefined();
      }
      if (examTypes === 'both')
        expect(result!.files.every((file) => /(?:홀수형|짝수형)_/u.test(file.path))).toBe(true);
      else expect(derive).not.toHaveBeenCalled();
    },
  );

  it('합치기는 회차 × 두 형 × 형식 수이며 재저장과 이력 저장에서 짝수형을 재사용한다', async () => {
    const { exporter, derive, getRules } = services();
    const input = { ...request, examTypes: 'both', combineParts: true };
    expect((await exporter.export(input))!.files).toHaveLength(2 * 2 * 3);
    const saved = await storage.snapshots.get(`${snapshots[0]!.examId}-even`);
    expect(derive).toHaveBeenCalledTimes(2);
    derive.mockImplementation(() => {
      throw new Error('다시 파생하면 안 됨');
    });
    await exporter.export(input);
    await storage.ruleSets.delete(fixture.rules.id);
    await exporter.export({ ...input, source: { historyExamIds: [snapshots[0]!.examId] } });
    expect(derive).toHaveBeenCalledTimes(2);
    expect(getRules).not.toHaveBeenCalled();
    expect(await storage.snapshots.get(`${snapshots[0]!.examId}-even`)).toEqual(saved);
    expect(await storage.history.list()).toHaveLength(2);
  });

  it('긴 제목에서도 파일명에 두 형의 이름을 보존한다', async () => {
    const { exporter } = services();
    const snapshot = { ...fixture.snapshot, title: '가짜'.repeat(60) };
    await storage.snapshots.save(snapshot);
    const result = await exporter.export({
      ...request,
      formats: ['xlsx'],
      parts: ['questions'],
      examTypes: 'both',
      source: { historyExamIds: [snapshot.examId] },
    });
    expect(result!.files[0]!.path).toContain(' 홀수형_문제지.xlsx');
    expect(result!.files[1]!.path).toContain(' 짝수형_문제지.xlsx');
    expect((await storage.snapshots.get(snapshot.examId))?.title).toBe(snapshot.title);
  });

  it('이력에서 처음 파생하고 원본·짝수형을 함께 삭제하며 없는 짝수형도 허용한다', async () => {
    const { exporter, getRules } = services();
    await exporter.export({ ...request, formats: ['xlsx'], parts: ['answers'] });
    await exporter.export({
      ...request,
      formats: ['xlsx'],
      parts: ['answers'],
      examTypes: 'both',
      source: { historyExamIds: [snapshots[0]!.examId] },
    });
    expect(getRules).toHaveBeenCalledWith(fixture.rules.id);
    expect(await storage.snapshots.get(`${snapshots[0]!.examId}-even`)).toBeDefined();
    await exporter.historyDelete(snapshots.map((item) => item.examId));
    for (const snapshot of snapshots) {
      expect(await storage.snapshots.get(snapshot.examId)).toBeUndefined();
      expect(await storage.snapshots.get(`${snapshot.examId}-even`)).toBeUndefined();
    }
    expect(await storage.history.list()).toEqual([]);
  });

  it.each(['bad', '', null, true, 2])('잘못된 종류 %j는 출력 전에 거부한다', async (examTypes) => {
    const { exporter, derive } = services();
    await expect(exporter.export({ ...request, examTypes })).rejects.toThrow('시험지 종류');
    expect(derive).not.toHaveBeenCalled();
    expect(readdirSync(folder)).toEqual([]);
  });

  it.each(['rule', 'question', 'changed'])('이력의 출처 문제 %s를 한국어 오류로 알린다', async (kind) => {
    const { exporter } = services();
    const snapshot = snapshots[0]!;
    await storage.snapshots.save(snapshot);
    if (kind === 'rule') await storage.ruleSets.delete(fixture.rules.id);
    if (kind === 'question') await storage.questions.delete([fixture.sources[0]!.id]);
    if (kind === 'changed')
      await storage.questions.upsertMany([{ ...fixture.sources[0]!, stem: [para('가짜 바뀐 본문')] }]);
    await expect(
      exporter.export({ ...request, examTypes: 'both', source: { historyExamIds: [snapshot.examId] } }),
    ).rejects.toThrow(
      kind === 'rule'
        ? '출제 규칙을 찾을 수 없어'
        : kind === 'question'
          ? '원본 문제가 삭제'
          : '시험을 다시 만들어',
    );
    expect(await storage.snapshots.get(`${snapshot.examId}-even`)).toBeUndefined();
  });

  it('짝수형 저장 실패와 파일 생성 도중 실패를 숨기지 않는다', async () => {
    const { exporter } = services();
    const save = vi
      .spyOn(storage.snapshots, 'save')
      .mockRejectedValueOnce(new Error('가짜 확정본 저장 실패'));
    await expect(exporter.export({ ...request, examTypes: 'both' })).rejects.toThrow('가짜 확정본 저장 실패');
    save.mockRestore();
    const original = docxExporter.export.bind(docxExporter);
    vi.spyOn(docxExporter, 'export')
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(new Error('가짜 파일 생성 실패'));
    await expect(exporter.export({ ...request, examTypes: 'both', formats: ['docx'] })).rejects.toThrow(
      '가짜 파일 생성 실패',
    );
    expect(readdirSync(folder)).toHaveLength(3);
    expect(await storage.history.list()).toEqual([]);
  });

  it('세션은 생성 당시 후보를 사용하므로 은행 수정 뒤에도 원본 내용을 보존한다', async () => {
    const generate = createGenerateService(storage, {
      now: () => '2026-01-01T00:00:00Z',
      getRules: async () => ({ ...fixture.rules, slots: [{ ...fixture.rules.slots[0]!, count: 20 }] }),
    });
    const run = await generate.generate({ ruleSetId: fixture.rules.id, seed: 'fake-session' });
    const snapshot = run.snapshots[0]!;
    const source = fixture.sources.find((question) =>
      snapshot.items.some((item) => item.sourceQuestionId === question.id),
    )!;
    await storage.questions.upsertMany([{ ...source, stem: [para('가짜 수정')] }]);
    const even = generate.session(run.sessionId).deriveEvenType(snapshot);
    expect(even.items.find((item) => item.sourceQuestionId === source.id)?.stem).toEqual(source.stem);
    expect(() =>
      generate
        .session(run.sessionId)
        .deriveEvenType({ ...snapshot, items: [{ ...snapshot.items[0]!, sourceQuestionId: 'missing' }] }),
    ).toThrow('시험을 다시 만들어');
    const replaced = generate.replace({
      sessionId: run.sessionId,
      examIndex: 0,
      number: snapshot.items.find((item) => !item.blank)!.number,
    });
    expect(replaced.snapshots[0]!.examId).not.toBe(snapshot.examId);
    expect(replaced.savedExamIds).toEqual([]);
    expect(
      generate
        .session(run.sessionId)
        .deriveEvenType(replaced.snapshots[0]!)
        .items.map((item) => item.sourceQuestionId)
        .sort(),
    ).toEqual(replaced.snapshots[0]!.items.map((item) => item.sourceQuestionId).sort());
  });
});
