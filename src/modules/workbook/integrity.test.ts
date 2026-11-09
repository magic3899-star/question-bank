import { describe, expect, it } from 'vitest';
import { tinyWorkbook } from '../../../tests/fixtures/workbook';
import type { DraftQuestion } from '../../contracts/index';
import { buildWorkbookDraft } from './index';
import { isValidDraft } from './build-question';

describe('병합 후 자체 무결성 검사', () => {
  const valid = (): DraftQuestion => buildWorkbookDraft(tinyWorkbook()).questions[0];

  it('정상 초안은 통과한다', () => expect(isValidDraft(valid())).toBe(true));

  it.each([
    (draft: DraftQuestion) => {
      draft.question.choices.splice(1);
    },
    (draft: DraftQuestion) => {
      draft.question.choices.push(...draft.question.choices);
    },
    (draft: DraftQuestion) => {
      draft.question.choices[1].id = draft.question.choices[0].id;
    },
    (draft: DraftQuestion) => {
      draft.question.answerChoiceIds = ['다른문제선지'];
    },
    (draft: DraftQuestion) => {
      draft.question.answerChoiceIds = [];
    },
    (draft: DraftQuestion) => {
      draft.question.stem = [];
    },
    (draft: DraftQuestion) => {
      draft.question.stem = [{ type: 'paragraph', runs: [{ text: '  ' }] }];
    },
    (draft: DraftQuestion) => {
      draft.question.choices[0].content = [];
    },
  ])('잘못된 초안 변형 #%#은 거부한다', (mutate) => {
    const draft = valid();
    mutate(draft);
    expect(isValidDraft(draft)).toBe(false);
  });
});
