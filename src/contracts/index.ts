/**
 * contracts — 모든 모듈이 공유하는 유일한 접점.
 *
 * 규칙
 *  - 타입/인터페이스/상수만 둔다. 로직(함수 본문)을 넣지 않는다.
 *  - 다른 어떤 모듈도 import 하지 않는다.
 *  - 호환이 깨지는 변경은 CONTRACT_VERSION 을 올리고 docs/ARCHITECTURE.md 에 기록한다.
 */

export const CONTRACT_VERSION = 1 as const;

/* ────────────────────────────────────────────────────────────
 * 1. 내용 블록 (content-model)
 *    문제 내용은 문자열이 아니라 블록 트리로 저장한다.
 *    → 어떤 출력 형식으로 내보내도 같은 내용이 나온다.
 * ──────────────────────────────────────────────────────────── */

export interface InlineRun {
  text: string;
  underline?: boolean;
  bold?: boolean;
  italic?: boolean;
  superscript?: boolean;
  subscript?: boolean;
}

export interface ParagraphBlock {
  type: 'paragraph';
  runs: InlineRun[];
}

export interface ImageBlock {
  type: 'image';
  assetId: string;
  widthPx?: number;
  heightPx?: number;
  alt?: string;
}

/** rows[행][열] = 셀 안의 블록 목록 */
export interface TableBlock {
  type: 'table';
  rows: Block[][][];
}

export type Block = ParagraphBlock | ImageBlock | TableBlock;

/* ────────────────────────────────────────────────────────────
 * 2. 문제
 * ──────────────────────────────────────────────────────────── */

export interface Choice {
  /** 문제 안에서 유일, 섞여도 변하지 않는 ID. 정답은 위치가 아니라 이 ID로 추적한다. */
  id: string;
  /** ①②③ 같은 번호 문자는 저장하지 않는다. 출력할 때 위치로 붙인다. */
  content: Block[];
  /** true 이면 섞기에서 제외하고 원래 자리를 유지 (예: "①, ② 모두"). */
  fixedPosition?: boolean;
}

/**
 * 선지 섞기 정책
 *  - free      : fixedPosition 이 없는 선지를 자유롭게 섞는다 (기본)
 *  - lock-all  : 이 문제의 선지는 섞지 않는다
 */
export type ShufflePolicy = 'free' | 'lock-all';

export interface Question {
  id: string;
  schemaVersion: number;
  /** 과목 식별자 (예: 'law', 'anatomy'). 코드에 고정하지 않고 데이터로 관리한다. */
  subject: string;
  /** 문제 유형. 'mcq'(객관식) 외 유형은 questionType 플러그인으로 추가. */
  type: string;
  /**
   * 같은 예문(지문)을 공유하는 문항 묶음 ID. 있으면 묶음은 분리·교환되지 않는다.
   * 문제 자체에 딸린 예문/보기는 passage 에 둔다.
   */
  passageGroupId?: string;
  /** 이 문제에 종속된 예문·보기·이미지·표. 문제와 분리되어 이동하지 않는다. */
  passage?: Block[];
  stem: Block[];
  choices: Choice[];
  /** 정답 선지 ID (복수 정답 가능). */
  answerChoiceIds: string[];
  explanation: Block[];
  shufflePolicy: ShufflePolicy;
  /** 학습목표 코드 (예: '법규 1-1-3'). 출제 규칙의 기준. 없을 수 있다. */
  objectiveCode?: string;
  /** 등급 표시 (예: 'A'). 의미는 데이터가 정한다. */
  grade?: string;
  /** 원본 출처 태그 (예: '<2026-3-1>'). */
  sourceTag?: string;
  tags: string[];
  /** 앞으로 추가될 필드를 스키마 변경 없이 담는 자리. */
  extra: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PassageGroup {
  id: string;
  subject: string;
  content: Block[];
}

export interface AssetData {
  id: string;
  mime: string;
  sha256: string;
  /** base64 */
  dataBase64: string;
}

/* ────────────────────────────────────────────────────────────
 * 3. 공통: 진단, 난수
 * ──────────────────────────────────────────────────────────── */

export type Severity = 'error' | 'warn' | 'info';

export interface Diagnostic {
  severity: Severity;
  /** 기계가 구분하는 코드 (예: 'OBJECTIVE_MISSING'). */
  code: string;
  /** 사람이 읽는 한국어 메시지. */
  message: string;
  /** 문제/초안 식별 정보. */
  ref?: { questionId?: string; draftIndex?: number; sourceTag?: string };
}

/** 시드로 재현 가능한 난수. Math.random 을 직접 쓰지 않는다. */
export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [0, n) 정수 */
  int(n: number): number;
  /** 라벨별로 독립된 하위 난수열. 같은 시드+라벨이면 항상 같은 열. */
  fork(label: string): Rng;
  /** 시드 문자열 (기록용). */
  readonly seed: string;
}

