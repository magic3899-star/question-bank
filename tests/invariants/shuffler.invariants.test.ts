import { describe, expect, it } from 'vitest';
import type { Shuffler } from '../../src/contracts/index';
import { shufflers } from '../../src/modules/shuffler/index';
import { assertShufflerInvariants } from './assertShufflerInvariants';

export { assertShufflerInvariants } from './assertShufflerInvariants';

describe('등록된 모든 섞기 플러그인의 불변 조건', () => {
  for (const shuffler of shufflers) it(`${shuffler.id}: 500개 시드 × 4개 문항 수 × 8개 옵션`, () => {
    assertShufflerInvariants(shuffler);
  }, 120000);
});

describe('불변 조건 검사 자체의 메타 테스트', () => {
  const broken = (id: string, change: Shuffler['apply']): Shuffler => ({ kind: 'shuffler', id, label: '고의 오류 테스트', apply: change });
  it('선지 내용을 바꾸면 실패한다', () => {
    const plugin = broken('content-corruption', (exam, options) => {
      const result = structuredClone(exam);
      if (options.shuffleChoices && result.questions.length) result.questions[0].choices[0].content = [{ type: 'paragraph', runs: [{ text: '변조된 가짜 선지' }] }];
      return result;
    });
    expect(() => assertShufflerInvariants(plugin, 1)).toThrow(/선지 집합·내용/);
  });
  it('정답을 위치로 다시 지정하면 실패한다', () => {
    const plugin = broken('answer-by-position', (exam, options) => {
      const result = structuredClone(exam);
      for (const question of result.questions) if (options.shuffleChoices) {
        const indices = question.answerChoiceIds.map((id) => question.choices.findIndex((choice) => choice.id === id));
        question.choices.reverse();
        question.answerChoiceIds = indices.map((index) => question.choices[index].id);
      }
      return result;
    });
    expect(() => assertShufflerInvariants(plugin, 1)).toThrow(/선지 외 문제 필드/);
  });
  it('고정 선지를 움직이면 실패한다', () => {
    const plugin = broken('moves-fixed', (exam, options) => {
      const result = structuredClone(exam);
      if (options.shuffleChoices) for (const question of result.questions) question.choices.reverse();
      return result;
    });
    expect(() => assertShufflerInvariants(plugin, 1)).toThrow(/고정 선지/);
  });
});
