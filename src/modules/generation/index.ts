import type { AssetData, Diagnostic, ExamSnapshot, HistoryEntry, Question, RuleSet, Selector, Shuffler, ShuffleOptions } from '../../contracts/index';
import { buildSnapshot, verifySnapshot } from '../exam-snapshot/index';
import { createRng } from '../rng/index';

export interface GenerationInput {
  rules: RuleSet;
  candidates: Question[];
  assets: Readonly<Record<string, AssetData>>;
  history: HistoryEntry[];
  seed: string;
  shuffle: ShuffleOptions;
  shufflerId?: string;
  titleTemplate: string;
  createdAt: string;
  examIdPrefix: string;
}

export interface GenerationResult {
  snapshots: ExamSnapshot[];
  diagnostics: Diagnostic[];
  historyEntries: HistoryEntry[];
  ok: boolean;
}

export function generateExams(input: GenerationInput, deps: { selector: Selector; shufflers: readonly Shuffler[] }): GenerationResult {
  const diagnostics: Diagnostic[] = [];
  const snapshots: ExamSnapshot[] = [];
  const historyEntries: HistoryEntry[] = [];
  const result = (): GenerationResult => ({ snapshots, diagnostics, historyEntries,
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === 'error') });
  const id = input.shufflerId ?? 'standard';
  const shuffler = deps.shufflers.find((plugin) => plugin.id === id);
  if (!shuffler) {
    diagnostics.push({ severity: 'error', code: 'SHUFFLER_NOT_FOUND',
      message: `섞기 방식 '${id}'를 찾을 수 없습니다. 사용 가능한 방식: ${deps.shufflers.map((plugin) => plugin.id).join(', ') || '(없음)'}. 등록된 방식을 선택하세요.` });
    return result();
  }
  // 주입된 플러그인이 실수로 변경해도 호출자의 문제은행과 규칙은 보존한다.
  const data = structuredClone(input);
  const rng = createRng(input.seed);
  const preview = structuredClone(data);
  diagnostics.push(...deps.selector.precheck(preview.rules, preview.candidates,
    { rng: rng.fork('select'), history: preview.history }));
  const selection = deps.selector.select(data.rules, data.candidates, { rng: rng.fork('select'), history: data.history });
  diagnostics.push(...selection.diagnostics);
  if (selection.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return result();
  if (selection.exams.length !== data.rules.examCount) {
    diagnostics.push({ severity: 'error', code: 'EXAM_COUNT_MISMATCH',
      message: `선택 결과가 요청한 ${data.rules.examCount}회와 다릅니다. 선택기를 확인하고 다시 생성하세요.` });
    return result();
  }
  for (let i = 0; i < data.rules.examCount; i++) {
    const exam = shuffler.apply(selection.exams[i], data.shuffle, rng.fork(`shuffle/exam${i}`));
    const title = data.titleTemplate.replaceAll('{회차}', String(i + 1));
    const built = buildSnapshot({ exam, rules: data.rules, assets: data.assets, examIndex: i, seed: data.seed,
      title, examId: `${data.examIdPrefix}-${i + 1}`, createdAt: data.createdAt });
    diagnostics.push(...built.diagnostics, ...verifySnapshot(built.snapshot));
    snapshots.push(built.snapshot);
    historyEntries.push({ examId: built.snapshot.examId, createdAt: data.createdAt, ruleSetId: data.rules.id,
      seed: data.seed, title, questionIds: built.snapshot.items.filter((item) => !item.blank).map((item) => item.sourceQuestionId) });
  }
  return result();
}
