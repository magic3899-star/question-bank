import { beforeEach, describe, expect, it } from 'vitest';
import type { Shuffler } from '../../src/contracts/index';
import { shufflers } from '../../src/modules/shuffler/index';
import { assertShufflerInvariants } from './assertShufflerInvariants';

export { assertShufflerInvariants } from './assertShufflerInvariants';

// 시드 500개를 한 테스트에서 동기로 돌리면 vitest 워커가 수십 초 막혀 RPC 시간 초과가 나므로 묶음으로 나눈다.
const SEED_TOTAL = 500;
const SEED_CHUNK = 25;

describe('등록된 모든 섞기 플러그인의 불변 조건', () => {
  // 무거운 동기 테스트 사이에 이벤트 루프를 돌려 vitest RPC 응답(60초 제한)이 처리되게 한다.
  beforeEach(() => new Promise<void>((resolve) => { setImmediate(resolve); }));
  for (const shuffler of shufflers) {
    for (let start = 0; start < SEED_TOTAL; start += SEED_CHUNK) {
      it(`${shuffler.id}: 시드 ${start}~${start + SEED_CHUNK - 1} × 4개 문항 수 × 8개 옵션`, () => {
        assertShufflerInvariants(shuffler, SEED_CHUNK, start);
      }, 60000);
    }
  }
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
