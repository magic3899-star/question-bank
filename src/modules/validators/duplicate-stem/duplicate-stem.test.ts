import { performance } from 'node:perf_hooks';
import { expect, it } from 'vitest';
import { makeQuestion, para } from '../../../../tests/fixtures/builders';
import { duplicateStemValidator as validator } from './index';

it('공백·전각공백·번호·대소문자를 정규화하고 선지 집합으로 완전 중복과 변형을 구분한다', () => {
  const first = makeQuestion({ id: 'q1', stem: [para('01. 가짜 TEST')] });
  const exact = makeQuestion({ id: 'q2', stem: [para('21. 가짜　test')] });
  exact.choices.reverse();
  const variant = makeQuestion({ id: 'q3', stem: [para('가짜test')] });
  variant.choices[0].content = [para('다른 선지')];
  expect(validator.validateAll!([first])).toEqual([]);
  const diagnostics = validator.validateAll!([first, exact, variant]);
  expect(diagnostics.filter((d) => d.code === 'DUPLICATE_EXACT')).toHaveLength(2);
  expect(diagnostics.filter((d) => d.code === 'DUPLICATE_STEM_VARIANT')).toHaveLength(3);
  expect(diagnostics[0]).toMatchObject({ severity: 'warn', ref: { draftIndex: 0, questionId: 'q1' } });
  expect(diagnostics[0].message).toContain('1번째, 2번째');
  exact.passage = [para('다른 보기')];
  expect(validator.validateAll!([first, exact])).toEqual([]);
  expect(
    validator.validateAll!([
      makeQuestion({ stem: [], passage: [] }),
      makeQuestion({ stem: [], passage: [] }),
    ]),
  ).toEqual([]);
});

it('1000문제 중복 검사를 해시 맵으로 1초 이내에 처리한다', () => {
  const questions = Array.from({ length: 1000 }, (_, index) => makeQuestion({ id: `q${index}` }));
  const start = performance.now();
  const diagnostics = validator.validateAll!(questions);
  const elapsed = performance.now() - start;
  expect(diagnostics).toHaveLength(1000);
  expect(diagnostics[0].message.length).toBeLessThan(300);
  expect(elapsed).toBeLessThan(1000);
  console.info(`가짜 1000문제 중복 검사: ${Math.round(elapsed)}ms (기준 1000ms)`);
});

it('중복 두 유형은 모두 경고이며 이미지가 다른 지문은 다른 그룹이다', () => {
  const a = makeQuestion({ id: 'a', stem: [para('동일 가짜 지문'), { type: 'image', assetId: 'one' }] });
  const b = makeQuestion({ ...a, id: 'b', choices: [{ ...a.choices[0], content: [para('변형 선지')] }] });
  const c = makeQuestion({
    ...a,
    id: 'c',
    stem: [para('동일 가짜 지문'), { type: 'image', assetId: 'two' }],
  });
  const diagnostics = validator.validateAll!([a, { ...a, id: 'exact' }, b, c]);
  expect(new Set(diagnostics.map((d) => d.code))).toEqual(
    new Set(['DUPLICATE_EXACT', 'DUPLICATE_STEM_VARIANT']),
  );
  expect(diagnostics.every((d) => d.severity === 'warn')).toBe(true);
  expect(diagnostics.every((d) => d.ref?.draftIndex !== 3)).toBe(true);
  expect(
    diagnostics.every((d) =>
      d.message.includes('지문이 같아 중복으로 취급되며 한 시험·모든 회차에서 함께 출제되지 않습니다'),
    ),
  ).toBe(true);
});
