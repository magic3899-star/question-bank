import type { Validator } from '../../../contracts/index';

export const objectiveMissingValidator: Validator = {
  kind: 'validator', id: 'objective-missing', label: '학습목표 누락',
  validate: (question) => question.objectiveCode?.trim() ? [] : [{
    severity: 'warn', code: 'OBJECTIVE_MISSING',
    message: '학습목표가 없으면 출제 규칙 대상에서 빠집니다. 과목과 학습목표 코드를 입력하세요.',
    ref: { ...('id' in question && typeof question.id === 'string' ? { questionId: question.id } : {}) },
  }],
};
