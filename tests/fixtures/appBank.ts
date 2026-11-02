import type { Block } from '../../src/contracts/index';
import { makeExamBank } from './examBank';

function withoutImages(blocks: Block[]): Block[] {
  return blocks.flatMap((block): Block[] =>
    block.type === 'image'
      ? []
      : block.type === 'table'
        ? [{ ...block, rows: block.rows.map((row) => row.map(withoutImages)) }]
        : [block],
  );
}
export function makeAppBank(): ReturnType<typeof makeExamBank> {
  const bank = makeExamBank();
  bank.questions.forEach((question, index) => {
    if (index % 19 === 0) delete question.objectiveCode;
    if (index % 3 === 0) question.passage = [];
    if (index % 5 !== 0) {
      question.stem = withoutImages(question.stem);
      question.passage = withoutImages(question.passage ?? []);
      question.explanation = withoutImages(question.explanation);
      question.choices = question.choices.map((choice) => ({
        ...choice,
        content: withoutImages(choice.content),
      }));
    }
  });
  return bank;
}
