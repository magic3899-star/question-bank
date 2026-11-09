import { WORKBOOK_SUBJECT } from '../../../shared/index';

export const importToggles = [
  { id: 'includeGrades', label: 'A 등급만', hint: 'A 등급으로 표시된 문제만 가져옵니다.' },
  {
    id: 'requireObjective',
    label: '학습목표 없는 문제 제외',
    hint: '출제 기준인 학습목표 코드가 있는 문제만 가져옵니다.',
  },
  {
    id: 'dedupeByPassage',
    label: '같은 지문은 첫 문제만',
    hint: '선지가 달라도 본문과 예문이 같으면 첫 문제만 남깁니다.',
  },
  {
    id: 'lockChoicesOnReference',
    label: '해설에 선지 번호가 있으면 선지 고정',
    hint: '본문·예문·해설의 번호 참조가 뒤바뀌지 않도록 고정합니다.',
  },
] as const;

export function visibleImportToggles(subject: string) {
  return importToggles.filter(
    (toggle) =>
      subject !== WORKBOOK_SUBJECT || (toggle.id !== 'includeGrades' && toggle.id !== 'dedupeByPassage'),
  );
}
