import { expect, it } from 'vitest';
import { makeQuestion, para } from '../../../../tests/fixtures/builders';
import { choiceReferenceValidator as validator } from './index';

it('참조 표현이 있는 자유 선지만 경고한다', () => {
  expect(validator.validate!(makeQuestion())).toEqual([]);
  for (const text of ['①, ⑩ 모두', '위의 가짜', '상기 보기', '해당 없음', '정답 없음', '가짜 없음']) {
    const q = makeQuestion();
    q.choices[0].content = [para(text)];
    expect(validator.validate!(q)[0].code).toBe('CHOICE_REFERENCES_OTHERS');
    q.choices[0].fixedPosition = true;
    expect(validator.validate!(q)).toEqual([]);
    q.choices[0].fixedPosition = false;
    q.shufflePolicy = 'lock-all';
    expect(validator.validate!(q)).toEqual([]);
  }
});
