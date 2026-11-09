import { describe, expect, it } from 'vitest';
import { findSubjectById, findSubjectByName, findSubjectByPrefix, subjectCatalog } from './index';

describe('국가시험 과목 카탈로그', () => {
  it('21과목의 순서·접두·시작번호와 교시별 100문항을 유지한다', () => {
    expect(subjectCatalog.map((subject) => subject.id)).toEqual([
      'law',
      'anatomy',
      'morphology',
      'histology',
      'pathology',
      'physiology',
      'microbiology',
      'community',
      'administration',
      'statistics',
      'education',
      'preventive',
      'scaling',
      'radiology',
      'surgery',
      'prosthodontics',
      'conservative',
      'pediatric',
      'periodontics',
      'orthodontics',
      'materials',
    ]);
    expect(new Set(subjectCatalog.map((subject) => subject.id)).size).toBe(21);
    expect(new Set(subjectCatalog.map((subject) => subject.prefix)).size).toBe(21);
    let next = 1;
    for (const subject of subjectCatalog) {
      expect(subject.startNumber).toBe(next);
      next += subject.questionCount;
      expect(findSubjectById(subject.id)).toBe(subject);
      expect(findSubjectByName(subject.name)).toBe(subject);
      expect(findSubjectByPrefix(subject.prefix)).toBe(subject);
    }
    for (const period of [1, 2])
      expect(
        subjectCatalog.filter((s) => s.period === period).reduce((total, s) => total + s.questionCount, 0),
      ).toBe(100);
  });

  it('정확히 일치하는 과목만 조회한다', () => {
    expect(findSubjectByName('구강해부학 ')).toBeUndefined();
    expect(findSubjectByPrefix('해')).toBeUndefined();
    expect(findSubjectById('unknown')).toBeUndefined();
    expect(Object.isFrozen(subjectCatalog)).toBe(true);
    expect(subjectCatalog.every(Object.isFrozen)).toBe(true);
  });
});
