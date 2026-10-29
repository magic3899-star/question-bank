import type { Diagnostic, Validator } from '../../../contracts/index';
import { blocksToPlainText, collectAssetIds } from '../../content-model/index';

export const duplicateChoicesValidator: Validator = {
  kind: 'validator', id: 'duplicate-choices', label: '중복 선지',
  validate(question) {
    const seen = new Map<string, number>();
    const diagnostics: Diagnostic[] = [];
    question.choices.forEach((choice, index) => {
      const plain = blocksToPlainText(choice.content).replace(/\s+/g, ' ').trim().toLowerCase();
      const text = plain ? JSON.stringify([plain, collectAssetIds(choice.content)]) : '';
      if (!text) return;
      const previous = seen.get(text);
      if (previous !== undefined) diagnostics.push({ severity: 'warn', code: 'DUPLICATE_CHOICES', message: `${previous + 1}번과 ${index + 1}번 선지 내용이 같습니다. 중복인지 확인하고 선지를 고치세요.` });
      else seen.set(text, index);
    });
    return diagnostics.map((diagnostic) => ({ ...diagnostic, ref: {
      ...('id' in question && typeof question.id === 'string' ? { questionId: question.id } : {}),
    } }));
  },
};
