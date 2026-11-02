import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStorage } from '../../../modules/storage/index';
import type { Storage } from '../../../modules/storage/index';
import { makeExamBank, makeExamRules } from '../../../../tests/fixtures/examBank';
import { defaultSettings } from '../settings';
import type { Settings } from '../../shared/index';
import { createRulesService } from './rules';
import { createGenerateService } from './generate';
import { createExportService } from './export';
import { createBackupService } from './backup';

const shuffle = {
  shuffleQuestionOrder: true,
  shuffleChoices: true,
  balanceAnswerPositions: true,
  minAnswerPositionShare: 0.1,
};
let storage: Storage;
let dir: string;
let settings: Settings;
const settingsService = {
  get: () => settings,
  update: (partial: Partial<Settings>) => (settings = { ...settings, ...partial }),
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'qb-exam-'));
  storage = openStorage(join(dir, 'bank.sqlite'));
  settings = structuredClone(defaultSettings);
  const bank = makeExamBank();
  for (const asset of Object.values(bank.assets)) await storage.assets.put(asset);
  await storage.questions.upsertMany(bank.questions);
});
afterEach(() => {
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

function services() {
  const rules = createRulesService(storage, () => settings);
  const generate = createGenerateService(storage, {
    now: () => '2026-11-02T00:00:00.000Z',
    randomSeed: () => 'SEED1',
    getRules: (id) => rules.get(id),
  });
  const exporter = createExportService(storage, {
    renderPdf: async () => new TextEncoder().encode('%PDF-가짜'),
    pickFolder: async () => join(dir, 'out'),
    defaultFolder: () => dir,
    settings: settingsService,
    session: (id) => generate.session(id),
    subjectName: (s) => s,
    ruleName: async (id) => (await storage.ruleSets.get(id))?.name ?? id,
  });
  return { rules, generate, exporter };
}

describe('출제 규칙 서비스', () => {
  it('처음 열면 기본 규칙(법규·구강해부학)을 저장한다', async () => {
    const list = await services().rules.list();
    expect(list.map((r) => r.id).sort()).toEqual(['anatomy', 'law']);
    expect(list.find((r) => r.id === 'law')!.questionsPerExam).toBe(20);
  });

  it('오류가 있는 규칙은 저장하지 않고 한국어로 알린다', async () => {
    const bad = { ...makeExamRules('law'), slots: [] };
    await expect(services().rules.save(bad)).rejects.toThrow(/슬롯/u);
  });

  it('사전 점검은 슬롯별 필요 수·가능 수·서로 다른 중단원 수를 돌려준다', async () => {
    const check = await services().rules.check(makeExamRules('law'));
    expect(check.slots).toHaveLength(3);
    expect(check.slots[0]).toMatchObject({ perExam: 5, required: 20, available: 50 });
    expect(check.slots[0]!.distinctSegments).toBe(10);
    expect(check.description.length).toBeGreaterThan(0);
  });
});

describe('시험 만들기·저장·이력', () => {
  it('생성 → 문제 바꾸기 → 회차 다시 뽑기 → 저장 → 이력 기록(한 번만) → 이력에서 다시 저장', async () => {
    const { rules, generate, exporter } = services();
    await rules.save(makeExamRules('law'));
    const session = await generate.generate({ ruleSetId: 'fake-rules-law', shuffle });
    expect(session.seed).toBe('SEED1');
    expect(session.snapshots).toHaveLength(4);
    const target = session.snapshots[0]!.items.find((item) => !item.blank)!;
    const replaced = generate.replace({ sessionId: session.sessionId, examIndex: 0, number: target.number });
    expect(
      replaced.snapshots[0]!.items.find((item) => item.number === target.number)!.sourceQuestionId,
    ).not.toBe(target.sourceQuestionId);
    const regenerated = generate.regenerate({ sessionId: session.sessionId, examIndex: 3 });
    expect(regenerated.snapshots[3]!.examId).toBe(session.snapshots[3]!.examId);

    const result = await exporter.export(
      {
        source: { sessionId: session.sessionId },
        examIndexes: [0, 1],
        formats: ['pdf', 'docx', 'xlsx'],
        parts: ['questions', 'answers'],
        combineParts: false,
      },
      undefined,
    );
    expect(result!.files).toHaveLength(2 * 3 * 2);
    expect(result!.files.every((file) => existsSync(file.path))).toBe(true);
    expect(settings.defaultSaveDir).toBe(join(dir, 'out'));
    expect((await storage.history.list()).length).toBe(2);

    const again = await exporter.export({
      source: { sessionId: session.sessionId },
      examIndexes: [0],
      formats: ['docx'],
      parts: ['questions'],
      combineParts: false,
    });
    expect((await storage.history.list()).length).toBe(2);
    expect(again!.files[0]!.path).toMatch(/-2\.docx$/u);
    expect(readdirSync(join(dir, 'out')).length).toBe(13);

    const history = await exporter.historyList({});
    expect(history.total).toBe(2);
    expect(history.items[0]!.questionCount).toBeGreaterThan(0);
    const reexport = await exporter.export({
      source: { historyExamIds: [history.items[0]!.examId] },
      formats: ['xlsx'],
      parts: ['answers'],
      combineParts: false,
    });
    expect(reexport!.files).toHaveLength(1);
    await exporter.historyDelete([history.items[0]!.examId]);
    expect((await exporter.historyList({})).total).toBe(1);
  });

  it('저장한 파일·폴더만 열 수 있다', async () => {
    const { exporter } = services();
    expect(() => exporter.isAllowedPath('C:/Windows/notepad.exe')).toThrow('이번에 저장한');
  });

  it('최근 N회 제외는 이전 이력의 문제를 다시 쓰지 않는다', async () => {
    const { rules, generate, exporter } = services();
    await rules.save(makeExamRules('law'));
    const first = await generate.generate({ ruleSetId: 'fake-rules-law', shuffle, seed: 'A' });
    await exporter.export({
      source: { sessionId: first.sessionId },
      formats: ['docx'],
      parts: ['questions'],
      combineParts: false,
    });
    const used = new Set(first.snapshots.flatMap((s) => s.items.map((i) => i.sourceQuestionId)));
    const second = await generate.generate({
      ruleSetId: 'fake-rules-law',
      shuffle,
      seed: 'B',
      excludeRecentExams: 4,
    });
    const reused = second.snapshots
      .flatMap((s) => s.items)
      .filter((i) => !i.blank && used.has(i.sourceQuestionId));
    expect(reused).toEqual([]);
  });

  it('잘못된 요청은 한국어 오류', async () => {
    const { generate, exporter } = services();
    await expect(generate.generate({ ruleSetId: '없는-규칙', shuffle })).rejects.toThrow('찾을 수 없습니다');
    expect(() => generate.get('없는-세션')).toThrow('다시 만드세요');
    await expect(exporter.export({ source: { sessionId: 'x' }, formats: [], parts: [] })).rejects.toThrow(
      '형식',
    );
  });
});

describe('백업', () => {
  it('수동 백업과 하루 한 번 자동 백업, 복원용 경로 검증', async () => {
    let clock = '2026-11-02T00:00:00.000Z';
    const backup = createBackupService(storage, {
      backupsDir: join(dir, 'backups'),
      dbPath: join(dir, 'bank.sqlite'),
      now: () => clock,
    });
    const manual = await backup.create();
    expect(manual.kind).toBe('manual');
    expect(await backup.autoBackupIfDue()).toBeDefined();
    clock = '2026-11-02T05:00:00.000Z';
    expect(await backup.autoBackupIfDue()).toBeUndefined();
    expect(backup.list().length).toBe(2);
    expect(backup.resolve(manual.name)).toContain(manual.name);
    expect(() => backup.resolve('../bank.sqlite')).toThrow('찾을 수 없습니다');
  });
});
