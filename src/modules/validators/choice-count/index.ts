import type { Diagnostic, Validator } from '../../../contracts/index';
import { isEmptyBlocks } from '../../content-model/index';

export const choiceCountValidator: Validator = {
  kind: 'validator', id: 'choice-count', label: '선지 개수와 내용',
  validate(question) {
    const diagnostics: Diagnostic[] = [];
    const count = question.choices.length;
    if (count < 2) diagnostics.push({ severity: 'error', code: 'CHOICES_TOO_FEW', message: `선지가 ${count}개입니다. 객관식 선지를 2개 이상 입력하세요.` });
    else if (count !== 5) diagnostics.push({ severity: 'warn', code: 'CHOICE_COUNT_UNUSUAL', message: `선지가 ${count}개로 기본 5개와 다릅니다. 누락이나 추가 여부를 확인하세요.` });
    const ids = new Set<string>();
    question.choices.forEach((choice, index) => {
      if (isEmptyBlocks(choice.content)) diagnostics.push({ severity: 'error', code: 'CHOICE_EMPTY', message: `${index + 1}번 선지 내용이 비었습니다. 글자, 이미지 또는 표 내용을 입력하세요.` });
      if (ids.has(choice.id)) diagnostics.push({ severity: 'error', code: 'CHOICE_ID_DUPLICATE', message: `${index + 1}번 선지 ID "${choice.id}"가 중복됩니다. 선지마다 고유 ID를 지정하세요.` });
      ids.add(choice.id);
    });
    return diagnostics.map((diagnostic) => ({ ...diagnostic, ref: {
      ...('id' in question && typeof question.id === 'string' ? { questionId: question.id } : {}),
    } }));
  },
};
