import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetData, Block, ExamSnapshot, PassageGroup } from '../../contracts/index';
import { makeHistoryEntry, makeQuestion, makeRuleSet, para } from '../../../tests/fixtures/builders';
import { openStorage } from './index';
import type { Migration, Storage, StorageOptions } from './index';

const connections: Storage[] = [];
const directories: string[] = [];
function open(path = ':memory:', options?: StorageOptions): Storage {
  const storage = openStorage(path, options);
  connections.push(storage);
  return storage;
}
function filePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'question-bank-test-'));
  directories.push(directory);
  return join(directory, 'bank.sqlite');
}
afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const blocks: Block[] = [
  para('가짜 밑줄 문장', { underline: true }),
  { type: 'table', rows: [[[para('가짜 셀'), {
    type: 'table', rows: [[[para('가짜 중첩', { bold: true, underline: true })], [{ type: 'image', assetId: 'asset-1' }]]],
  }]]] },
];
const asset: AssetData = { id: 'asset-1', mime: 'image/png', sha256: 'dummy-hash', dataBase64: 'ZHVtbXk=' };
const snapshot = (overrides: Partial<ExamSnapshot> = {}): ExamSnapshot => ({
  schemaVersion: 1, examId: 'exam-1', title: '가짜 시험 1', subject: 'dummy',
  createdAt: '2026-01-01T00:00:00.000Z', seed: 'dummy-seed', ruleSetId: 'rules-1', ruleSetVersion: 1,
  items: [{ number: 1, sourceQuestionId: 'question-1', stem: blocks, passage: blocks,
    choices: [{ label: '①', sourceChoiceId: 'choice-1', content: blocks }], answerLabels: ['①'], explanation: blocks }],
  assets: { [asset.id]: asset }, contentHash: 'dummy-content-hash', ...overrides,
});

