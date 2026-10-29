import assert from 'node:assert/strict';
import type { Question, SelectedExam, Shuffler, ShuffleOptions } from '../../src/contracts/index';
import { createRng } from '../../src/modules/rng/index';
import { deepFreeze, makeChoice, makeQuestion, para } from '../fixtures/builders';

function randomExam(seed: number, count: number): SelectedExam {
  const rng = createRng(`fixture/${seed}/${count}`);
  const questions = Array.from({ length: count }, (_, index) => {
    const choiceCount = 2 + rng.int(5);
    const choices = Array.from({ length: choiceCount }, (_, position) => makeChoice({
      id: `c${position}`, content: [para(position < 2 ? '같은 가짜 선지' : `가짜 선지 ${position}`, { underline: position % 2 === 0 }),
        ...(position === 2 ? [{ type: 'image' as const, assetId: 'fake-choice-image' }] : [])],
      fixedPosition: index % 7 === 0 || index % 3 === 0 && position === 1 || rng.int(6) === 0,
    }));
    const question: Question = makeQuestion({
      id: `q${index}`, subject: 'dummy', objectiveCode: `과목 ${index + 1}-${seed + 1}`,
      passageGroupId: count >= 20 && index < 3 ? 'group-of-three' : count >= 20 && index >= 5 && index <= 6 ? 'group-of-two' : undefined,
      stem: [para(`가짜 ${seed}-${index}`, { bold: true }), { type: 'table', rows: [[[para('가짜 본문 표')]]] }],
      passage: [para('문제에 종속된 가짜 지문'), { type: 'image', assetId: `fake-${index}`, widthPx: 120, heightPx: 60 },
        { type: 'table', rows: [[[para('가짜 표'), { type: 'image', assetId: 'fake-nested' }], [para('가짜 셀')]]] }],
      explanation: [para('가짜 해설', { italic: true })], choices,
      answerChoiceIds: index % 4 === 0 ? [choices[0].id, choices[1].id] : [choices[rng.int(choiceCount)].id],
      shufflePolicy: index % 5 === 1 ? 'lock-all' : 'free',
      extra: { preserved: { value: [seed, index] } }, tags: ['가짜'], sourceTag: `fake-${index}`, grade: 'A',
    });
    return question;
  });
  return { questions, blanks: [{ slotId: 'unfilled', count: seed % 4 + 1 }], slotOfQuestion: Object.fromEntries(questions.map((question, index) => [question.id, `s${index % 3}`])) };
}

function assertResult(input: SelectedExam, output: SelectedExam, options: ShuffleOptions): void {
  assert.deepStrictEqual(output.blanks, input.blanks, '빈 번호가 변했습니다.');
  assert.deepStrictEqual(output.slotOfQuestion, input.slotOfQuestion, '슬롯 대응이 변했습니다.');
  assert.deepStrictEqual(output.questions.map((question) => question.id).sort(), input.questions.map((question) => question.id).sort(), '문제 집합이 변했습니다.');
  assert.equal(new Set(output.questions.map((question) => question.id)).size, output.questions.length, '문제 ID가 중복되었습니다.');
  if (!options.shuffleQuestionOrder) assert.deepStrictEqual(output.questions.map((question) => question.id), input.questions.map((question) => question.id), '문제 순서 유지 옵션을 위반했습니다.');
  const originals = new Map(input.questions.map((question) => [question.id, question]));
  for (const question of output.questions) {
    const original = originals.get(question.id)!;
    assert.notStrictEqual(question, original, '문제 객체를 복사해야 합니다.');
    const { choices: beforeChoices, ...before } = original;
    const { choices: afterChoices, ...after } = question;
    assert.deepStrictEqual(after, before, '선지 외 문제 필드가 변했습니다.');
    const sorted = (choices: Question['choices']) => [...choices].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    assert.deepStrictEqual(sorted(afterChoices), sorted(beforeChoices), '선지 집합·내용이 변했습니다.');
    assert.equal(new Set(afterChoices.map((choice) => choice.id)).size, afterChoices.length, '선지 ID가 중복되었습니다.');
    const beforeMap = new Map(beforeChoices.map((choice) => [choice.id, choice.content]));
    const afterMap = new Map(afterChoices.map((choice) => [choice.id, choice.content]));
    for (const id of original.answerChoiceIds) assert.deepStrictEqual(afterMap.get(id), beforeMap.get(id), '정답이 가리키는 선지 내용이 변했습니다.');
    for (const [index, choice] of beforeChoices.entries()) {
      if (choice.fixedPosition || original.shufflePolicy === 'lock-all' || !options.shuffleChoices) {
        assert.deepStrictEqual(afterChoices[index], choice, '고정 선지 또는 순서 유지 옵션을 위반했습니다.');
      }
    }
  }
  const groups = new Map<string, string[]>();
  for (const question of input.questions) if (question.passageGroupId) {
    const members = groups.get(question.passageGroupId) ?? [];
    members.push(question.id); groups.set(question.passageGroupId, members);
  }
  for (const members of groups.values()) {
    const positions = members.map((id) => output.questions.findIndex((question) => question.id === id));
    assert.deepStrictEqual(positions, Array.from({ length: positions.length }, (_, index) => positions[0] + index), '지문 묶음 연속 배치 또는 내부 순서를 위반했습니다.');
  }
}

