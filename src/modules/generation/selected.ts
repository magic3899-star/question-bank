import type {
  AssetData,
  Diagnostic,
  ExamSnapshot,
  FilterSpec,
  Question,
  RuleSet,
  SelectedExam,
  SlotSpec,
} from '../../contracts/index';
import { buildSnapshot, verifySnapshot } from '../exam-snapshot/index';
import { matchesObjectivePrefix } from '../objective-code/index';

export function matches(question: Question, filter: FilterSpec): boolean {
  switch (filter.kind) {
    case 'all':
      return true;
    case 'objectivePrefix':
      return filter.prefixes.some((prefix) => matchesObjectivePrefix(question.objectiveCode ?? '', prefix));
    case 'tag':
      return filter.tags.some((tag) => question.tags.includes(tag));
    case 'sourceTag':
      return filter.values.some((value) => question.sourceTag === value);
  }
}

export function slotOf(rules: RuleSet, question: Question): SlotSpec | undefined {
  return rules.slots.find((slot) => matches(question, slot.filter));
}

/** 확정본 하나를 선지 순서까지 그대로 반영한 선택 결과로 되돌린다(번호 순서 유지). */
export function toSelected(
  snapshot: ExamSnapshot,
  sources: ReadonlyMap<string, Question>,
  rules: RuleSet,
): SelectedExam {
  const questions: Question[] = [];
  const slotOfQuestion: Record<string, string> = {};
  let blankCount = 0;
  for (const item of snapshot.items) {
    if (item.blank) {
      blankCount++;
      continue;
    }
    const source = sources.get(item.sourceQuestionId);
    if (!source) continue;
    const byId = new Map(source.choices.map((choice) => [choice.id, choice]));
    const ordered = item.choices.map((choice) => byId.get(choice.sourceChoiceId)!).filter(Boolean);
    questions.push({ ...structuredClone(source), choices: structuredClone(ordered) });
    slotOfQuestion[source.id] = slotOf(rules, source)?.id ?? '';
  }
  return { questions, slotOfQuestion, blanks: blankCount ? [{ slotId: '', count: blankCount }] : [] };
}

export function rebuild(
  input: { rules: RuleSet; assets: Readonly<Record<string, AssetData>>; examIndex: number },
  exam: SelectedExam,
  original: ExamSnapshot,
): { snapshot: ExamSnapshot; diagnostics: Diagnostic[] } {
  const built = buildSnapshot({
    exam,
    rules: input.rules,
    examIndex: input.examIndex,
    seed: original.seed,
    title: original.title,
    examId: original.examId,
    createdAt: original.createdAt,
    assets: input.assets,
    blankPlacement: 'end',
  });
  return { snapshot: built.snapshot, diagnostics: [...built.diagnostics, ...verifySnapshot(built.snapshot)] };
}
