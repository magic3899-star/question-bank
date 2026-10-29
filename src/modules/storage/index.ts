import Database from 'better-sqlite3';
import type {
  AssetData, ExamSnapshot, HistoryEntry, PassageGroup, Question, QuestionQuery, RuleSet,
} from '../../contracts/index';
import { blocksToPlainText } from '../content-model/index';
import { initialMigration } from './migrations/001-init';
import type { Migration, Storage, StorageOptions } from './types';

export type { Migration, Storage, StorageOptions } from './types';
export const defaultMigrations: readonly Migration[] = [initialMigration];

class StorageSetupError extends Error {}

interface JsonRow { body_json: string }
type SqlValue = string | number;

function nonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} 값이 올바르지 않습니다. 0 이상의 안전한 정수를 입력하세요.`);
  }
}

function queryFilter(query: QuestionQuery): { sql: string; params: SqlValue[] } {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  const add = (clause: string, value: SqlValue): void => {
    clauses.push(clause);
    params.push(value);
  };
  const escapedLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');
  if (query.subject !== undefined) add('subject = ?', query.subject);
  if (query.objectivePrefix !== undefined) {
    add("objective_code LIKE ? ESCAPE '\\'", `${escapedLike(query.objectivePrefix)}%`);
  }
  if (query.tag !== undefined) {
    add("EXISTS (SELECT 1 FROM json_each(questions.body_json, '$.tags') WHERE value = ?)", query.tag);
  }
  if (query.text !== undefined) add("search_text LIKE ? ESCAPE '\\'", `%${escapedLike(query.text)}%`);
  if (query.hasObjective !== undefined) {
    clauses.push(query.hasObjective
      ? "(objective_code IS NOT NULL AND trim(objective_code) <> '')"
      : "(objective_code IS NULL OR trim(objective_code) = '')");
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
}

export function openStorage(dbPath: string, opts?: StorageOptions): Storage {
  let db: Database.Database;
  try {
    db = new Database(dbPath);
  } catch (cause) {
    throw new Error('저장소를 열 수 없습니다. DB 경로와 파일 접근 권한을 확인하세요.', { cause });
  }
  const version = (): number => db.pragma('user_version', { simple: true }) as number;
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    const migrations = [...defaultMigrations, ...(opts?.migrations ?? [])].sort((a, b) => a.version - b.version);
    if (migrations.some((migration, index) => index > 0 && migration.version === migrations[index - 1].version)) {
      throw new StorageSetupError('마이그레이션 번호가 중복되었습니다. 기본 버전 이후의 새 버전만 지정하세요.');
    }
    if (migrations.some((migration, index) => migration.version !== index + 1)) {
      throw new StorageSetupError('마이그레이션 번호가 연속적이지 않습니다. 기본 버전 이후 번호를 누락 없이 지정하세요.');
    }
    const fromVersion = version();
    const toVersion = migrations.at(-1)?.version ?? 0;
    if (fromVersion > toVersion) {
      throw new StorageSetupError('DB 버전이 프로그램보다 높습니다. 최신 프로그램으로 저장소를 여세요.');
    }
    const pending = migrations.filter((migration) => migration.version > fromVersion);
    if (pending.length) {
      const tables = db.prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*'",
      ).all();
      const hasData = tables.some(({ name }) =>
        db.prepare(`SELECT 1 FROM "${name.replaceAll('"', '""')}" LIMIT 1`).get() !== undefined);
      if (hasData && opts?.beforeMigrate) {
        try { opts.beforeMigrate({ fromVersion, toVersion }); } catch (cause) {
          throw new StorageSetupError('백업 콜백에 실패했습니다. 백업 경로와 권한을 확인한 뒤 다시 여세요.', { cause });
        }
      }
      try {
        db.transaction(() => {
          for (const migration of pending) {
            migration.up(db);
            db.pragma(`user_version = ${migration.version}`);
          }
        }).immediate();
      } catch (cause) {
        throw new StorageSetupError('마이그레이션에 실패하여 변경을 취소했습니다. 백업과 마이그레이션 설정을 확인하세요.', { cause });
      }
    }
  } catch (cause) {
    db.close();
    if (cause instanceof StorageSetupError) throw cause;
    throw new Error('저장소 초기화 또는 마이그레이션에 실패했습니다. DB 백업과 마이그레이션 설정을 확인하세요.', { cause });
  }

  const perform = async <T>(label: string, action: () => T): Promise<T> => {
    try { return action(); } catch (cause) {
      throw new Error(`${label} 저장소 작업에 실패했습니다. 데이터 형식과 DB 연결 상태를 확인하세요.`, { cause });
    }
  };
  const getJson = <T>(table: string, key: string, id: string): T | undefined => {
    const row = db.prepare<[string], JsonRow>(`SELECT body_json FROM ${table} WHERE ${key} = ?`).get(id);
    return row ? JSON.parse(row.body_json) as T : undefined;
  };
  const putJson = (table: string, id: string, value: unknown): void => {
    db.prepare(`INSERT INTO ${table} (id, body_json) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET body_json = excluded.body_json`).run(id, JSON.stringify(value));
  };
  const limited = (limit?: number): number => {
    if (limit === undefined) return -1;
    nonNegativeInteger(limit, '조회 개수');
    return limit;
  };

  return {
    questions: {
      upsertMany: (questions) => perform('문제 저장', () => db.transaction(() => {
        const statement = db.prepare(`INSERT INTO questions
          (id, subject, type, objective_code, passage_group_id, source_tag, search_text, body_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET subject=excluded.subject, type=excluded.type,
          objective_code=excluded.objective_code, passage_group_id=excluded.passage_group_id,
          source_tag=excluded.source_tag, search_text=excluded.search_text, body_json=excluded.body_json,
          created_at=excluded.created_at, updated_at=excluded.updated_at`);
        for (const question of questions) {
          const searchText = [
            blocksToPlainText(question.passage ?? []), blocksToPlainText(question.stem),
            ...question.choices.map((choice) => blocksToPlainText(choice.content)),
            blocksToPlainText(question.explanation), question.objectiveCode ?? '',
            question.sourceTag ?? '', ...question.tags,
          ].join('\n');
          statement.run(question.id, question.subject, question.type, question.objectiveCode ?? null,
            question.passageGroupId ?? null, question.sourceTag ?? null, searchText,
            JSON.stringify(question), question.createdAt, question.updatedAt);
        }
      })()),
      get: (id) => perform('문제 조회', () => getJson<Question>('questions', 'id', id)),
      query: (query) => perform('문제 검색', () => {
        const filter = queryFilter(query);
        const limit = limited(query.limit);
        const offset = query.offset ?? 0;
        nonNegativeInteger(offset, '조회 시작 위치');
        return db.prepare<SqlValue[], JsonRow>(`SELECT body_json FROM questions${filter.sql}
          ORDER BY id LIMIT ? OFFSET ?`).all(...filter.params, limit, offset)
          .map((row) => JSON.parse(row.body_json) as Question);
      }),
      count: (query = {}) => perform('문제 개수 조회', () => {
        limited(query.limit);
        if (query.offset !== undefined) nonNegativeInteger(query.offset, '조회 시작 위치');
        const filter = queryFilter(query);
        return db.prepare<SqlValue[], { count: number }>(
          `SELECT count(*) AS count FROM questions${filter.sql}`,
        ).get(...filter.params)!.count;
      }),
      delete: (ids) => perform('문제 삭제', () => db.transaction(() => {
        const statement = db.prepare('DELETE FROM questions WHERE id = ?');
        for (const id of ids) statement.run(id);
      })()),
    },
    assets: {
      put: (asset) => perform('이미지 저장', () => putJson('assets', asset.id, asset)),
      get: (id) => perform('이미지 조회', () => getJson<AssetData>('assets', 'id', id)),
    },
    passageGroups: {
      upsertMany: (groups) => perform('지문 묶음 저장', () => db.transaction(() => {
        for (const group of groups) putJson('passage_groups', group.id, group);
      })()),
      get: (id) => perform('지문 묶음 조회', () => getJson<PassageGroup>('passage_groups', 'id', id)),
    },
    ruleSets: {
      save: (rules) => perform('규칙 저장', () => {
        db.prepare(`INSERT INTO rule_sets (id, subject, body_json) VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET subject=excluded.subject, body_json=excluded.body_json`)
          .run(rules.id, rules.subject, JSON.stringify(rules));
      }),
      get: (id) => perform('규칙 조회', () => getJson<RuleSet>('rule_sets', 'id', id)),
      list: (subject) => perform('규칙 목록 조회', () => db.prepare<SqlValue[], JsonRow>(
        `SELECT body_json FROM rule_sets${subject === undefined ? '' : ' WHERE subject = ?'} ORDER BY id`,
      ).all(...(subject === undefined ? [] : [subject])).map((row) => JSON.parse(row.body_json) as RuleSet)),
      delete: (id) => perform('규칙 삭제', () => { db.prepare('DELETE FROM rule_sets WHERE id = ?').run(id); }),
    },
    history: {
      record: (entry) => perform('출제 이력 저장', () => db.transaction(() => {
        db.prepare(`INSERT INTO history_entries (exam_id, created_at, body_json) VALUES (?, ?, ?)
          ON CONFLICT(exam_id) DO UPDATE SET created_at=excluded.created_at, body_json=excluded.body_json`)
          .run(entry.examId, entry.createdAt, JSON.stringify(entry));
        db.prepare('DELETE FROM history_questions WHERE exam_id = ?').run(entry.examId);
        const statement = db.prepare('INSERT INTO history_questions (exam_id, question_id) VALUES (?, ?)');
        for (const id of new Set(entry.questionIds)) statement.run(entry.examId, id);
      })()),
      list: (limit) => perform('출제 이력 조회', () => db.prepare<[number], JsonRow>(
        'SELECT body_json FROM history_entries ORDER BY created_at DESC, exam_id LIMIT ?',
      ).all(limited(limit)).map((row) => JSON.parse(row.body_json) as HistoryEntry)),
      recentQuestionIds: (lastNExams, subject) => perform('최근 출제 문제 조회', () => {
        nonNegativeInteger(lastNExams, '최근 시험 개수');
        // 삭제된 문제의 이력도 보존하되 과목 필터가 있으면 현재 문제 정보로 판별한다.
        const rows = db.prepare<SqlValue[], { question_id: string }>(`
          SELECT DISTINCT hq.question_id FROM history_questions hq
          ${subject === undefined ? '' : 'JOIN questions q ON q.id = hq.question_id'}
          WHERE hq.exam_id IN (
            SELECT exam_id FROM history_entries ORDER BY created_at DESC, exam_id LIMIT ?
          ) ${subject === undefined ? '' : 'AND q.subject = ?'} ORDER BY hq.question_id
        `).all(...(subject === undefined ? [lastNExams] : [lastNExams, subject]));
        return new Set(rows.map((row) => row.question_id));
      }),
    },
    snapshots: {
      save: (snapshot) => perform('확정본 저장', () => {
        db.prepare(`INSERT INTO snapshots (exam_id, title, created_at, subject, seed, body_json)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(exam_id) DO UPDATE SET
          title=excluded.title, created_at=excluded.created_at, subject=excluded.subject,
          seed=excluded.seed, body_json=excluded.body_json`).run(snapshot.examId, snapshot.title,
          snapshot.createdAt, snapshot.subject, snapshot.seed, JSON.stringify(snapshot));
      }),
      get: (id) => perform('확정본 조회', () => getJson<ExamSnapshot>('snapshots', 'exam_id', id)),
      list: (limit) => perform('확정본 목록 조회', () => db.prepare<[number],
        Pick<ExamSnapshot, 'examId' | 'title' | 'createdAt' | 'subject' | 'seed'>>(`
          SELECT exam_id AS examId, title, created_at AS createdAt, subject, seed
          FROM snapshots ORDER BY created_at DESC, exam_id LIMIT ?
        `).all(limited(limit))),
    },
    close: () => { if (db.open) db.close(); },
    schemaVersion: () => {
      try { return version(); } catch (cause) {
        throw new Error('DB 버전을 조회할 수 없습니다. 저장소를 연 뒤 다시 조회하세요.', { cause });
      }
    },
  };
}