export function assertShufflerInvariants(shuffler: Shuffler, seedCount = 500): void {
  let different = 0;
  for (let seed = 0; seed < seedCount; seed++) {
    for (const count of [0, 1, 2, 20]) {
      const exam = deepFreeze(randomExam(seed, count));
      const before = structuredClone(exam);
      for (let bits = 0; bits < 8; bits++) {
        const options = { shuffleQuestionOrder: !!(bits & 1), shuffleChoices: !!(bits & 2), balanceAnswerPositions: !!(bits & 4) };
        const result = shuffler.apply(exam, options, createRng(`shuffle/${seed}`));
        assert.deepStrictEqual(exam, before, '입력 객체를 변형했습니다.');
        assertResult(exam, result, options);
        assert.deepStrictEqual(result, shuffler.apply(exam, options, createRng(`shuffle/${seed}`)), '동일 시드 결과가 다릅니다.');
        if (count === 20 && bits === 3) {
          const other = shuffler.apply(exam, options, createRng(`other/${seed}`));
          if (JSON.stringify(other) !== JSON.stringify(result)) different++;
        }
      }
    }
    const choiceCount = 2 + seed % 5;
    for (const count of [1, 7, 20, 21, 100]) {
      const uniform: SelectedExam = deepFreeze({ questions: Array.from({ length: count }, (_, index) => makeQuestion({
        id: `balanced-${index}`, choices: Array.from({ length: choiceCount }, (_, position) => makeChoice({ id: `c${position}`, content: [para(`가짜 선지 ${position}`)] })),
        answerChoiceIds: [`c${index % choiceCount}`],
      })), blanks: [], slotOfQuestion: {} });
      for (const shuffleQuestionOrder of [false, true]) {
        const options = { shuffleQuestionOrder, shuffleChoices: true, balanceAnswerPositions: true };
        const result = shuffler.apply(uniform, options, createRng(`balance/${seed}`));
        assertResult(uniform, result, options);
        const counts = Array.from({ length: choiceCount }, () => 0);
        for (const question of result.questions) counts[question.choices.findIndex((choice) => choice.id === question.answerChoiceIds[0])]++;
        const raw = Math.ceil(0.1 * count);
        const minimum = choiceCount * raw > count ? Math.floor(count / choiceCount) : raw;
        assert.ok(counts.every((value) => value >= minimum), '정답 위치 최소 비율을 위반했습니다.');
        if (count < choiceCount) assert.ok(counts.every((value) => value <= 1), '소규모 시험에서 가능한 서로 다른 위치를 사용해야 합니다.');
      }
    }
  }
  assert.ok(different >= seedCount * 0.9, '충분히 큰 시험에서 서로 다른 시드 결과가 대부분 같았습니다.');
}
