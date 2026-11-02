import { describe, expect, it } from 'vitest';
import { collectAssetIds } from '../../src/modules/content-model/index';
import { makeAppBank } from './appBank';

describe('앱 검수용 가짜 문제은행', () => {
  it('2과목 300문제에 누락 목표·지문·이미지 상태를 섞는다', () => {
    const bank = makeAppBank();
    expect(bank.questions).toHaveLength(300);
    expect(new Set(bank.questions.map((q) => q.subject))).toEqual(new Set(['law', 'anatomy']));
    expect(bank.questions.filter((q) => !q.objectiveCode)).toHaveLength(16);
    expect(bank.questions.filter((q) => q.passage?.length)).toHaveLength(200);
    expect(
      bank.questions.filter(
        (q) =>
          collectAssetIds([
            ...q.stem,
            ...(q.passage ?? []),
            ...q.choices.flatMap((c) => c.content),
            ...q.explanation,
          ]).length > 0,
      ),
    ).toHaveLength(60);
  });
});
