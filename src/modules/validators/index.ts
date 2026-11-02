import type { Diagnostic, ValidatableQuestion, Validator } from '../../contracts/index';
import { objectiveMissingValidator } from './objective-missing/index';
import { objectiveFormatValidator } from './objective-format/index';
import { choiceCountValidator } from './choice-count/index';
import { answerValidValidator } from './answer-valid/index';
import { emptyContentValidator } from './empty-content/index';
import { choiceReferenceValidator } from './choice-reference/index';
import { choiceLabelReferenceValidator } from './choice-label-reference/index';
import { duplicateStemValidator } from './duplicate-stem/index';
import { duplicateChoicesValidator } from './duplicate-choices/index';
import { answerDistributionValidator } from './answer-distribution/index';

export const standardValidators: Validator[] = [
  objectiveMissingValidator,
  objectiveFormatValidator,
  choiceCountValidator,
  answerValidValidator,
  emptyContentValidator,
  choiceReferenceValidator,
  choiceLabelReferenceValidator,
  duplicateStemValidator,
  duplicateChoicesValidator,
  answerDistributionValidator,
];

export function runValidators(
  validators: readonly Validator[],
  questions: readonly ValidatableQuestion[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const attach = (diagnostic: Diagnostic, draftIndex?: number): Diagnostic => {
    const question = draftIndex === undefined ? undefined : questions[draftIndex];
    return {
      ...diagnostic,
      ref: {
        ...diagnostic.ref,
        ...(draftIndex === undefined ? {} : { draftIndex }),
        ...(question
          ? { ...('id' in question && typeof question.id === 'string' ? { questionId: question.id } : {}) }
          : {}),
      },
    };
  };
  for (const validator of validators) {
    questions.forEach((question, index) => {
      for (const diagnostic of validator.validate?.(question) ?? [])
        diagnostics.push(attach(diagnostic, index));
    });
    for (const diagnostic of validator.validateAll?.(questions) ?? [])
      diagnostics.push(attach(diagnostic, diagnostic.ref?.draftIndex));
  }
  const order = { error: 0, warn: 1, info: 2 };
  return diagnostics.sort((a, b) => order[a.severity] - order[b.severity]);
}
