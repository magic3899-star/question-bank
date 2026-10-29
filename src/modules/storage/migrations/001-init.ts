import type { Migration } from '../types';

export const initialMigration: Migration = {
  version: 1,
  up(db) {
    db.exec(`
      CREATE TABLE passage_groups (id TEXT PRIMARY KEY, body_json TEXT NOT NULL);
      CREATE TABLE questions (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        type TEXT NOT NULL,
        objective_code TEXT,
        passage_group_id TEXT,
        source_tag TEXT,
        search_text TEXT NOT NULL,
        body_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX questions_subject ON questions(subject);
      CREATE INDEX questions_type ON questions(type);
      CREATE INDEX questions_objective ON questions(objective_code);
      CREATE INDEX questions_passage_group ON questions(passage_group_id);
      CREATE INDEX questions_source_tag ON questions(source_tag);
      CREATE TABLE assets (id TEXT PRIMARY KEY, body_json TEXT NOT NULL);
      CREATE TABLE rule_sets (id TEXT PRIMARY KEY, subject TEXT NOT NULL, body_json TEXT NOT NULL);
      CREATE INDEX rule_sets_subject ON rule_sets(subject);
      CREATE TABLE history_entries (
        exam_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, body_json TEXT NOT NULL
      );
      CREATE INDEX history_created ON history_entries(created_at DESC, exam_id);
      CREATE TABLE history_questions (
        exam_id TEXT NOT NULL REFERENCES history_entries(exam_id) ON DELETE CASCADE,
        question_id TEXT NOT NULL,
        PRIMARY KEY (exam_id, question_id)
      );
      CREATE INDEX history_question ON history_questions(question_id);
      CREATE TABLE snapshots (
        exam_id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL,
        subject TEXT NOT NULL, seed TEXT NOT NULL, body_json TEXT NOT NULL
      );
      CREATE INDEX snapshots_created ON snapshots(created_at DESC, exam_id);
    `);
  },
};
