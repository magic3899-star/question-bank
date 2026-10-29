import type { Validator } from '../../../contracts/index';

export const answerDistributionValidator: Validator = {
  kind: 'validator', id: 'answer-distribution', label: '정답 위치 분포',
  validateAll(questions) {
    const counts: number[] = [];
    for (const question of questions) {
      question.choices.forEach((choice, index) => {
        counts[index] ??= 0;
        if (question.answerChoiceIds.includes(choice.id)) counts[index]++;
      });
    }
    const total = counts.reduce((sum, value) => sum + value, 0);
    if (!total || Math.max(...counts) <= total / counts.length * 1.5) return [];
    const distribution = counts.map((count, index) => `${index + 1}번 ${count}개`).join(', ');
    return [{ severity: 'info', code: 'ANSWER_SKEW', message: `정답 위치가 평균의 1.5배를 초과해 한쪽으로 쏠립니다 (${distribution}). 시험지 구성 시 정답 위치를 확인하세요.` }];
  },
};
