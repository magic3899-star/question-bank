import type { Question, QuestionQuery } from '../../../contracts/index';
import type { Storage } from '../../../modules/storage/index';
import { blocksToPlainText, collectAssetIds, isEmptyBlocks } from '../../../modules/content-model/index';
import {
  compareObjectiveCodes,
  matchesObjectivePrefix,
  parseObjectiveCode,
  segmentKey,
} from '../../../modules/objective-code/index';
import { standardValidators } from '../../../modules/validators/index';
import type {
  BankStats,
  ListRequest,
  ObjectiveNode,
  QuestionDetail,
  QuestionSummary,
  Settings,
} from '../../shared/index';

export function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000)
    throw new Error(`${label}이 올바르지 않습니다. 비어 있지 않은 1,000자 이하의 값을 입력하세요.`);
  return value;
}
function validateList(value: unknown): ListRequest {
  if (!value || typeof value !== 'object')
    throw new Error('검색 조건이 올바르지 않습니다. 검색 조건을 다시 선택하세요.');
  const input = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(input.offset) ||
    (input.offset as number) < 0 ||
    !Number.isSafeInteger(input.limit) ||
    (input.limit as number) < 1 ||
    (input.limit as number) > 100
  ) {
    throw new Error('조회 범위가 올바르지 않습니다. 시작 위치는 0 이상, 조회 개수는 1~100으로 지정하세요.');
  }
  for (const key of ['subject', 'objectivePrefix', 'text', 'batch'])
    if (input[key] !== undefined) requireText(input[key], '검색어');
  if (input.withoutExplanation !== undefined && typeof input.withoutExplanation !== 'boolean')
    throw new Error('해설 필터를 다시 선택하세요.');
  if (input.withoutObjective !== undefined && typeof input.withoutObjective !== 'boolean')
    throw new Error('학습목표 필터가 올바르지 않습니다. 필터를 다시 선택하세요.');
  return input as unknown as ListRequest;
}
function assetIds(q: Question): string[] {
  return collectAssetIds([
    ...q.stem,
    ...(q.passage ?? []),
    ...q.choices.flatMap((c) => c.content),
    ...q.explanation,
  ]);
}
function summarize(q: Question): QuestionSummary {
  return {
    id: q.id,
    subject: q.subject,
    objectiveCode: q.objectiveCode,
    grade: q.grade,
    stemPreview: Array.from(blocksToPlainText(q.stem)).slice(0, 80).join(''),
    hasPassage: !!q.passage?.length,
    hasImage: assetIds(q).length > 0,
    choiceCount: q.choices.length,
    warnings: standardValidators.flatMap((v) => v.validate?.(q) ?? []).filter((d) => d.severity !== 'info')
      .length,
  };
}
export function createBankService(storage: Storage, settings: () => Settings) {
  return {
    async deleteMany(value: unknown): Promise<void> {
      if (!Array.isArray(value) || value.length > 10000)
        throw new Error('삭제할 문제 ID 목록을 확인하세요. 한 번에 10,000개까지 삭제할 수 있습니다.');
      const ids = value.map((id) => requireText(id, '문제 ID'));
      await storage.questions.delete(ids);
    },
    async stats(): Promise<BankStats> {
      const questions = await storage.questions.query({});
      const subjects = new Map(settings().subjects.map((s) => [s.id, s.name]));
      questions.forEach((q) => {
        if (!subjects.has(q.subject)) subjects.set(q.subject, q.subject);
      });
      const bySubject = [...subjects].map(([subject, name]) => {
        const own = questions.filter((q) => q.subject === subject);
        return {
          subject,
          name,
          count: own.length,
          withoutObjective: own.filter((q) => !q.objectiveCode?.trim()).length,
        };
      });
      return {
        total: questions.length,
        bySubject,
        warnings: { withoutObjective: bySubject.reduce((sum, s) => sum + s.withoutObjective, 0) },
      };
    },
    async list(value: unknown) {
      const input = validateList(value);
      const query: QuestionQuery = {
        subject: input.subject,
        text: input.text,
        hasObjective: input.withoutObjective ? false : undefined,
      };
      // 코드 구간 정렬과 누락 목표의 마지막 배치는 페이지를 자르기 전에 적용해야 한다.
      const all = (await storage.questions.query(query)).filter(
        (q) =>
          (!input.batch || q.extra.importBatchId === input.batch || q.extra.addBatchId === input.batch) &&
          (!input.withoutExplanation || isEmptyBlocks(q.explanation)) &&
          (!input.objectivePrefix ||
            (q.objectiveCode && matchesObjectivePrefix(q.objectiveCode, input.objectivePrefix))),
      );
      const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
      const order = new Map(settings().subjects.map((s, index) => [s.id, index]));
      const compareSubject = (a: string, b: string) =>
        (order.get(a) ?? order.size) - (order.get(b) ?? order.size) || compareText(a, b);
      all.sort((a, b) => {
        const created = () => compareText(a.createdAt, b.createdAt) || compareText(a.id, b.id);
        if (input.withoutObjective) return created();
        const left = a.objectiveCode?.trim();
        const right = b.objectiveCode?.trim();
        if (!left || !right) return left ? -1 : right ? 1 : compareSubject(a.subject, b.subject) || created();
        return compareSubject(a.subject, b.subject) || compareObjectiveCodes(left, right) || created();
      });
      return { items: all.slice(input.offset, input.offset + input.limit).map(summarize), total: all.length };
    },
    async objectiveTree(value: unknown): Promise<ObjectiveNode[]> {
      const subject = requireText(value, '과목');
      const roots: ObjectiveNode[] = [];
      const questions = await storage.questions.query({ subject });
      for (const q of questions) {
        const parsed = q.objectiveCode && parseObjectiveCode(q.objectiveCode);
        if (!parsed) continue;
        let siblings = roots;
        for (let depth = 1; depth <= parsed.segments.length; depth++) {
          const code = segmentKey(q.objectiveCode!, depth)!;
          let node = siblings.find((item) => item.code === code);
          if (!node) {
            node = { code, count: 0, children: [] };
            siblings.push(node);
          }
          node.count++;
          siblings = node.children;
        }
      }
      const sort = (nodes: ObjectiveNode[]): ObjectiveNode[] =>
        nodes
          .sort((a, b) => compareObjectiveCodes(a.code, b.code))
          .map((n) => ({ ...n, children: sort(n.children) }));
      return sort(roots);
    },
    async get(value: unknown): Promise<QuestionDetail> {
      const question = await storage.questions.get(requireText(value, '문제 ID'));
      if (!question) throw new Error('문제를 찾을 수 없습니다. 목록을 새로 고친 뒤 다시 선택하세요.');
      const assets: QuestionDetail['assets'] = {};
      for (const id of assetIds(question)) {
        const asset = await storage.assets.get(id);
        if (asset) assets[id] = asset;
      }
      return { question, assets };
    },
  };
}
