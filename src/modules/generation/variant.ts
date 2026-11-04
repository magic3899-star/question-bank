import type {
  AssetData,
  ExamSnapshot,
  Question,
  RuleSet,
  Shuffler,
  ShuffleOptions,
  SnapshotItem,
} from '../../contracts/index';
import { canonicalJson } from '../content-model/index';
import { verifySnapshot } from '../exam-snapshot/index';
import { createRng } from '../rng/index';
import type { MutationResult } from './mutations';
import { rebuild, toSelected } from './selected';

function identity(item: SnapshotItem): string {
  return canonicalJson({
    passage: item.passage,
    stem: item.stem,
    explanation: item.explanation,
    objectiveCode: item.objectiveCode,
    grade: item.grade,
    choices: Object.fromEntries(item.choices.map((choice) => [choice.sourceChoiceId, choice.content])),
    answers: item.answerLabels
      .map((label) => item.choices.find((choice) => choice.label === label)?.sourceChoiceId)
      .sort(),
  });
}

function matches(original: ExamSnapshot, variant: ExamSnapshot): boolean {
  const before = original.items.filter((item) => !item.blank);
  const after = variant.items.filter((item) => !item.blank);
  const byId = new Map(before.map((item) => [item.sourceQuestionId, item]));
  return (
    original.items.length === variant.items.length &&
    before.length === after.length &&
    byId.size === before.length &&
    new Set(after.map((item) => item.sourceQuestionId)).size === after.length &&
    after.every((item) => {
      const source = byId.get(item.sourceQuestionId);
      return source !== undefined && identity(source) === identity(item);
    }) &&
    canonicalJson(original.assets) === canonicalJson(variant.assets)
  );
}

export function deriveVariant(
  input: {
    rules: RuleSet;
    sources: readonly Question[];
    assets: Readonly<Record<string, AssetData>>;
    snapshot: ExamSnapshot;
    seed: string;
    shuffle: ShuffleOptions;
  },
  deps: { shufflers: readonly Shuffler[] },
): MutationResult {
  const mismatch: MutationResult = {
    diagnostics: [
      {
        severity: 'error',
        code: 'VARIANT_CONTENT_MISMATCH',
        message: '원본 문제가 시험을 만든 뒤 수정되어 짝수형을 만들 수 없습니다. 시험을 다시 만들어 주세요.',
      },
    ],
  };
  const shuffler = deps.shufflers.find((plugin) => plugin.id === 'standard');
  if (!shuffler)
    return {
      diagnostics: [
        {
          severity: 'error',
          code: 'VARIANT_SHUFFLER_MISSING',
          message: '짝수형을 만드는 기본 섞기 기능이 없습니다. 프로그램을 다시 실행해 주세요.',
        },
      ],
    };
  const originalDiagnostics = verifySnapshot(input.snapshot);
  if (originalDiagnostics.some((diagnostic) => diagnostic.severity === 'error'))
    return { diagnostics: originalDiagnostics };
  const sources = new Map(input.sources.map((question) => [question.id, question]));
  if (
    input.snapshot.items.some((item) => {
      if (item.blank) return false;
      const source = sources.get(item.sourceQuestionId);
      return (
        !source ||
        source.choices.length !== item.choices.length ||
        new Set(item.choices.map((choice) => choice.sourceChoiceId)).size !== item.choices.length ||
        new Set(source.choices.map((choice) => choice.id)).size !== item.choices.length ||
        item.choices.some((choice) => !source.choices.some((entry) => entry.id === choice.sourceChoiceId))
      );
    })
  )
    return mismatch;
  const selected = toSelected(input.snapshot, sources, input.rules);
  const shuffled = shuffler.apply(
    selected,
    {
      shuffleQuestionOrder: true,
      shuffleChoices: true,
      balanceAnswerPositions: input.shuffle.balanceAnswerPositions,
      minAnswerPositionShare: input.shuffle.minAnswerPositionShare,
      sortByObjective: false,
    },
    createRng(input.seed).fork('variant/even'),
  );
  const built = rebuild(
    {
      ...input,
      rules: { ...input.rules, startNumber: input.snapshot.items[0]?.number ?? input.rules.startNumber },
      examIndex: 0,
    },
    shuffled,
    input.snapshot,
  );
  if (!matches(input.snapshot, built.snapshot)) return mismatch;
  if (built.diagnostics.some((diagnostic) => diagnostic.severity === 'error'))
    return { diagnostics: built.diagnostics };
  return {
    ...built,
    snapshot: Object.freeze({
      ...input.snapshot,
      items: built.snapshot.items,
      assets: built.snapshot.assets,
      contentHash: built.snapshot.contentHash,
    }),
  };
}