/* ────────────────────────────────────────────────────────────
 * 4. 가져오기 / 검수
 * ──────────────────────────────────────────────────────────── */

export interface DraftQuestion {
  question: Omit<Question, 'id' | 'createdAt' | 'updatedAt'>;
  /** 원본 문서에서의 위치 설명 (검수 화면 표시용). */
  sourceLocation?: string;
}

export interface ImportDraft {
  questions: DraftQuestion[];
  passageGroups: PassageGroup[];
  assets: AssetData[];
  diagnostics: Diagnostic[];
}

export interface Importer {
  readonly kind: 'importer';
  readonly id: string;
  readonly label: string;
  readonly extensions: string[];
  /** 파일 내용을 읽어 초안을 만든다. 저장은 하지 않는다. */
  parse(
    input: { fileName: string; data: Uint8Array },
    options?: Record<string, unknown>,
  ): Promise<ImportDraft>;
}

export type ValidatableQuestion = Omit<Question, 'id' | 'createdAt' | 'updatedAt'> | Question;

export interface Validator {
  readonly kind: 'validator';
  readonly id: string;
  readonly label: string;
  /** 문제 하나만 보고 판단하는 검사. */
  validate?(question: ValidatableQuestion): Diagnostic[];
  /** 문제들을 서로 비교해야 하는 검사 (예: 지문 중복). 진단의 ref.draftIndex 는 입력 배열의 위치. */
  validateAll?(questions: readonly ValidatableQuestion[]): Diagnostic[];
}

/* ────────────────────────────────────────────────────────────
 * 5. 출제 규칙 / 선택
 *    규칙은 코드가 아니라 데이터(JSON)로 표현한다.
 * ──────────────────────────────────────────────────────────── */

export type FilterSpec =
  | { kind: 'all' }
  | { kind: 'objectivePrefix'; prefixes: string[] }
  | { kind: 'tag'; tags: string[] }
  | { kind: 'sourceTag'; values: string[] };

export interface SlotSpec {
  id: string;
  label: string;
  /** 시험 1회당 뽑을 문제 수 */
  count: number;
  filter: FilterSpec;
}

/** 플러그인이 해석하는 제약. kind 로 constraint 플러그인을 찾는다. */
export interface ConstraintSpec {
  kind: string;
  params: Record<string, unknown>;
  /** 의미가 확정되지 않은 규칙은 true 로 표시해 화면에 경고한다. */
  needsConfirmation?: boolean;
  note?: string;
}

export interface RuleSet {
  id: string;
  schemaVersion: number;
  name: string;
  subject: string;
  /** 만들 시험 개수 (예: 4개 모의고사) */
  examCount: number;
  /** 첫 문제 번호 (예: 법규 1, 해부 21) */
  startNumber: number;
  slots: SlotSpec[];
  constraints: ConstraintSpec[];
  note?: string;
}

