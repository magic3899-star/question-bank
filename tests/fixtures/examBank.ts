import type { AssetData, Question, RuleSet } from '../../src/contracts/index';
import { sha256Hex } from '../../src/modules/content-model/index';
import { makeQuestion, makeRuleSet, para } from './builders';

export function makeExamBank(): { questions: Question[]; assets: Record<string, AssetData> } {
  const dataBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFO8AAAAASUVORK5CYII=';
  const sha256 = sha256Hex(Uint8Array.from(atob(dataBase64), (char) => char.charCodeAt(0)));
  const assets = Object.fromEntries(['passage', 'stem', 'choice', 'explanation'].map((id) =>
    [id, { id, mime: 'image/png', dataBase64, sha256 }]));
  const questions = Array.from({ length: 300 }, (_, i) => {
    const subject = i < 150 ? 'law' : 'anatomy';
    const subjectName = i < 150 ? '법규' : '해부';
    const local = i % 150;
    const id = `fake-${i}`;
    const question = makeQuestion({ id, subject, grade: 'A',
      objectiveCode: `${subjectName} ${1 + Math.floor(local / 50)}-${1 + local % 10}-${local + 1}`,
      passage: [para(`가짜 예문 ${id}  끝 공백 `, { underline: true }),
        { type: 'image', assetId: 'passage', widthPx: 48, heightPx: 48, alt: `가짜 그림 ${id}` },
        { type: 'table', rows: [[[para(`보기 상자 ${id}`),
          { type: 'table', rows: [[[{ type: 'image', assetId: 'passage' }], [para(`중첩 셀 ${id}`)]]] }]]] }],
      stem: [para(`가짜 본문 ${id}`, { bold: true }),
        { type: 'table', rows: [[[para(`본문 표 ${id}`)], [{ type: 'image', assetId: 'stem' }]]] }],
      choices: Array.from({ length: 5 }, (_, j) => ({ id: `c${j}`, fixedPosition: j === 2 && i % 3 === 0,
        content: [para(`가짜 선지 ${id}/${j}`, { underline: j === 1 }),
          ...(j === 4 ? [{ type: 'image' as const, assetId: 'choice' }] : [])] })),
      answerChoiceIds: i % 4 === 0 ? ['c0', 'c3'] : [`c${i % 5}`],
      explanation: [para(`가짜 해설 ${id}`, { italic: true }), { type: 'image', assetId: 'explanation' }],
      shufflePolicy: i % 7 === 0 ? 'lock-all' : 'free',
    });
    return question;
  });
  // 선지가 달라도 같은 지문인 후보를 넣어 run 중복 금지의 효과를 확인한다.
  for (let i = 49; i < questions.length; i += 50) {
    questions[i].stem = structuredClone(questions[i - 1].stem);
    questions[i].passage = structuredClone(questions[i - 1].passage);
  }
  return { questions, assets };
}

export function makeExamRules(subject: 'law' | 'anatomy' = 'law'): RuleSet {
  const name = subject === 'law' ? '법규' : '해부';
  return makeRuleSet({ id: `fake-rules-${subject}`, subject, examCount: 4, startNumber: subject === 'law' ? 1 : 21,
    slots: [1, 2, 3].map((unit) => ({ id: `unit-${unit}`, label: `가짜 영역 ${unit}`, count: 5,
      filter: { kind: 'objectivePrefix', prefixes: [`${name} ${unit}`] } })),
    constraints: [
      { kind: 'no-overlap-across-exams', params: {} },
      { kind: 'no-duplicate-content', params: { scope: 'run' } },
      { kind: 'distinct-by-segment', params: { depth: 2, scope: 'slot', mode: 'strict-unless-single' } },
    ],
  });
}
