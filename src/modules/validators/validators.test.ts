import { expect, it } from 'vitest';
import type { Validator } from '../../contracts/index';
import { makeQuestion } from '../../../tests/fixtures/builders';
import { runValidators, standardValidators } from './index';

it('모든 검수 플러그인은 고유한 ID와 한국어 이름을 가진다', () => {
  expect(standardValidators).toHaveLength(10);
  expect(new Set(standardValidators.map((v) => v.id)).size).toBe(10);
  expect(standardValidators.every((v) => v.kind === 'validator' && v.label)).toBe(true);
  expect(runValidators(standardValidators, [])).toEqual([]);
});

it('문제별·전체 진단에 ref를 보충하고 심각도 순으로 안정 정렬하며 입력을 바꾸지 않는다', () => {
  const validator: Validator = {
    kind: 'validator',
    id: 'dummy',
    label: '가짜 검사',
    validate: () => [
      { code: 'I', severity: 'info', message: '가짜 정보' },
      { code: 'W', severity: 'warn', message: '가짜 경고' },
      { code: 'E', severity: 'error', message: '가짜 오류' },
    ],
    validateAll: () => [
      { code: 'ALL', severity: 'warn', message: '가짜 전체 경고', ref: { draftIndex: 1 } },
      { code: 'GLOBAL', severity: 'info', message: '가짜 분포' },
    ],
  };
  const questions = [makeQuestion({ id: 'first' }), makeQuestion({ id: 'second' })];
  const before = JSON.stringify(questions);
  const diagnostics = runValidators([validator], questions);
  expect(diagnostics.map((d) => d.code)).toEqual(['E', 'E', 'W', 'W', 'ALL', 'I', 'I', 'GLOBAL']);
  expect(diagnostics[0].ref).toEqual({ questionId: 'first', draftIndex: 0 });
  expect(diagnostics[4].ref).toMatchObject({ questionId: 'second', draftIndex: 1 });
  expect(diagnostics.at(-1)?.ref?.draftIndex).toBeUndefined();
  expect(JSON.stringify(questions)).toBe(before);
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = questions[0];
  expect(runValidators([validator], [draft])[0].ref?.questionId).toBeUndefined();
});
