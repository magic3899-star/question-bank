import type { ExportRequest } from '../../shared/index';

export interface ExamHeaderForm {
  enabled: boolean;
  period: string;
  durationMinutes: string;
  pointsPerQuestion: string;
  candidateFields: boolean;
}

export const initialExamHeaderForm: ExamHeaderForm = {
  enabled: false,
  period: '',
  durationMinutes: '',
  pointsPerQuestion: '',
  candidateFields: true,
};

export function buildExamHeaderRequest(form: ExamHeaderForm): {
  request: Pick<ExportRequest, 'header'>;
  errors: Partial<Record<'period' | 'durationMinutes' | 'pointsPerQuestion', string>>;
} {
  if (!form.enabled) return { request: {}, errors: {} };
  const errors: Partial<Record<'period' | 'durationMinutes' | 'pointsPerQuestion', string>> = {};
  const duration = form.durationMinutes.trim();
  const points = form.pointsPerQuestion.trim();
  if (form.period.length > 30) errors.period = '교시는 30자 이하로 입력하세요.';
  if (duration && (!Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 600))
    errors.durationMinutes = '시험 시간은 1~600분 사이의 정수로 입력하세요.';
  if (points && (!Number.isFinite(Number(points)) || Number(points) <= 0 || Number(points) > 100))
    errors.pointsPerQuestion = '문항당 배점은 0 초과 100 이하의 숫자로 입력하세요.';
  if (Object.keys(errors).length) return { request: {}, errors };
  return {
    request: {
      header: {
        ...(form.period.trim() ? { period: form.period.trim() } : {}),
        ...(duration ? { durationMinutes: Number(duration) } : {}),
        ...(points ? { pointsPerQuestion: Number(points) } : {}),
        candidateFields: form.candidateFields,
      },
    },
    errors,
  };
}
