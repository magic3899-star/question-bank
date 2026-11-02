import assert from 'node:assert/strict';
import type { ExamSnapshot, Question } from '../../src/contracts/index';
import { verifySnapshot } from '../../src/modules/exam-snapshot/index';
import { referencesChoiceLabels } from '../../src/modules/content-model/index';

export function assertSnapshotMatchesSource(
  snapshot: ExamSnapshot,
  sourceQuestionsById: ReadonlyMap<string, Question>,
): void {
  assert.deepStrictEqual(verifySnapshot(snapshot), [], '확정본 자체 무결성 검사에 실패했습니다.');
  for (const [index, item] of snapshot.items.entries()) {
    assert.equal(item.number, snapshot.items[0].number + index, '번호가 연속되지 않습니다.');
    if (item.blank) continue;
    const source = sourceQuestionsById.get(item.sourceQuestionId);
    assert.ok(source, `원본 문제 '${item.sourceQuestionId}'가 없습니다.`);
    assert.deepStrictEqual(item.passage, source.passage, '지문이 원본 그대로 보존되지 않았습니다.');
    assert.deepStrictEqual(item.stem, source.stem, '본문이 원본 그대로 보존되지 않았습니다.');
    assert.deepStrictEqual(item.explanation, source.explanation, '해설이 원본 그대로 보존되지 않았습니다.');
    assert.equal(item.objectiveCode, source.objectiveCode, '학습목표가 변했습니다.');
    assert.equal(item.grade, source.grade, '등급이 변했습니다.');
    if (referencesChoiceLabels([...source.explanation, ...source.stem, ...(source.passage ?? [])])) {
      assert.deepStrictEqual(
        item.choices.map((choice) => choice.sourceChoiceId),
        source.choices.map((choice) => choice.id),
        '해설·본문의 선지 번호 참조와 선지 순서가 어긋납니다.',
      );
    }
    assert.equal(item.choices.length, source.choices.length, '선지 개수가 변했습니다.');
    assert.equal(
      new Set(item.choices.map((choice) => choice.sourceChoiceId)).size,
      item.choices.length,
      '선지 ID가 중복되었습니다.',
    );
    const originalChoices = new Map(source.choices.map((choice) => [choice.id, choice]));
    for (const choice of item.choices) {
      const original = originalChoices.get(choice.sourceChoiceId);
      assert.ok(original, '원본에 없는 선지 ID입니다.');
      assert.deepStrictEqual(choice.content, original.content, '선지 ID와 원본 내용이 일치하지 않습니다.');
    }
    const actualAnswers = item.answerLabels.map((label) =>
      item.choices.find((choice) => choice.label === label)!,
    );
    assert.deepStrictEqual(
      actualAnswers.map((choice) => choice.sourceChoiceId).sort(),
      [...source.answerChoiceIds].sort(),
      '정답 라벨이 원본 정답 ID를 가리키지 않습니다.',
    );
    for (const choice of actualAnswers)
      assert.deepStrictEqual(
        choice.content,
        originalChoices.get(choice.sourceChoiceId)!.content,
        '정답 내용이 변했습니다.',
      );
    for (const [position, choice] of source.choices.entries()) {
      if (choice.fixedPosition || source.shufflePolicy === 'lock-all') {
        assert.equal(item.choices[position].sourceChoiceId, choice.id, '고정 선지 위치가 변했습니다.');
      }
    }
  }
}
