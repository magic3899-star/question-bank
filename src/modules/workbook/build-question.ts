import type { DraftQuestion, ParagraphBlock } from '../../contracts/index';
import { isEmptyBlocks, referencesChoiceLabels } from '../content-model/index';
import { findSubjectById } from '../subject-catalog/index';
import type { ParsedAnswer, ParsedQuestion, WorkbookOptions } from './types';

function paragraph(text: string, bold = false): ParagraphBlock {
  return { type: 'paragraph', runs: [{ text, ...(bold ? { bold: true } : {}) }] };
}

export function makeDraftQuestion(
  source: ParsedQuestion,
  answer: ParsedAnswer,
  questionBook: string,
  answerBook: string,
  options: WorkbookOptions,
): DraftQuestion {
  const stem = source.stem.map((text) => paragraph(text));
  const explanation = [
    ...(answer.titleParagraph ? [paragraph(answer.titleParagraph, true)] : []),
    ...answer.paragraphs.map((text) => paragraph(text)),
  ];
  const locked =
    options.lockChoicesOnReference !== false && referencesChoiceLabels([...stem, ...explanation]);
  return {
    sourceLocation: `${questionBook} ${findSubjectById(source.subjectId)!.name} ${source.number}번`,
    question: {
      schemaVersion: 1,
      type: 'mcq',
      subject: source.subjectId,
      stem,
      choices: source.choices.map((text, index) => ({ id: `c${index + 1}`, content: [paragraph(text)] })),
      answerChoiceIds: [`c${'①②③④⑤'.indexOf(answer.answerLabel!) + 1}`],
      explanation,
      ...(answer.objectiveCode ? { objectiveCode: answer.objectiveCode } : {}),
      grade: 'A',
      tags: [],
      extra: { workbook: { questionBook, answerBook, number: source.number } },
      shufflePolicy: locked ? 'lock-all' : 'free',
    },
  };
}

export function isValidDraft(draft: DraftQuestion): boolean {
  const { question } = draft;
  const ids = new Set(question.choices.map((choice) => choice.id));
  return (
    question.choices.length >= 2 &&
    question.choices.length <= 5 &&
    ids.size === question.choices.length &&
    !isEmptyBlocks(question.stem) &&
    question.choices.every((choice) => !isEmptyBlocks(choice.content)) &&
    question.answerChoiceIds.length === 1 &&
    question.answerChoiceIds.every((id) => ids.has(id))
  );
}
