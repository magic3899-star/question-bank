import { subjectCatalog } from '../../src/modules/subject-catalog/index';
import type { WorkbookBook } from '../../src/modules/workbook/index';

export interface ExpectedWorkbookQuestion {
  subject: string;
  number: number;
  marker: string;
  choices: string[];
  answerId: string;
  objectiveCode?: string;
}

export function makeWorkbookFixture(
  options: {
    seed?: number;
    subjects?: number;
    count?: number;
    omitObjectives?: boolean;
  } = {},
): {
  questionBooks: WorkbookBook[];
  answerBooks: WorkbookBook[];
  expected: ExpectedWorkbookQuestion[];
} {
  let state = options.seed ?? 1;
  const expected: ExpectedWorkbookQuestion[] = [];
  const questionBooks: WorkbookBook[] = [];
  const answerBooks: WorkbookBook[] = [];
  for (const subject of subjectCatalog.slice(0, options.subjects ?? 3)) {
    const questions = [
      '2027 가짜 SERIES',
      'PART',
      '02',
      'DENTAL HYGIENIST',
      subject.name,
      'Fake Subject',
      '제 1 장 가짜',
      'Memo',
    ];
    const answers: string[] = [];
    for (let number = 1; number <= (options.count ?? 25); number++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const answer = state % 5;
      const marker = `가짜_${subject.id}_${number}`;
      const choiceTexts = Array.from(
        { length: 5 },
        (_, index) => `${marker}_선지${index + 1}${index === 0 ? ' 사과나무 바나나' : ''}`,
      );
      const objectiveCode =
        options.omitObjectives && number % 5 === 0 ? undefined : `${subject.prefix} 1-1-${number}`;
      questions.push(
        String(number).padStart(3, '0'),
        `${marker} 사과나무는 어떤가요?`,
        ...(number % 7 === 0 ? ['• 가짜 그림 참고'] : []),
        `① ${marker}_선지1 사과나무`,
        '바나나',
        `② ${choiceTexts[1]} ③ ${choiceTexts[2]}`,
        `④ ${choiceTexts[3]} ⑤ ${choiceTexts[4]}`,
        'KILLER POINT 가짜 요약',
        '출제 연도 기출 내용',
        '2025',
        `${subject.prefix} 9-9-9. 가짜 요약`,
        '제 2 장 가짜 장',
      );
      answers.push(
        `${String(number).padStart(3, '0')}${number % 2 ? '〉〉〉' : '〉〉>'}정답${'①②③④⑤'[answer]}`,
        `가짜해설 ${marker}`,
        `• ${marker}_설명 바나나`,
        '사과나무',
        `① → ${marker}_선지참조`,
        ...(objectiveCode ? [`◆ ${objectiveCode}`] : []),
      );
      expected.push({
        subject: subject.id,
        number,
        marker,
        choices: choiceTexts,
        answerId: `c${answer + 1}`,
        objectiveCode,
      });
    }
    questionBooks.push({ name: `가짜문제_${subject.id}`, lines: questions });
    answerBooks.push({ name: `가짜정답_${subject.id}`, lines: answers });
  }
  return { questionBooks, answerBooks, expected };
}

export function tinyWorkbook(
  questionLines: string[] = [],
  answerLines: string[] = [],
): {
  questionBooks: WorkbookBook[];
  answerBooks: WorkbookBook[];
} {
  return {
    questionBooks: [
      {
        name: '가짜문제',
        lines: ['PART', '의료관계법규', '001', '가짜 사과나무?', '① 하나 ② 둘 ③ 셋 ④ 넷', ...questionLines],
      },
    ],
    answerBooks: [
      {
        name: '가짜정답',
        lines: ['001 〉〉〉 정답 ③', '가짜 제목', '• 가짜 불릿', '◆ 법규 1-1-1', ...answerLines],
      },
    ],
  };
}

export function numberedWorkbook(
  entries: readonly { number: number; lines: readonly string[]; objectivePrefix?: string }[],
): {
  questionBooks: WorkbookBook[];
  answerBooks: WorkbookBook[];
} {
  return {
    questionBooks: [
      {
        name: '가짜 번호 문제집',
        lines: [
          'PART',
          '의료관계법규',
          ...entries.flatMap((entry) => [String(entry.number).padStart(3, '0'), ...entry.lines]),
        ],
      },
    ],
    answerBooks: [
      {
        name: '가짜 번호 정답집',
        lines: entries.flatMap((entry) => [
          `${String(entry.number).padStart(3, '0')} 〉〉〉 정답 ②`,
          `가짜 ${entry.number}번 해설`,
          `◆ ${entry.objectivePrefix ?? '법규'} 1-1-${entry.number}`,
        ]),
      },
    ],
  };
}
