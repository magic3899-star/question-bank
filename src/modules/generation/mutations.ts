import type {
  AssetData,
  Constraint,
  Diagnostic,
  ExamSnapshot,
  Question,
  RuleSet,
  SelectedExam,
  Selector,
  Shuffler,
  ShuffleOptions,
} from '../../contracts/index';
import { questionContentKey } from '../content-model/index';
import { parseObjectiveCode } from '../objective-code/index';
import { createRng } from '../rng/index';
import { generateExams } from './generate';
import { matches, slotOf, toSelected, rebuild } from './selected';

export interface MutationResult {
  /** 바뀐 회차의 새 확정본. 바꾸지 못했으면 undefined. */
  snapshot?: ExamSnapshot;
  diagnostics: Diagnostic[];
}

interface RunInput {
  rules: RuleSet;
  /** 이 실행에 쓰인 문제를 모두 포함한 후보(은행의 같은 과목 문제). */
  candidates: Question[];
  assets: Readonly<Record<string, AssetData>>;
  /** 지금까지 만든 회차 확정본(섞은 뒤). */
  run: readonly ExamSnapshot[];
  examIndex: number;
  seed: string;
  shuffle: ShuffleOptions;
}

function answerShareDiagnostic(snapshot: ExamSnapshot, share: number | undefined): Diagnostic[] {
  const minimumShare = share ?? 0.1;
  const counts = new Map<string, number>();
  let total = 0;
  for (const item of snapshot.items) {
    if (item.blank || item.answerLabels.length !== 1) continue;
    counts.set(item.answerLabels[0]!, (counts.get(item.answerLabels[0]!) ?? 0) + 1);
    total++;
  }
  const required = Math.ceil(total * minimumShare);
  const low = ['①', '②', '③', '④', '⑤'].filter((label) => (counts.get(label) ?? 0) < required);
  if (!total || !required || !low.length) return [];
  return [
    {
      severity: 'info',
      code: 'ANSWER_SHARE_BELOW_MIN',
      message: `문제를 바꾼 뒤 정답 ${low.join('·')} 의 개수가 최소 ${Math.round(minimumShare * 100)}%(${required}개)보다 적습니다. 필요하면 회차를 다시 뽑으세요.`,
    },
  ];
}

/**
 * 한 회차의 한 문제만 같은 슬롯의 다른 문제로 바꾼다.
 * 다른 문제의 순서·선지 순서는 그대로 두고, 모든 제약(회차 간 겹침·같은 지문·중단원 등)을 다시 적용한다.
 */