describe('SQLite 저장소', () => {
  it('문제 CRUD에서 블록, 밑줄, 중첩 표와 확장 필드를 그대로 왕복한다', async () => {
    const storage = open();
    const question = makeQuestion({ stem: blocks, passage: blocks, explanation: blocks,
      choices: [{ id: 'choice-1', content: blocks }], passageGroupId: 'group-1',
      extra: { future: { dummy: ['가짜 확장 필드'] } } });
    await storage.questions.upsertMany([question]);
    expect(await storage.questions.get(question.id)).toEqual(question);
    expect(await storage.questions.query({})).toEqual([question]);
    const read = (await storage.questions.get(question.id))!;
    read.tags.push('가짜 변경');
    expect(await storage.questions.get(question.id)).toEqual(question);
    const updated = { ...question, subject: 'other', stem: [para('가짜 수정 문장')], updatedAt: '2026-02-01T00:00:00.000Z' };
    await storage.questions.upsertMany([updated]);
    expect(await storage.questions.count()).toBe(1);
    expect(await storage.questions.get(question.id)).toEqual(updated);
    expect(await storage.questions.query({ text: '가짜 수정 문장', subject: 'other' })).toEqual([updated]);
    await storage.questions.delete(['missing', question.id]);
    expect(await storage.questions.get(question.id)).toBeUndefined();
    expect(await storage.questions.count()).toBe(0);
    await storage.questions.delete([]);
    await storage.questions.upsertMany([]);
  });

  it('에셋과 지문 묶음을 저장하고 덮어쓴다', async () => {
    const storage = open();
    const group: PassageGroup = { id: 'group-1', subject: 'dummy', content: blocks };
    expect(await storage.assets.get('missing')).toBeUndefined();
    expect(await storage.passageGroups.get('missing')).toBeUndefined();
    await storage.assets.put(asset);
    await storage.passageGroups.upsertMany([group]);
    expect(await storage.assets.get(asset.id)).toEqual(asset);
    expect(await storage.passageGroups.get(group.id)).toEqual(group);
    const changedAsset = { ...asset, dataBase64: 'YWJj', sha256: 'changed' };
    const changedGroup = { ...group, subject: 'other', content: [para('가짜 수정 지문')] };
    await storage.assets.put(changedAsset);
    await storage.passageGroups.upsertMany([changedGroup]);
    expect(await storage.assets.get(asset.id)).toEqual(changedAsset);
    expect(await storage.passageGroups.get(group.id)).toEqual(changedGroup);
  });

  it('규칙 CRUD와 과목 목록을 지원한다', async () => {
    const storage = open();
    const rule = makeRuleSet();
    const other = makeRuleSet({ id: 'rules-2', subject: 'other' });
    expect(await storage.ruleSets.get('missing')).toBeUndefined();
    expect(await storage.ruleSets.list()).toEqual([]);
    await storage.ruleSets.save(rule);
    await storage.ruleSets.save(other);
    expect(await storage.ruleSets.get(rule.id)).toEqual(rule);
    expect(await storage.ruleSets.list()).toEqual([rule, other]);
    expect(await storage.ruleSets.list('dummy')).toEqual([rule]);
    const updated = { ...rule, name: '가짜 수정 규칙', subject: 'other' };
    await storage.ruleSets.save(updated);
    expect(await storage.ruleSets.list('dummy')).toEqual([]);
    expect(await storage.ruleSets.get(rule.id)).toEqual(updated);
    await storage.ruleSets.delete(rule.id);
    await storage.ruleSets.delete('missing');
    expect(await storage.ruleSets.get(rule.id)).toBeUndefined();
  });

  it('확정본 전체와 목록용 메타데이터를 보존한다', async () => {
    const storage = open();
    expect(await storage.snapshots.get('missing')).toBeUndefined();
    const first = snapshot();
    const second = snapshot({ examId: 'exam-2', createdAt: '2026-02-01T00:00:00.000Z' });
    await storage.snapshots.save(first);
    await storage.snapshots.save(second);
    expect(await storage.snapshots.get(first.examId)).toEqual(first);
    expect(await storage.snapshots.list(1)).toEqual([{
      examId: second.examId, createdAt: second.createdAt, subject: second.subject, seed: second.seed, title: second.title,
    }]);
    expect(await storage.snapshots.list()).toHaveLength(2);
    expect(await storage.snapshots.list(0)).toEqual([]);
    await storage.snapshots.save({ ...first, title: '가짜 수정 시험' });
    expect((await storage.snapshots.get(first.examId))?.title).toBe('가짜 수정 시험');
  });

  it('일괄 저장 중 실패하면 앞서 저장한 문제까지 롤백한다', async () => {
    const storage = open();
    const extra: Record<string, unknown> = {};
    extra.circular = extra;
    await expect(storage.questions.upsertMany([
      makeQuestion({ id: 'first' }), makeQuestion({ id: 'second', extra }),
    ])).rejects.toThrow('데이터 형식');
    expect(await storage.questions.count()).toBe(0);
  });

  it('닫은 연결 사용에 한국어 오류를 내고 close는 여러 번 호출할 수 있다', async () => {
    const storage = open();
    storage.close();
    storage.close();
    await expect(storage.questions.get('question-1')).rejects.toThrow('연결 상태');
    expect(() => storage.schemaVersion()).toThrow('저장소를 연 뒤 다시 조회하세요');
  });
});

