import { expect, it } from 'vitest';
import { deepFreeze, makeQuestion, para } from '../../../../tests/fixtures/builders';
import { runValidators, standardValidators } from '../index';
import { choiceLabelReferenceValidator as validator } from './index';

it.each(['stem', 'passage', 'explanation'] as const)('%s의 중첩 참조를 free일 때 경고한다', (field) => {
  const question = makeQuestion({ [field]: [{ type: 'table', rows: [[[para('가짜 ⑩ 설명')]]] }] });
  expect(validator.validate!(deepFreeze(question))).toEqual([
    {
      severity: 'warn',
      code: 'CHOICE_LABEL_REFERENCE_UNLOCKED',
      message: '선지를 섞으면 해설·본문의 번호가 시험지와 어긋납니다. 선지 순서를 고정하세요',
      ref: { questionId: question.id },
    },
  ]);
  expect(runValidators(standardValidators, [question])).toContainEqual(
    expect.objectContaining({
      code: 'CHOICE_LABEL_REFERENCE_UNLOCKED',
      ref: { questionId: question.id, draftIndex: 0 },
    }),
  );
  expect(validator.validate!({ ...question, shufflePolicy: 'lock-all' })).toEqual([]);
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = question;
  expect(validator.validate!(draft)[0].ref).toEqual({});
});

it('참조가 없거나 선지에만 있으면 새 경고를 내지 않는다', () => {
  const question = makeQuestion();
  expect(validator.validate!(question)).toEqual([]);
  question.choices[0].content = [para('①, ② 가짜 선지')];
  expect(validator.validate!(question)).toEqual([]);
});
