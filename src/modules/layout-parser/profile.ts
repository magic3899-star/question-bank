export interface LayoutProfile {
  id: string;
  label: string;
  sourceTagPattern: string;
  stemStartPattern: string;
  choiceMarkers: string[];
  answerLabelPattern: string;
  explanationLabelPattern: string;
  objectiveLinePattern: string;
  fixedChoicePatterns: string[];
  stemLookaheadBlocks?: number;
  explanationNumberPattern?: string;
}

export const standardProfile: LayoutProfile = {
  id: 'standard',
  label: '기본 Word 문제 양식',
  sourceTagPattern: '^\\s*<\\d{4}-\\d{1,2}-\\d{1,2}>?\\s*$',
  stemStartPattern: '^\\s*(\\d+)\\.\\s*',
  choiceMarkers: ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'],
  answerLabelPattern: '^\\s*정답\\s*[:：]\\s*',
  explanationLabelPattern: '^\\s*해설\\s*[:：]\\s*',
  objectiveLinePattern:
    '^[ \\t　]*(?<subject>[가-힣]{1,10})[ \\t　]*(?<code>\\d+(?:[ \\t　]*-[ \\t　]*\\d+)+)\\.?[ \\t　]*(?<text>[^\\r\\n]*?)(?:(?=\\([AB]\\)|[AB]항)\\(?(?<grade>[AB])(?:\\)|항))?[ \\t　]*$',
  fixedChoicePatterns: ['[①-⑩]', '모두', '위의', '상기', '(?:해당 없음|정답 없음|없음)\\s*$'],
  explanationNumberPattern: '^\\s*(?:\\[해설\\]\\s*)?(\\d+)(?:[.)]|번)\\s*(?:해설\\s*[:：]?\\s*)?',
  stemLookaheadBlocks: 6,
};

export function validateProfile(profile: unknown): string[] {
  if (!profile || typeof profile !== 'object')
    return ['레이아웃 프로파일 객체가 없습니다. 양식 설정을 확인하세요.'];
  const record = profile as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of ['id', 'label']) {
    if (typeof record[key] !== 'string' || !(record[key] as string).trim())
      errors.push(`${key} 값이 비었습니다. 양식 이름과 식별자를 입력하세요.`);
  }
  for (const key of [
    'sourceTagPattern',
    'stemStartPattern',
    'answerLabelPattern',
    'explanationLabelPattern',
    'objectiveLinePattern',
    ...(record.explanationNumberPattern === undefined ? [] : ['explanationNumberPattern']),
  ]) {
    if (typeof record[key] !== 'string' || !record[key]) {
      errors.push(`${key} 정규식을 문자열로 입력하세요.`);
      continue;
    }
    try {
      const regex = new RegExp(record[key] as string, 'u');
      if (regex.test(''))
        errors.push(`${key} 정규식이 빈 줄과 일치합니다. 실제 라벨이 있어야 일치하도록 고치세요.`);
    } catch {
      errors.push(`${key} 정규식이 올바르지 않습니다. 괄호와 이스케이프를 확인하세요.`);
    }
  }
  if (
    typeof record.stemStartPattern === 'string' &&
    !/\((?!\?:|\?=|\?!|\?<=|\?<!)/.test(record.stemStartPattern)
  ) {
    errors.push('문제 시작 정규식에 번호 캡처 그룹이 없습니다. 번호를 첫 번째 괄호 그룹으로 묶으세요.');
  }
  if (
    typeof record.explanationNumberPattern === 'string' &&
    !/\((?!\?:|\?=|\?!|\?<=|\?<!)/u.test(record.explanationNumberPattern)
  )
    errors.push('해설 번호 정규식에 번호 캡처 그룹이 없습니다. 번호를 첫 번째 괄호 그룹으로 묶으세요.');
  if (typeof record.objectiveLinePattern === 'string') {
    for (const group of ['subject', 'code', 'text', 'grade']) {
      if (!record.objectiveLinePattern.includes(`(?<${group}>`))
        errors.push(
          `학습목표 정규식에 ${group} 이름 그룹이 없습니다. 해당 값을 이름 있는 캡처 그룹으로 지정하세요.`,
        );
    }
  }
  if (
    !Array.isArray(record.choiceMarkers) ||
    !record.choiceMarkers.length ||
    record.choiceMarkers.some((value: unknown) => typeof value !== 'string' || !value.trim()) ||
    new Set(record.choiceMarkers).size !== record.choiceMarkers.length
  ) {
    errors.push('선지 표시는 중복 없는 문자열 배열로 입력하세요.');
  }
  if (!Array.isArray(record.fixedChoicePatterns)) errors.push('고정 선지 정규식을 문자열 배열로 입력하세요.');
  else
    for (const pattern of record.fixedChoicePatterns as unknown[]) {
      try {
        if (typeof pattern !== 'string') throw new Error();
        new RegExp(pattern, 'u');
      } catch {
        errors.push('고정 선지 정규식이 올바르지 않습니다. 문자열과 괄호를 확인하세요.');
      }
    }
  if (
    record.stemLookaheadBlocks !== undefined &&
    (!Number.isInteger(record.stemLookaheadBlocks) || (record.stemLookaheadBlocks as number) < 1)
  )
    errors.push('앞보기 블록 수는 1 이상의 정수로 입력하세요.');
  return errors;
}