describe('문제 쿼리', () => {
  it('모든 필터를 단독·결합하여 지원하고 페이지 순서를 고정한다', async () => {
    const storage = open();
    const questions = [
      makeQuestion({ id: 'q1', subject: 'a', objectiveCode: '가짜목표 1-1', tags: ['공통', '전용'] }),
      makeQuestion({ id: 'q2', subject: 'a', objectiveCode: '가짜목표 1-2', tags: ['공통'], stem: blocks }),
      makeQuestion({ id: 'q3', subject: 'b', objectiveCode: undefined, tags: [] }),
      makeQuestion({ id: 'q4', subject: 'b', objectiveCode: '', tags: ['전용'] }),
      makeQuestion({ id: 'q5', subject: 'b', objectiveCode: '   ', tags: [] }),
    ];
    await storage.questions.upsertMany([...questions].reverse());
    const ids = async (query: Parameters<Storage['questions']['query']>[0]) =>
      (await storage.questions.query(query)).map(({ id }) => id);
    expect(await ids({ subject: 'a' })).toEqual(['q1', 'q2']);
    expect(await ids({ objectivePrefix: '가짜목표 1-' })).toEqual(['q1', 'q2']);
    expect(await ids({ objectivePrefix: '가짜목표 1-2' })).toEqual(['q2']);
    expect(await ids({ tag: '전용' })).toEqual(['q1', 'q4']);
    expect(await ids({ tag: '전' })).toEqual([]);
    expect(await ids({ text: '가짜 중첩' })).toEqual(['q2']);
    expect(await ids({ hasObjective: true })).toEqual(['q1', 'q2']);
    expect(await ids({ hasObjective: false })).toEqual(['q3', 'q4', 'q5']);
    expect(await ids({ subject: 'a', objectivePrefix: '가짜목표', tag: '공통', text: '가짜 밑줄', hasObjective: true, limit: 1, offset: 0 })).toEqual(['q2']);
    expect(await ids({ limit: 2, offset: 1 })).toEqual(['q2', 'q3']);
    expect(await ids({ offset: 3 })).toEqual(['q4', 'q5']);
    expect(await ids({ limit: 0 })).toEqual([]);
    expect(await ids({ offset: 100 })).toEqual([]);
    expect(await storage.questions.count({ subject: 'a', limit: 1, offset: 10 })).toBe(2);
    expect(await storage.questions.count({ hasObjective: false })).toBe(3);
  });

  it('검색용 내용 전체와 LIKE 특수문자를 리터럴로 검색한다', async () => {
    const storage = open();
    await storage.questions.upsertMany([
      makeQuestion({ id: 'q1', stem: [para("가짜 100%_\\' 문장")], objectiveCode: '가짜_%', sourceTag: '가짜출처' }),
      makeQuestion({ id: 'q2', stem: [para('가짜 100abc 문장')], objectiveCode: '가짜abc' }),
    ]);
    for (const text of ["100%_\\'", '가짜출처']) {
      expect((await storage.questions.query({ text })).map(({ id }) => id)).toEqual(['q1']);
    }
    expect((await storage.questions.query({ objectivePrefix: '가짜_' })).map(({ id }) => id)).toEqual(['q1']);
    for (const text of ['가짜 지문', '가짜 선지', '가짜 해설']) {
      expect(await storage.questions.count({ text })).toBe(2);
    }
    expect(await storage.questions.query({ text: "' OR 1=1 --" })).toEqual([]);
  });

  it.each([-1, 1.5, NaN, Infinity])('잘못된 페이지 값 %s를 거부한다', async (value) => {
    const storage = open();
    await expect(storage.questions.query({ limit: value })).rejects.toThrow('저장소 작업');
    await expect(storage.questions.query({ offset: value })).rejects.toThrow('저장소 작업');
    await expect(storage.questions.count({ limit: value })).rejects.toThrow('저장소 작업');
    await expect(storage.questions.count({ offset: value })).rejects.toThrow('저장소 작업');
    await expect(storage.history.list(value)).rejects.toThrow('저장소 작업');
    await expect(storage.history.recentQuestionIds(value)).rejects.toThrow('저장소 작업');
    await expect(storage.snapshots.list(value)).rejects.toThrow('저장소 작업');
  });
});

