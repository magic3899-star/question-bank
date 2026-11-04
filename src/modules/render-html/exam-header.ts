import type { ExamHeader, ExamSnapshot } from '../../contracts/index';

export function describeExamHeader(
  snapshot: ExamSnapshot,
  header: ExamHeader,
): { info: string; candidate: string | undefined } {
  const entries: string[] = [];
  const period = header.period?.trim();
  if (period) entries.push(period);
  if (
    header.durationMinutes !== undefined &&
    Number.isInteger(header.durationMinutes) &&
    header.durationMinutes > 0
  )
    entries.push(`시험 시간 ${header.durationMinutes}분`);
  entries.push(`총 ${snapshot.items.length}문항`);
  if (
    header.pointsPerQuestion !== undefined &&
    Number.isFinite(header.pointsPerQuestion) &&
    header.pointsPerQuestion > 0
  )
    entries.push(`문항당 ${header.pointsPerQuestion}점`);
  return {
    info: entries.join(' · '),
    candidate: header.candidateFields
      ? '성명: ____________________　수험번호: ____________________'
      : undefined,
  };
}
