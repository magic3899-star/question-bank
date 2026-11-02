import type { Question, Rng, SelectedExam, Shuffler } from '../../../contracts/index';
import { shuffled } from '../../rng/index';

function balancedTargets(questions: Question[], rng: Rng, share: number): Map<string, number> {
  const targets = new Map<string, number>();
  if (!(share > 0)) return targets;
  const eligible = shuffled(
    questions.flatMap((question) => {
      if (question.shufflePolicy !== 'free' || question.answerChoiceIds.length !== 1) return [];
      const answer = question.choices.find((choice) => choice.id === question.answerChoiceIds[0]);
      if (!answer || answer.fixedPosition) return [];
      return [
        {
          question,
          positions: shuffled(
            question.choices.flatMap((choice, index) => (choice.fixedPosition ? [] : [index])),
            rng,
          ),
        },
      ];
    }),
    rng,
  );
  const n = eligible.length;
  const positions = Math.max(0, ...eligible.map((entry) => entry.question.choices.length)) || 5;
  let minimum = Math.ceil(Math.min(1, share) * n);
  if (positions * minimum > n) minimum = Math.floor(n / positions);
  // 최소 할당만 이분 매칭으로 확보하고 남은 문제는 일반 섞기의 무작위 위치를 사용한다.
  const seats = shuffled(
    Array.from({ length: positions }, (_, position) => position),
    rng,
  ).flatMap((position) => Array.from({ length: n < positions ? 1 : minimum }, () => position));
  const assigned = new Map<number, number>();
  const fill = (seat: number, visited: Set<number>): boolean => {
    for (let index = 0; index < eligible.length; index++) {
      if (visited.has(index) || !eligible[index].positions.includes(seats[seat])) continue;
      visited.add(index);
      const previous = assigned.get(index);
      if (previous === undefined || fill(previous, visited)) {
        assigned.set(index, seat);
        return true;
      }
    }
    return false;
  };
  for (let seat = 0; seat < seats.length; seat++) fill(seat, new Set());
  for (const [index, seat] of assigned) targets.set(eligible[index].question.id, seats[seat]);
  return targets;
}

export const standardShuffler: Shuffler = {
  kind: 'shuffler',
  id: 'standard',
  label: '기본 섞기',
  apply(exam, options, rng): SelectedExam {
    const result = structuredClone(exam);
    if (options.shuffleChoices) {
      const targets = options.balanceAnswerPositions
        ? balancedTargets(result.questions, rng.fork('balance'), options.minAnswerPositionShare ?? 0.1)
        : new Map<string, number>();
      for (const question of result.questions) {
        if (question.shufflePolicy !== 'free') continue;
        const choiceRng = rng.fork(`choices/${question.id}`);
        const positions = question.choices.flatMap((choice, index) => (choice.fixedPosition ? [] : [index]));
        const target = targets.get(question.id);
        const answer =
          target === undefined
            ? undefined
            : question.choices.find((choice) => choice.id === question.answerChoiceIds[0]);
        const movable = shuffled(
          positions
            .map((index) => question.choices[index])
            .filter((choice) => !answer || choice.id !== answer.id),
          choiceRng,
        );
        let index = 0;
        for (const position of positions)
          question.choices[position] = position === target && answer ? answer : movable[index++];
      }
    }
    if (options.shuffleQuestionOrder) {
      const groups = new Map<string, Question[]>();
      const units: Question[][] = [];
      for (const question of result.questions) {
        if (!question.passageGroupId) {
          units.push([question]);
          continue;
        }
        let group = groups.get(question.passageGroupId);
        if (!group) {
          group = [];
          groups.set(question.passageGroupId, group);
          units.push(group);
        }
        group.push(question);
      }
      result.questions = shuffled(units, rng.fork('order')).flat();
    }
    return result;
  },
};
