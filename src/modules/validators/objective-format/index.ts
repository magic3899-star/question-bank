import type { Validator } from '../../../contracts/index';

export const objectiveFormatValidator: Validator = {
  kind: 'validator',
  id: 'objective-format',
  label: '학습목표 형식',
  validate: (question) =>
    !question.objectiveCode?.trim() || /^\S+ \d+(-\d+)+$/.test(question.objectiveCode)
      ? []
      : [
          {
            severity: 'warn',
            code: 'OBJECTIVE_FORMAT',
            message: `학습목표 "${question.objectiveCode}"의 형식이 올바르지 않습니다. 과목과 코드 사이에 일반 공백 하나를 넣어 "법규 1-1-3"처럼 입력하세요.`,
            ref: {
              ...('id' in question && typeof question.id === 'string' ? { questionId: question.id } : {}),
            },
          },
        ],
};