export function replaceQuestion(
  input: RunInput & { number: number },
  deps: { constraints: readonly Constraint[]; shufflers: readonly Shuffler[] },
): MutationResult {
  const original = input.run[input.examIndex];
  if (!original) return { diagnostics: [error('EXAM_NOT_FOUND', '바꿀 회차를 찾을 수 없습니다.')] };
  const target = original.items.find((item) => item.number === input.number);
  if (!target)
    return { diagnostics: [error('ITEM_NOT_FOUND', `${input.number}번 문항을 찾을 수 없습니다.`)] };
  if (target.blank)
    return {
      diagnostics: [
        error(
          'BLANK_NOT_REPLACEABLE',
          '비워 둔 번호는 후보가 없어 비워진 자리입니다. 회차를 다시 뽑거나 문제를 추가하세요.',
        ),
      ],
    };
  const sources = new Map(input.candidates.map((question) => [question.id, question]));
  const current = sources.get(target.sourceQuestionId);
  if (!current)
    return { diagnostics: [error('SOURCE_MISSING', '원본 문제를 찾을 수 없습니다. 문제은행을 확인하세요.')] };
  const slot = slotOf(input.rules, current);
  if (!slot)
    return {
      diagnostics: [error('SLOT_NOT_FOUND', '이 문제가 속한 출제 슬롯을 찾을 수 없어 바꿀 수 없습니다.')],
    };
  const exams = input.run.map((snapshot) => toSelected(snapshot, sources, input.rules));
  const exam = exams[input.examIndex]!;
  const others = exams.filter((_, index) => index !== input.examIndex);
  const used = new Set(input.run.flatMap((snapshot) => snapshot.items.map((item) => item.sourceQuestionId)));
  const pool = input.candidates.filter(
    (question) => parseObjectiveCode(question.objectiveCode ?? '') !== null && matches(question, slot.filter),
  );
  const currentChosen = exam.questions.filter((question) => question.id !== current.id);
  const slotChosen = currentChosen.filter((question) => exam.slotOfQuestion[question.id] === slot.id);
  const rng = createRng(input.seed).fork(`replace/exam${input.examIndex}/n${input.number}`);
  let available = pool.filter((question) => !used.has(question.id));
  const reductions: string[] = [];
  for (const spec of input.rules.constraints) {
    const plugin = deps.constraints.find((constraint) => constraint.id === spec.kind);
    if (!plugin?.filterCandidates) continue;
    const before = available.length;
    available = plugin.filterCandidates(spec, available, {
      examIndex: input.examIndex,
      chosenSoFar: others,
      currentChosen,
      slot: { id: slot.id, chosen: slotChosen, pool },
      ctx: { rng, history: [] },
    });
    if (available.length < before) reductions.push(`${plugin.label} ${before - available.length}개`);
  }
  if (!available.length)
    return {
      diagnostics: [
        {
          severity: 'warn',
          code: 'NO_REPLACEMENT',
          message: `'${slot.label}'에서 바꿀 수 있는 다른 문제가 없습니다.${reductions.length ? ` 후보를 줄인 규칙: ${reductions.join(', ')}.` : ' 이 슬롯의 문제가 모두 사용 중입니다.'} 문제를 추가하거나 규칙을 확인하세요.`,
        },
      ],
    };
  const picked = available[rng.int(available.length)]!;
  const shuffler = deps.shufflers.find((plugin) => plugin.id === 'standard') ?? deps.shufflers[0];
  const single: SelectedExam = {
    questions: [structuredClone(picked)],
    slotOfQuestion: { [picked.id]: slot.id },
    blanks: [],
  };
  const shuffled = shuffler
    ? shuffler.apply(
        single,
        { ...input.shuffle, shuffleQuestionOrder: false, balanceAnswerPositions: false },
        rng.fork('choices'),
      ).questions[0]!
    : single.questions[0]!;
  const nextQuestions = exam.questions.map((question) => (question.id === current.id ? shuffled : question));
  const replaced: SelectedExam = {
    questions: nextQuestions,
    slotOfQuestion: Object.fromEntries(
      nextQuestions.map((question) => [question.id, slotOf(input.rules, question)?.id ?? '']),
    ),
    blanks: exam.blanks,
  };
  // 바뀐 문제의 학습목표가 달라도 번호가 학습목표 순서를 벗어나지 않게 다시 정렬한다.
  const nextExam =
    input.shuffle.sortByObjective && shuffler
      ? shuffler.apply(
          replaced,
          {
            shuffleQuestionOrder: false,
            shuffleChoices: false,
            balanceAnswerPositions: false,
            sortByObjective: true,
          },
          rng.fork('sort'),
        )
      : replaced;
  const rebuilt = rebuild(input, nextExam, original);
  return {
    snapshot: rebuilt.snapshot,
    diagnostics: [
      ...rebuilt.diagnostics,
      ...answerShareDiagnostic(rebuilt.snapshot, input.shuffle.minAnswerPositionShare),
    ],
  };
}

/** 한 회차만 새 시드로 다시 뽑는다. 다른 회차의 문제·같은 지문과 겹치지 않는다. */
export function regenerateExam(
  input: RunInput,
  deps: { selector: Selector; shufflers: readonly Shuffler[] },
): MutationResult {
  const original = input.run[input.examIndex];
  if (!original) return { diagnostics: [error('EXAM_NOT_FOUND', '다시 뽑을 회차를 찾을 수 없습니다.')] };
  const sources = new Map(input.candidates.map((question) => [question.id, question]));
  const otherIds = new Set(
    input.run
      .filter((_, index) => index !== input.examIndex)
      .flatMap((snapshot) =>
        snapshot.items.filter((item) => !item.blank).map((item) => item.sourceQuestionId),
      ),
  );
  const otherKeys = new Set(
    [...otherIds].flatMap((id) => {
      const question = sources.get(id);
      return question ? [questionContentKey(question)] : [];
    }),
  );
  const candidates = input.candidates.filter(
    (question) => !otherIds.has(question.id) && !otherKeys.has(questionContentKey(question)),
  );
  const result = generateExams(
    {
      rules: {
        ...input.rules,
        examCount: 1,
        startNumber: original.items[0]?.number ?? input.rules.startNumber,
      },
      candidates,
      assets: input.assets,
      history: [],
      seed: input.seed,
      shuffle: input.shuffle,
      titleTemplate: original.title,
      createdAt: original.createdAt,
      examIdPrefix: 'regenerated',
    },
    deps,
  );
  const fresh = result.snapshots[0];
  if (!result.ok || !fresh) return { diagnostics: result.diagnostics };
  // 회차 번호·ID·제목은 원래 회차의 것을 유지한다(내용 해시에는 포함되지 않는다).
  const snapshot: ExamSnapshot = Object.freeze({ ...fresh, examId: original.examId, title: original.title });
  return { snapshot, diagnostics: result.diagnostics };
}

function error(code: string, message: string): Diagnostic {
  return { severity: 'error', code, message };
}
