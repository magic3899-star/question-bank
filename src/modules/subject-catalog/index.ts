export interface CatalogSubject {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly questionCount: number;
  readonly startNumber: number;
  readonly period: 1 | 2;
}

export const subjectCatalog: readonly CatalogSubject[] = Object.freeze(
  (
    [
      ['law', '의료관계법규', '법규', 20, 1, 1],
      ['anatomy', '구강해부학', '해부', 7, 21, 1],
      ['morphology', '치아형태학', '형태', 7, 28, 1],
      ['histology', '구강조직학', '조직', 7, 35, 1],
      ['pathology', '구강병리학', '병리', 7, 42, 1],
      ['physiology', '구강생리학', '생리', 7, 49, 1],
      ['microbiology', '구강미생물학', '미생물', 5, 56, 1],
      ['community', '지역사회구강보건학', '지역', 12, 61, 1],
      ['administration', '구강보건행정학', '행정', 10, 73, 1],
      ['statistics', '구강보건통계학', '통계', 8, 83, 1],
      ['education', '구강보건교육학', '교육', 10, 91, 1],
      ['preventive', '예방치과학', '예치', 18, 101, 2],
      ['scaling', '치면세마론', '치세', 20, 119, 2],
      ['radiology', '치과방사선학', '방사선', 20, 139, 2],
      ['surgery', '구강악안면외과학', '외과', 6, 159, 2],
      ['prosthodontics', '치과보철학', '보철', 6, 165, 2],
      ['conservative', '치과보존학', '보존', 6, 171, 2],
      ['pediatric', '소아치과학', '소치', 6, 177, 2],
      ['periodontics', '치주학', '치주', 6, 183, 2],
      ['orthodontics', '치과교정학', '교정', 6, 189, 2],
      ['materials', '치과재료학', '재료', 6, 195, 2],
    ] as const
  ).map(([id, name, prefix, questionCount, startNumber, period]) =>
    Object.freeze({ id, name, prefix, questionCount, startNumber, period }),
  ),
);

export function findSubjectByName(name: string): CatalogSubject | undefined {
  return subjectCatalog.find((subject) => subject.name === name);
}

export function findSubjectByPrefix(prefix: string): CatalogSubject | undefined {
  return subjectCatalog.find((subject) => subject.prefix === prefix);
}

export function findSubjectById(id: string): CatalogSubject | undefined {
  return subjectCatalog.find((subject) => subject.id === id);
}
