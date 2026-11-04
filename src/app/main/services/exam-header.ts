import type { ExamHeader } from '../../../contracts/index';

export function parseExamHeader(value: unknown): ExamHeader | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('시험지 머리 정보는 객체로 입력하세요. 저장 옵션을 다시 확인하세요.');
  const input = value as Record<string, unknown>;
  if (typeof input.candidateFields !== 'boolean')
    throw new Error('성명·수험번호 칸 넣기는 켜짐 또는 꺼짐으로 선택하세요.');
  if (input.period !== undefined && (typeof input.period !== 'string' || input.period.length > 30))
    throw new Error('교시는 30자 이하의 문자로 입력하세요.');
  if (
    input.durationMinutes !== undefined &&
    (typeof input.durationMinutes !== 'number' ||
      !Number.isInteger(input.durationMinutes) ||
      input.durationMinutes < 1 ||
      input.durationMinutes > 600)
  )
    throw new Error('시험 시간은 1~600분 사이의 정수로 입력하세요.');
  if (
    input.pointsPerQuestion !== undefined &&
    (typeof input.pointsPerQuestion !== 'number' ||
      !Number.isFinite(input.pointsPerQuestion) ||
      input.pointsPerQuestion <= 0 ||
      input.pointsPerQuestion > 100)
  )
    throw new Error('문항당 배점은 0 초과 100 이하의 숫자로 입력하세요.');
  return {
    ...(typeof input.period === 'string' && input.period.trim() ? { period: input.period.trim() } : {}),
    ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes as number } : {}),
    ...(input.pointsPerQuestion !== undefined
      ? { pointsPerQuestion: input.pointsPerQuestion as number }
      : {}),
    candidateFields: input.candidateFields,
  };
}