describe('최근 출제 이력', () => {
  it('최근 N개 시험을 먼저 고르고 문제 조인으로 과목을 필터한다', async () => {
    const storage = open();
    await storage.questions.upsertMany([
      makeQuestion({ id: 'a1', subject: 'a' }), makeQuestion({ id: 'a2', subject: 'a' }),
      makeQuestion({ id: 'b1', subject: 'b' }),
    ]);
    const oldest = makeHistoryEntry({ examId: 'old', createdAt: '2026-01-01', questionIds: ['a1'] });
    const middle = makeHistoryEntry({ examId: 'middle', createdAt: '2026-02-01', questionIds: ['b1', 'a2', 'b1'] });
    const newest = makeHistoryEntry({ examId: 'new', createdAt: '2026-03-01', questionIds: ['b1', 'deleted'] });
    for (const entry of [middle, newest, oldest]) await storage.history.record(entry);
    expect(await storage.history.list()).toEqual([newest, middle, oldest]);
    expect(await storage.history.list(1)).toEqual([newest]);
    expect(await storage.history.list(0)).toEqual([]);
    expect(await storage.history.recentQuestionIds(0)).toEqual(new Set());
    expect(await storage.history.recentQuestionIds(1)).toEqual(new Set(['b1', 'deleted']));
    expect(await storage.history.recentQuestionIds(1, 'a')).toEqual(new Set());
    expect(await storage.history.recentQuestionIds(2, 'a')).toEqual(new Set(['a2']));
    expect(await storage.history.recentQuestionIds(10, 'a')).toEqual(new Set(['a1', 'a2']));
    await storage.questions.delete(['b1']);
    expect(await storage.history.recentQuestionIds(1)).toEqual(new Set(['b1', 'deleted']));
    expect(await storage.history.recentQuestionIds(1, 'b')).toEqual(new Set());
    const replacement = { ...newest, questionIds: ['a1'] };
    await storage.history.record(replacement);
    expect(await storage.history.list(1)).toEqual([replacement]);
    expect(await storage.history.recentQuestionIds(1)).toEqual(new Set(['a1']));
  });
});

