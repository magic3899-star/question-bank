import type { Validator } from '../../../contracts/index';
import { referencesChoiceLabels } from '../../content-model/index';

export const choiceLabelReferenceValidator: Validator = {
  kind: 'validator',
  id: 'choice-label-reference',
  label: '해설·본문의 선지 번호 참조',
  validate: (question) =>
    question.shufflePolicy === 'free' &&
    referencesChoiceLabels([...question.explanation, ...question.stem, ...(question.passage ?? [])])
      ? [
          {
            severity: 'warn',
            code: 'CHOICE_LABEL_REFERENCE_UNLOCKED',
            message: '선지를 섞으면 해설·본문의 번호가 시험지와 어긋납니다. 선지 순서를 고정하세요',
            ref: { ...('id' in question ? { questionId: question.id } : {}) },
          },
        ]
      : [],
};
