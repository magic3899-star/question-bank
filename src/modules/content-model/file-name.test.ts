import { describe, expect, it } from 'vitest';
import { createExportFileName, sanitizeFileName } from './index';

describe('Windows 파일명', () => {
  it.each([
    ['  한글 제목.  ', '한글 제목'], ['\\/:*?"<>|\u0000\u001f\u007f', '____________'],
    ['', '문서'], ['  ... ', '문서'], ['CON', '_CON'], ['nul.txt', '_nul.txt'],
    ['COM9', '_COM9'], ['LPT1.', '_LPT1'], ['COM10', 'COM10'], ['CON텐츠', 'CON텐츠'],
  ])('%j → %j', (input, expected) => expect(sanitizeFileName(input)).toBe(expected));
  it('모든 예약어를 대소문자와 무관하게 처리한다', () => {
    for (const name of ['CON', 'PRN', 'AUX', 'NUL', ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
      ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`)]) expect(sanitizeFileName(name.toLowerCase())).toBe(`_${name.toLowerCase()}`);
  });
  it('100 코드 포인트로 자르고 서로 다른 제목의 정리 결과·대소문자 충돌도 해결한다', () => {
    expect(Array.from(sanitizeFileName('🧪'.repeat(101)))).toHaveLength(100);
    expect(sanitizeFileName(`CON${' '.repeat(100)}Z`)).toBe('_CON');
    expect(sanitizeFileName('  한글\u3000.')).toBe('한글');
    const used = new Set<string>();
    expect(createExportFileName('가짜/시험', 'questions', 'pdf', used)).toBe('가짜_시험_문제지.pdf');
    expect(createExportFileName('가짜:시험', 'questions', 'pdf', used)).toBe('가짜_시험_문제지-2.pdf');
    expect(createExportFileName('가짜_시험', 'questions', 'pdf', used)).toBe('가짜_시험_문제지-3.pdf');
    expect(createExportFileName('a', 'combined', 'xlsx', used)).toBe('a_전체.xlsx');
    expect(createExportFileName('A', 'combined', 'xlsx', used)).toBe('A_전체-2.xlsx');
  });
});