describe('마이그레이션', () => {
  const version2: Migration = { version: 2, up: (db) => { db.exec('CREATE TABLE fake_v2 (id TEXT)'); } };

  it('최초 적용과 재오픈에서 데이터·인덱스·WAL을 보존한다', async () => {
    const path = filePath();
    const callback = vi.fn();
    const storage = open(path, { beforeMigrate: callback });
    expect(storage.schemaVersion()).toBe(1);
    expect(callback).not.toHaveBeenCalled();
    const question = makeQuestion({ stem: blocks });
    await storage.questions.upsertMany([question]);
    await storage.assets.put(asset);
    await storage.ruleSets.save(makeRuleSet());
    await storage.passageGroups.upsertMany([{ id: 'group-1', subject: 'dummy', content: blocks }]);
    const group = { id: 'group-1', subject: 'dummy', content: blocks };
    await storage.passageGroups.upsertMany([group]);
    await storage.history.record(makeHistoryEntry());
    await storage.snapshots.save(snapshot());
    storage.close();
    const reopened = open(path, { beforeMigrate: callback });
    expect(await reopened.questions.get(question.id)).toEqual(question);
    expect(await reopened.assets.get(asset.id)).toEqual(asset);
    expect(await reopened.passageGroups.get('group-1')).toEqual({ id: 'group-1', subject: 'dummy', content: blocks });
    expect(await reopened.passageGroups.get(group.id)).toEqual(group);
    expect(await reopened.ruleSets.get('rules-1')).toEqual(makeRuleSet());
    expect(await reopened.history.list()).toEqual([makeHistoryEntry()]);
    expect(await reopened.snapshots.get('exam-1')).toEqual(snapshot());
    expect(callback).not.toHaveBeenCalled();
    const raw = new Database(path);
    try {
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='questions_subject'").get()).toBeDefined();
    } finally { raw.close(); }
  });

  it('데이터가 있는 DB의 v2 적용 직전에 콜백을 부르고 데이터를 보존한다', async () => {
    const path = filePath();
    const storage = open(path);
    await storage.questions.upsertMany([makeQuestion()]);
    storage.close();
    const callback = vi.fn((info: { fromVersion: number; toVersion: number }) => {
      expect(info).toEqual({ fromVersion: 1, toVersion: 2 });
      const raw = new Database(path, { readonly: true });
      try {
        expect(raw.pragma('user_version', { simple: true })).toBe(1);
        expect(raw.prepare("SELECT name FROM sqlite_master WHERE name='fake_v2'").get()).toBeUndefined();
        expect(raw.prepare('SELECT count(*) AS total FROM questions').get()).toEqual({ total: 1 });
      } finally { raw.close(); }
    });
    const upgraded = open(path, { migrations: [version2], beforeMigrate: callback });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(upgraded.schemaVersion()).toBe(2);
    expect(await upgraded.questions.get('question-1')).toEqual(makeQuestion());
    upgraded.close();
    const reopened = open(path, { migrations: [version2], beforeMigrate: callback });
    expect(reopened.schemaVersion()).toBe(2);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('문제가 없어도 에셋 데이터가 있으면 콜백을 부르고 빈 DB에는 호출하지 않는다', async () => {
    const path = filePath();
    const storage = open(path);
    await storage.assets.put(asset);
    storage.close();
    const callback = vi.fn();
    const upgraded = open(path, { migrations: [version2], beforeMigrate: callback });
    expect(callback).toHaveBeenCalledWith({ fromVersion: 1, toVersion: 2 });
    expect(await upgraded.assets.get(asset.id)).toEqual(asset);
    const emptyCallback = vi.fn();
    expect(open(':memory:', { migrations: [version2], beforeMigrate: emptyCallback }).schemaVersion()).toBe(2);
    expect(emptyCallback).not.toHaveBeenCalled();
  });

  it('여러 마이그레이션 중 실패하면 스키마·내용·버전을 모두 롤백한다', async () => {
    const path = filePath();
    const storage = open(path);
    await storage.questions.upsertMany([makeQuestion()]);
    storage.close();
    const failure: Migration = { version: 3, up(db) {
      db.exec("UPDATE questions SET search_text = '가짜 손상'; DELETE FROM questions; CREATE TABLE fake_v3 (id TEXT)");
      throw new Error('가짜 마이그레이션 실패');
    } };
    const callback = vi.fn();
    expect(() => openStorage(path, { migrations: [version2, failure], beforeMigrate: callback })).toThrow('변경을 취소');
    expect(callback).toHaveBeenCalledWith({ fromVersion: 1, toVersion: 3 });
    const recovered = open(path);
    expect(recovered.schemaVersion()).toBe(1);
    expect(await recovered.questions.get('question-1')).toEqual(makeQuestion());
    const raw = new Database(path);
    try {
      expect(raw.prepare("SELECT name FROM sqlite_master WHERE name IN ('fake_v2', 'fake_v3')").all()).toEqual([]);
    } finally { raw.close(); }
  });

  it('콜백 실패 시 마이그레이션을 시작하지 않는다', async () => {
    const path = filePath();
    const storage = open(path);
    await storage.questions.upsertMany([makeQuestion()]);
    storage.close();
    expect(() => openStorage(path, { migrations: [version2], beforeMigrate() {
      throw new Error('가짜 백업 실패');
    } })).toThrow('백업 콜백');
    expect(open(path).schemaVersion()).toBe(1);
  });

  it('중복·누락 버전과 DB 다운그레이드를 거부한다', () => {
    expect(() => openStorage(':memory:', { migrations: [{ version: 1, up() {} }] })).toThrow('중복');
    expect(() => openStorage(':memory:', { migrations: [{ version: 3, up() {} }] })).toThrow('연속적');
    const path = filePath();
    open(path, { migrations: [version2] }).close();
    expect(() => openStorage(path)).toThrow('최신 프로그램');
  });

  it('활성 연결의 외래 키 설정으로 잘못된 이력 참조를 거부한다', () => {
    const migration: Migration = { version: 2, up(db) {
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(() => db.prepare('INSERT INTO history_questions VALUES (?, ?)').run('missing', 'dummy')).toThrow();
    } };
    expect(open(':memory:', { migrations: [migration] }).schemaVersion()).toBe(2);
  });

  it('신규 DB 초기화 중 실패해도 테이블과 버전을 함께 롤백한다', () => {
    const path = filePath();
    const failing: Migration = { version: 2, up(db) {
      db.exec('CREATE TABLE dummy_failure (id TEXT)');
      throw new Error('가짜 신규 DB 초기화 실패');
    } };
    expect(() => openStorage(path, { migrations: [failing] })).toThrow('변경을 취소');
    const raw = new Database(path);
    try {
      expect(raw.pragma('user_version', { simple: true })).toBe(0);
      expect(raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([]);
    } finally { raw.close(); }
    expect(open(path).schemaVersion()).toBe(1);
  });

  it('열 수 없는 DB 경로는 해결 방법을 포함한 한국어 오류로 알린다', () => {
    expect(() => openStorage(join(filePath(), 'missing', 'bank.sqlite'))).toThrow('DB 경로와 파일 접근 권한');
  });
});
