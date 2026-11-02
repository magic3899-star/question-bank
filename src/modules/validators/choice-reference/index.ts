import type { Validator } from '../../../contracts/index';
import { blocksToPlainText } from '../../content-model/index';

export const choiceReferenceValidator: Validator = {
  kind: 'validator',
  id: 'choice-reference',
  label: '다른 선지 참조',
  validate: (question) =>
    question.shufflePolicy !== 'free'
      ? []
      : question.choices.flatMap((choice, index) =>
          !choice.fixedPosition &&
          /[①-⑩]|모두|위의|상기|(?:해당 없음|정답 없음|없음)\s*$/.test(blocksToPlainText(choice.content))
            ? [
                {
                  severity: 'warn' as const,
                  code: 'CHOICE_REFERENCES_OTHERS',
                  message: `${index + 1}번 선지가 다른 선지나 번호를 참조합니다. 섞으면 정답이 달라질 수 있으므로 선지 위치를 고정하거나 전체 선지 섞기를 잠그세요.`,
                  ref: {
                    ...('id' in question && typeof question.id === 'string'
                      ? { questionId: question.id }
                      : {}),
                  },
                },
              ]
            : [],
        ),
};
