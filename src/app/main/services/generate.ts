import { randomUUID } from 'node:crypto';
import type { AssetData, ExamSnapshot, Question, RuleSet, ShuffleOptions } from '../../../contracts/index';
import { collectAssetIds } from '../../../modules/content-model/index';
import { standardConstraints } from '../../../modules/constraints/index';
import {
  deriveVariant,
  generateExams,
  regenerateExam,
  replaceQuestion,
} from '../../../modules/generation/index';
import { parseObjectiveCode } from '../../../modules/objective-code/index';
import { createSelector } from '../../../modules/selector/index';
import { shufflers } from '../../../modules/shuffler/index';
import type { Storage } from '../../../modules/storage/index';
import type { ExamSession, GenerateRequest, ShuffleSettings } from '../../shared/index';
import { requireText } from './bank';

interface Session {
  id: string;
  rules: RuleSet;
  candidates: Question[];
  assets: Record<string, AssetData>;
  shuffle: ShuffleOptions;
  seed: string;
  snapshots: ExamSnapshot[];
  diagnostics: ExamSession['diagnostics'];
  saved: Set<string>;
  paired: Set<string>;
  edits: number;
  busy: boolean;
}

function parseShuffle(value: unknown): ShuffleSettings {
  const input = (value ?? {}) as Partial<ShuffleSettings>;
  const share = Number(input.minAnswerPositionShare ?? 0.1);
  if (!Number.isFinite(share) || share < 0 || share > 0.2)
    throw new Error('정답 위치 최소 비율은 0~20% 사이로 입력하세요.');
  return {
    shuffleQuestionOrder: input.shuffleQuestionOrder !== false,
    sortByObjective: input.sortByObjective !== false,
    shuffleChoices: input.shuffleChoices !== false,
    balanceAnswerPositions: input.balanceAnswerPositions !== false,
    minAnswerPositionShare: share,
  };
}

function questionAssets(questions: Question[]): string[] {
  return [
    ...new Set(
      questions.flatMap((question) => [
        ...collectAssetIds(question.stem),
        ...collectAssetIds(question.passage ?? []),
        ...collectAssetIds(question.explanation),
        ...question.choices.flatMap((choice) => collectAssetIds(choice.content)),
      ]),
    ),
  ];
}