export interface SelectionContext {
  rng: Rng;
  /** 최근 출제 이력 (exclude-recent 같은 제약이 사용) */
  history: HistoryEntry[];
}

export interface SelectedExam {
  /** slot 순서대로 평탄화된 문제 목록 (섞기 전). */
  questions: Question[];
  /** 각 문제가 어느 slot 에서 뽑혔는지. */
  slotOfQuestion: Record<string, string>;
  /** 후보가 모자라 채우지 못한 자리. 시험지에는 빈 번호로 남는다. 모두 채웠으면 빈 배열. */
  blanks: { slotId: string; count: number }[];
}

export interface SelectionResult {
  exams: SelectedExam[];
  diagnostics: Diagnostic[];
}

export interface Selector {
  /** 규칙 실행 전에 후보가 충분한지 점검한다. 부족하면 error 진단을 돌려준다. */
  precheck(rules: RuleSet, candidates: Question[], ctx: SelectionContext): Diagnostic[];
  select(rules: RuleSet, candidates: Question[], ctx: SelectionContext): SelectionResult;
}

export interface Constraint {
  readonly kind: 'constraint';
  readonly id: string;
  readonly label: string;
  /** 이 제약이 선택 후보를 걸러내거나 선택 결과를 검증한다. */
  filterCandidates?(
    spec: ConstraintSpec,
    candidates: Question[],
    state: {
      examIndex: number;
      /** 앞선 회차들의 완성된 시험. */
      chosenSoFar: SelectedExam[];
      /** 지금 뽑는 시험에서 이미 뽑힌 문제 전체 (앞선 슬롯 + 이번 슬롯의 앞선 선택). */
      currentChosen: Question[];
      /**
       * 지금 채우는 슬롯, 그 슬롯에서 이미 뽑힌 문제, 그리고 슬롯의 정적 후보 풀
       * (슬롯 필터에 일치하고 학습목표 코드를 읽을 수 있는 문제 전부, 동적 제약 적용 전).
       */
      slot: { id: string; chosen: Question[]; pool: readonly Question[] };
      ctx: SelectionContext;
    },
  ): Question[];
  verify?(spec: ConstraintSpec, exams: SelectedExam[], ctx: SelectionContext): Diagnostic[];
}

/* ────────────────────────────────────────────────────────────
 * 6. 섞기
 * ──────────────────────────────────────────────────────────── */

export interface ShuffleOptions {
  shuffleQuestionOrder: boolean;
  shuffleChoices: boolean;
  /** 정답 위치(①~⑤)가 한쪽으로 쏠리지 않게 보정 (아래 최소 비율만 보장하고 나머지는 무작위) */
  balanceAnswerPositions: boolean;
  /** 각 정답 위치가 가져야 할 최소 비율 (0~1, 기본 0.1 = 10%). */
  minAnswerPositionShare?: number;
}

export interface Shuffler {
  readonly kind: 'shuffler';
  readonly id: string;
  readonly label: string;
  /** 같은 입력 + 같은 rng 이면 항상 같은 결과여야 한다. */
  apply(exam: SelectedExam, options: ShuffleOptions, rng: Rng): SelectedExam;
}

/* ────────────────────────────────────────────────────────────
 * 7. 시험지 확정본 (exam-snapshot)
 *    출력기는 이것만 받는다. DB 를 읽지 않는다.
 * ──────────────────────────────────────────────────────────── */

export interface SnapshotChoice {
  /** 위치에서 만든 번호 ('①'…). */
  label: string;
  content: Block[];
  sourceChoiceId: string;
}

export interface SnapshotItem {
  /** true 이면 후보 부족으로 비워 둔 번호. 내용 필드는 비어 있다. */
  blank?: boolean;
  number: number;
  sourceQuestionId: string;
  passage?: Block[];
  stem: Block[];
  choices: SnapshotChoice[];
  answerLabels: string[];
  explanation: Block[];
  objectiveCode?: string;
  grade?: string;
}

