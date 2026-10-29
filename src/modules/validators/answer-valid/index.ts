import type { Diagnostic, Validator } from '../../../contracts/index';

export const answerValidValidator: Validator = {
  kind: 'validator', id: 'answer-valid', label: '정답 유효성',
  validate(question) {
    const diagnostics: Diagnostic[] = [];
    if (!question.answerChoiceIds.length) diagnostics.push({ severity: 'error', code: 'ANSWER_MISSING', message: '정답이 없습니다. 정답에 해당하는 선지를 하나 이상 선택하세요.' });
    const ids = new Set(question.choices.map((choice) => choice.id));
    const invalid = question.answerChoiceIds.filter((id) => !ids.has(id));
    if (invalid.length || question.answerChoiceIds.length > question.choices.length
      || new Set(question.answerChoiceIds).size !== question.answerChoiceIds.length) {
      diagnostics.push({ severity: 'error', code: 'ANSWER_INVALID', message: `정답 ID가 선지와 맞지 않거나 중복됩니다${invalid.length ? ` (${invalid.join(', ')})` : ''}. 실제 선지의 고유 ID만 정답에 지정하세요.` });
    }
    return diagnostics.map((diagnostic) => ({ ...diagnostic, ref: {
      ...('id' in question && typeof question.id === 'string' ? { questionId: question.id } : {}),
    } }));
  },
};