export function createGenerateService(
  storage: Storage,
  deps: { now: () => string; randomSeed?: () => string; getRules: (id: string) => Promise<RuleSet> },
) {
  const sessions = new Map<string, Session>();
  const selector = createSelector(standardConstraints);
  const randomSeed = deps.randomSeed ?? (() => randomUUID().slice(0, 8).toUpperCase());
  const view = (session: Session): ExamSession => ({
    sessionId: session.id,
    ruleSetId: session.rules.id,
    ruleName: session.rules.name,
    subject: session.rules.subject,
    seed: session.seed,
    snapshots: session.snapshots,
    diagnostics: session.diagnostics,
    savedExamIds: [...session.saved],
  });
  const find = (value: unknown): Session => {
    const session = sessions.get(requireText(value, '시험 세션'));
    if (!session) throw new Error('만든 시험을 찾을 수 없습니다. 시험을 다시 만드세요.');
    if (session.busy) throw new Error('이 시험을 처리 중입니다. 잠시 후 다시 시도하세요.');
    return session;
  };
  const indexOf = (session: Session, value: unknown): number => {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= session.snapshots.length)
      throw new Error('회차 번호가 올바르지 않습니다.');
    return index;
  };
  return {
    async generate(value: unknown): Promise<ExamSession> {
      const input = (value ?? {}) as Partial<GenerateRequest>;
      const base = await deps.getRules(requireText(input.ruleSetId, '출제 규칙'));
      const shuffle = parseShuffle(input.shuffle);
      const exclude = input.excludeRecentExams === undefined ? 0 : Number(input.excludeRecentExams);
      if (!Number.isInteger(exclude) || exclude < 0 || exclude > 100)
        throw new Error('최근 출제 제외 회차는 0~100 사이 정수로 입력하세요.');
      const rules: RuleSet = structuredClone(base);
      if (exclude > 0) rules.constraints.push({ kind: 'exclude-recent', params: { lastNExams: exclude } });
      const candidates = (await storage.questions.query({ subject: rules.subject })).filter(
        (question) => parseObjectiveCode(question.objectiveCode ?? '') !== null,
      );
      const assets: Record<string, AssetData> = {};
      for (const id of questionAssets(candidates)) {
        const asset = await storage.assets.get(id);
        if (asset) assets[id] = asset;
      }
      const seed = (typeof input.seed === 'string' && input.seed.trim()) || randomSeed();
      if (seed.length > 64) throw new Error('다시 만들기 번호는 64자 이내로 입력하세요.');
      const template =
        typeof input.titleTemplate === 'string' && input.titleTemplate.trim()
          ? input.titleTemplate.trim()
          : `${rules.name} 모의고사 {회차}회`;
      const result = generateExams(
        {
          rules,
          candidates,
          assets,
          history: await storage.history.list(1000),
          seed,
          shuffle,
          titleTemplate: template,
          createdAt: deps.now(),
          examIdPrefix: `exam-${randomUUID().slice(0, 8)}`,
        },
        { selector, shufflers },
      );
      if (!result.ok || !result.snapshots.length)
        throw new Error(
          result.diagnostics
            .filter((item) => item.severity === 'error')
            .map((item) => item.message)
            .join(' ') || '시험을 만들지 못했습니다. 출제 규칙과 문제은행을 확인하세요.',
        );
      const session: Session = {
        id: randomUUID(),
        rules,
        candidates,
        assets,
        shuffle,
        seed,
        snapshots: result.snapshots,
        diagnostics: result.diagnostics,
        saved: new Set(),
        paired: new Set(),
        edits: 0,
        busy: false,
      };
      sessions.set(session.id, session);
      return view(session);
    },
    get(value: unknown): ExamSession {
      return view(find(value));
    },
    replace(value: unknown): ExamSession {
      const input = (value ?? {}) as { sessionId?: unknown; examIndex?: unknown; number?: unknown };
      const session = find(input.sessionId);
      const examIndex = indexOf(session, input.examIndex);
      const number = Number(input.number);
      const result = replaceQuestion(
        {
          rules: session.rules,
          candidates: session.candidates,
          assets: session.assets,
          run: session.snapshots,
          examIndex,
          number,
          seed: `${session.seed}/edit${++session.edits}`,
          shuffle: session.shuffle,
        },
        { constraints: standardConstraints, shufflers },
      );
      if (!result.snapshot)
        throw new Error(
          result.diagnostics.map((item) => item.message).join(' ') || '문제를 바꾸지 못했습니다.',
        );
      this.applyChange(session, examIndex, result.snapshot);
      session.diagnostics = result.diagnostics;
      return view(session);
    },
    regenerate(value: unknown): ExamSession {
      const input = (value ?? {}) as { sessionId?: unknown; examIndex?: unknown };
      const session = find(input.sessionId);
      const examIndex = indexOf(session, input.examIndex);
      const result = regenerateExam(
        {
          rules: session.rules,
          candidates: session.candidates,
          assets: session.assets,
          run: session.snapshots,
          examIndex,
          seed: `${session.seed}/regen${++session.edits}`,
          shuffle: session.shuffle,
        },
        { selector, shufflers },
      );
      if (!result.snapshot)
        throw new Error(
          result.diagnostics.map((item) => item.message).join(' ') || '회차를 다시 뽑지 못했습니다.',
        );
      this.applyChange(session, examIndex, result.snapshot);
      session.diagnostics = result.diagnostics;
      return view(session);
    },
    applyChange(session: Session, examIndex: number, snapshot: ExamSnapshot): void {
      const previous = session.snapshots[examIndex]!;
      // 출력 실패 뒤에도 저장된 짝수형이 남을 수 있어, 파생 뒤 변경도 새 ID로 연결한다.
      const examId =
        session.saved.has(previous.examId) || session.paired.has(previous.examId)
          ? `${previous.examId}-r${session.edits}`
          : previous.examId;
      session.snapshots = session.snapshots.map((item, index) =>
        index === examIndex ? Object.freeze({ ...snapshot, examId }) : item,
      );
    },
    discard(value: unknown): void {
      sessions.delete(requireText(value, '시험 세션'));
    },
    /** 저장 서비스가 세션의 확정본을 쓰고, 저장한 회차를 표시한다. */
    session(value: unknown) {
      const session = find(value);
      return {
        snapshots: session.snapshots,
        rules: session.rules,
        deriveEvenType: (snapshot: ExamSnapshot): ExamSnapshot => {
          const ids = new Set(
            snapshot.items.filter((item) => !item.blank).map((item) => item.sourceQuestionId),
          );
          const sources = session.candidates.filter((question) => ids.has(question.id));
          if (sources.length !== ids.size)
            throw new Error('시험을 만들 때 사용한 원본 문제를 찾을 수 없습니다. 시험을 다시 만들어 주세요.');
          const result = deriveVariant(
            {
              rules: session.rules,
              sources,
              assets: snapshot.assets,
              snapshot,
              seed: `${snapshot.seed}/${snapshot.examId}`,
              shuffle: session.shuffle,
            },
            { shufflers },
          );
          if (!result.snapshot) throw new Error(result.diagnostics.map((item) => item.message).join(' '));
          session.paired.add(snapshot.examId);
          return result.snapshot;
        },
        markSaved: (ids: string[]) => ids.forEach((id) => session.saved.add(id)),
      };
    },
  };
}