export interface ExamSnapshot {
  schemaVersion: number;
  examId: string;
  title: string;
  subject: string;
  createdAt: string;
  seed: string;
  ruleSetId: string;
  ruleSetVersion: number;
  items: SnapshotItem[];
  /** 이 시험지에 쓰인 이미지 원본 (자기완결). */
  assets: Record<string, AssetData>;
  /** items+assets 의 정규화 해시. 출력 결과 검증에 쓴다. */
  contentHash: string;
}

/* ────────────────────────────────────────────────────────────
 * 8. 출력
 * ──────────────────────────────────────────────────────────── */

export type ExportPart = 'questions' | 'answers' | 'explanations';

export interface ExportOptions {
  parts: ExportPart[];
  templateId: string;
  /** true 이면 한 파일에 여러 파트, false 이면 파트별 별도 파일. */
  combineParts: boolean;
}

export interface ExportedFile {
  fileName: string;
  mime: string;
  data: Uint8Array;
  part: ExportPart | 'combined';
}

export interface Exporter {
  readonly kind: 'exporter';
  readonly id: string;
  readonly label: string;
  readonly extension: string;
  export(snapshots: ExamSnapshot[], options: ExportOptions): Promise<ExportedFile[]>;
}

/* ────────────────────────────────────────────────────────────
 * 9. 저장소 / 이력 / 백업
 * ──────────────────────────────────────────────────────────── */

export interface QuestionQuery {
  subject?: string;
  objectivePrefix?: string;
  tag?: string;
  text?: string;
  hasObjective?: boolean;
  limit?: number;
  offset?: number;
}

export interface QuestionRepository {
  upsertMany(questions: Question[]): Promise<void>;
  get(id: string): Promise<Question | undefined>;
  query(q: QuestionQuery): Promise<Question[]>;
  count(q?: QuestionQuery): Promise<number>;
  delete(ids: string[]): Promise<void>;
}

export interface AssetRepository {
  put(asset: AssetData): Promise<void>;
  get(id: string): Promise<AssetData | undefined>;
}

export interface PassageGroupRepository {
  upsertMany(groups: PassageGroup[]): Promise<void>;
  get(id: string): Promise<PassageGroup | undefined>;
}

export interface RuleSetRepository {
  save(rules: RuleSet): Promise<void>;
  get(id: string): Promise<RuleSet | undefined>;
  list(subject?: string): Promise<RuleSet[]>;
  delete(id: string): Promise<void>;
}

export interface HistoryEntry {
  examId: string;
  createdAt: string;
  ruleSetId: string;
  seed: string;
  title: string;
  questionIds: string[];
}

export interface HistoryRepository {
  record(entry: HistoryEntry): Promise<void>;
  list(limit?: number): Promise<HistoryEntry[]>;
  recentQuestionIds(lastNExams: number, subject?: string): Promise<Set<string>>;
  /** 출제 이력을 지운다(최근 N회 제외 규칙에서도 빠진다). */
  delete(examIds: string[]): Promise<void>;
}

export interface SnapshotRepository {
  save(snapshot: ExamSnapshot): Promise<void>;
  get(examId: string): Promise<ExamSnapshot | undefined>;
  list(limit?: number): Promise<Pick<ExamSnapshot, 'examId' | 'title' | 'createdAt' | 'subject' | 'seed'>[]>;
  delete(examIds: string[]): Promise<void>;
}

/* ────────────────────────────────────────────────────────────
 * 10. 플러그인 레지스트리
 * ──────────────────────────────────────────────────────────── */

export type Plugin = Importer | Validator | Constraint | Shuffler | Exporter;

export interface PluginRegistry {
  register(plugin: Plugin): void;
  all<K extends Plugin['kind']>(kind: K): Extract<Plugin, { kind: K }>[];
  get<K extends Plugin['kind']>(kind: K, id: string): Extract<Plugin, { kind: K }> | undefined;
}
