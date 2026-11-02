import type { Diagnostic, ValidatableQuestion, Validator } from '../../../contracts/index';
import { blocksToPlainText, questionContentKey, isEmptyBlocks } from '../../content-model/index';

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\u3000/g, ' ')
    .replace(/^\s*(?:\d+[.)]|[①-⑩])\s*/gm, '')
    .replace(/\s+/g, '');

export const duplicateStemValidator: Validator = {
  kind: 'validator',
  id: 'duplicate-stem',
  label: '중복 문제 지문',
  validateAll(questions) {
    const groups = new Map<string, { index: number; choices: string }[]>();
    questions.forEach((question, index) => {
      if (isEmptyBlocks([...question.stem, ...(question.passage ?? [])])) return;
      const stem = questionContentKey(question);
      const choices = JSON.stringify(
        question.choices.map((choice) => normalize(blocksToPlainText(choice.content))).sort(),
      );
      const group = groups.get(stem);
      if (group) group.push({ index, choices });
      else groups.set(stem, [{ index, choices }]);
    });
    const diagnostics: Diagnostic[] = [];
    const ref = (question: ValidatableQuestion, draftIndex: number): NonNullable<Diagnostic['ref']> => ({
      draftIndex,
      ...('id' in question ? { questionId: question.id } : {}),
    });
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const byChoices = new Map<string, number[]>();
      for (const item of group) {
        const indices = byChoices.get(item.choices);
        if (indices) indices.push(item.index);
        else byChoices.set(item.choices, [item.index]);
      }
      // 거대한 중복 묶음도 메시지와 처리량이 제곱으로 늘어나지 않도록 위치 예시를 제한한다.
      const locations =
        group
          .slice(0, 8)
          .map(({ index }) => `${index + 1}번째`)
          .join(', ') + (group.length > 8 ? ` 외 ${group.length - 8}개` : '');
      for (const item of group) {
        const exact = byChoices.get(item.choices)!;
        if (exact.length > 1)
          diagnostics.push({
            severity: 'warn',
            code: 'DUPLICATE_EXACT',
            message: `완전히 같은 문제입니다. 같은 선지 묶음 위치: ${exact
              .slice(0, 8)
              .map((i) => `${i + 1}번째`)
              .join(
                ', ',
              )}${exact.length > 8 ? ` 외 ${exact.length - 8}개` : ''}. 지문이 같아 중복으로 취급되며 한 시험·모든 회차에서 함께 출제되지 않습니다.`,
            ref: ref(questions[item.index], item.index),
          });
        if (byChoices.size > 1)
          diagnostics.push({
            severity: 'warn',
            code: 'DUPLICATE_STEM_VARIANT',
            message: `같은 문제 지문, 선지 다름(변형 가능). 관련 위치: ${locations}. 지문이 같아 중복으로 취급되며 한 시험·모든 회차에서 함께 출제되지 않습니다.`,
            ref: ref(questions[item.index], item.index),
          });
      }
    }
    return diagnostics;
  },
};
