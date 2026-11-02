import { randomUUID } from 'node:crypto';
import type { Diagnostic, Question } from '../../../contracts/index';
import type { Storage } from '../../../modules/storage/index';
import {
  collectAssetIds,
  isEmptyBlocks,
  questionContentKey,
  blocksToPlainText,
  referencesChoiceLabels,
} from '../../../modules/content-model/index';
import { parseQuestionText, parseExplanationText } from '../../../modules/importers/text/index';
import { parseObjectiveCode, compareObjectiveCodes } from '../../../modules/objective-code/index';
import { standardValidators } from '../../../modules/validators/index';
import type { EditorParseResult, ParsedExplanation, SaveResult } from '../../shared/index';
import { blocks, imageAsset, questionInput, record } from './editor-input';

function textInput(value: unknown): string {
  const { text } = record(value);
  if (typeof text !== 'string' || !text.trim() || text.length > 2000000)
    throw new Error('붙여넣을 글자는 비어 있지 않은 200만 자 이하로 입력하세요.');
  return text;
}
export function createEditorService(storage: Storage, options: { now: () => string; id?: () => string }) {
  const id = options.id ?? randomUUID;
  let saving = false;
  const validate = (value: unknown): Diagnostic[] => {
    const q = questionInput(value);
    const diagnostics = standardValidators.flatMap((v) => v.validate?.(q) ?? []);
    if (q.objectiveCode?.trim() && !parseObjectiveCode(q.objectiveCode))
      diagnostics.push({
        severity: 'error',
        code: 'OBJECTIVE_INVALID',
        message: '학습목표 형식을 확인하세요. 예: 법규 1-1-3',
      });
    if (isEmptyBlocks(q.explanation))
      diagnostics.push({
        severity: 'info',
        code: 'EXPLANATION_EMPTY',
        message: '해설이 비었습니다. 저장 후 해설을 따로 붙일 수 있습니다.',
      });
    if (q.choices.some((choice) => /^\s*[①-⑩]/u.test(blocksToPlainText(choice.content))))
      diagnostics.push({
        severity: 'error',
        code: 'CHOICE_LABEL_PREFIX',
        message:
          '선지 내용 앞의 원문자 번호를 지우세요. 번호는 화면과 출력에서 위치에 따라 자동으로 붙습니다.',
      });
    return diagnostics;
  };
  return {
    validate,
    addAsset: imageAsset,
    async save(value: unknown): Promise<SaveResult> {
      if (saving) throw new Error('문제를 저장 중입니다. 완료된 뒤 다시 저장하세요.');
      saving = true;
      try {
        const input = record(value);
        const q = questionInput(input.question);
        if (
          referencesChoiceLabels([...q.stem, ...(q.passage ?? []), ...q.explanation]) &&
          q.extra.allowChoiceShuffle !== true
        )
          q.shufflePolicy = 'lock-all';
        if (!Array.isArray(input.assets) || (input.force !== undefined && typeof input.force !== 'boolean'))
          throw new Error('저장 요청과 이미지 목록을 확인하세요.');
        const errors = validate(q).filter((d) => d.severity === 'error');
        if (errors.length) throw new Error(errors.map((d) => d.message).join('\n'));
        const previous = q.id ? await storage.questions.get(q.id) : undefined;
        if (q.id && !previous) throw new Error('편집할 문제가 없습니다. 목록을 새로 고치세요.');
        const duplicates = (await storage.questions.query({ subject: q.subject })).filter(
          (other) => other.id !== q.id && questionContentKey(other) === questionContentKey(q),
        );
        if (duplicates.length && !input.force) return { saved: false, duplicates };
        const assets = await Promise.all(
          input.assets.map(async (asset) => {
            const a = record(asset);
            if (typeof a.dataBase64 !== 'string' || a.dataBase64.length > 14000000)
              throw new Error('이미지 데이터를 다시 추가하세요.');
            const existing = typeof a.id === 'string' ? await storage.assets.get(a.id) : undefined;
            if (
              existing &&
              existing.dataBase64 === a.dataBase64 &&
              existing.mime === a.mime &&
              existing.sha256 === a.sha256
            )
              return existing;
            const checked = imageAsset({ bytes: Buffer.from(a.dataBase64, 'base64'), mime: a.mime });
            if (checked.id !== a.id || checked.sha256 !== a.sha256)
              throw new Error('이미지 식별자가 맞지 않습니다. 이미지를 다시 추가하세요.');
            return checked;
          }),
        );
        const used = collectAssetIds([
          ...q.stem,
          ...(q.passage ?? []),
          ...q.explanation,
          ...q.choices.flatMap((c) => c.content),
        ]);
        for (const assetId of used)
          if (!assets.some((a) => a.id === assetId) && !(await storage.assets.get(assetId)))
            throw new Error('문제의 이미지가 없습니다. 이미지를 다시 추가하세요.');
        const timestamp = options.now();
        const saved: Question = {
          ...q,
          id: previous?.id ?? id(),
          createdAt: previous?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };
        for (const asset of assets.filter((a) => used.includes(a.id))) await storage.assets.put(asset);
        await storage.questions.upsertMany([saved]);
        return { saved: true, question: saved, previous };
      } finally {
        saving = false;
      }
    },
    async delete(value: unknown): Promise<Question[]> {
      if (!Array.isArray(value) || value.length > 10000 || value.some((v) => typeof v !== 'string' || !v))
        throw new Error('삭제할 문제 ID 목록을 확인하세요.');
      const questions = await Promise.all((value as string[]).map((key) => storage.questions.get(key)));
      await storage.questions.delete(value as string[]);
      return questions.filter((q): q is Question => !!q);
    },
    async restore(value: unknown): Promise<void> {
      if (!Array.isArray(value) || value.length > 10000) throw new Error('복원할 문제 목록을 확인하세요.');
      const questions = value.map(questionInput);
      if (questions.some((q) => !q.id)) throw new Error('복원할 문제 ID가 없습니다.');
      await storage.questions.upsertMany(questions);
    },
    async objectiveCodes(value: unknown): Promise<string[]> {
      if (typeof value !== 'string' || !value.trim()) throw new Error('과목을 선택하세요.');
      return [
        ...new Set(
          (await storage.questions.query({ subject: value })).flatMap((q) =>
            q.objectiveCode?.trim() ? [q.objectiveCode.trim()] : [],
          ),
        ),
      ].sort(compareObjectiveCodes);
    },
    parseText(value: unknown): EditorParseResult {
      const text = textInput(value);
      const { subject } = record(value);
      if (typeof subject !== 'string' || !subject.trim()) throw new Error('과목을 선택한 뒤 해석하세요.');
      const parsed = parseQuestionText(text, {
        subject,
        includeGrades: null,
        requireObjective: false,
        dedupeByPassage: false,
      });
      const batchId = id();
      const questions = parsed.questions.map((draft, index): Question => ({
        ...draft.question,
        id: '',
        createdAt: '',
        updatedAt: '',
        extra: { ...draft.question.extra, addBatchId: batchId, addOrder: index + 1 },
      }));
      return {
        batchId,
        questions,
        diagnostics: [
          ...parsed.diagnostics,
          ...questions.flatMap((q, draftIndex) =>
            [
              ...validate(q),
              ...parsed.diagnostics
                .filter((d) => d.code === 'PDF_ARTIFACT_SUSPECTED' && d.ref?.draftIndex === undefined)
                .map((d) => ({ ...d, message: `이번 붙여넣기 전체 경고: ${d.message}` })),
            ].map((d) => ({ ...d, ref: { draftIndex } })),
          ),
        ],
      };
    },
    parseExplanations(value: unknown): ParsedExplanation[] {
      return parseExplanationText(textInput(value)).map((entry) => {
        const text = blocksToPlainText(entry.explanation);
        const answer = /정답\s*[:：]?\s*((?:[①-⑩]|\d+)(?:[\s,，]+(?:[①-⑩]|\d+))*)/u.exec(text)?.[1] ?? '';
        const positions = [...answer.matchAll(/[①-⑩]|\d+/gu)].map((m) =>
          '①②③④⑤⑥⑦⑧⑨⑩'.includes(m[0]) ? '①②③④⑤⑥⑦⑧⑨⑩'.indexOf(m[0]) + 1 : Number(m[0]),
        );
        return { ...entry, answerPositions: [...new Set(positions)] };
      });
    },
    async applyExplanations(value: unknown): Promise<Question[]> {
      const { pairs } = record(value);
      if (!Array.isArray(pairs) || !pairs.length || pairs.length > 10000)
        throw new Error('적용할 해설 짝을 선택하세요.');
      const changed: Question[] = [];
      const seen = new Set<string>();
      let batch: unknown;
      for (const pair of pairs) {
        const p = record(pair);
        if (typeof p.questionId !== 'string' || seen.has(p.questionId))
          throw new Error('해설에 중복된 문제 ID가 있습니다. 짝을 확인하세요.');
        seen.add(p.questionId);
        const q = await storage.questions.get(p.questionId);
        if (!q || !q.extra.addBatchId)
          throw new Error('이번 추가 묶음의 저장된 문제만 해설을 적용할 수 있습니다.');
        batch ??= q.extra.addBatchId;
        if (batch !== q.extra.addBatchId || String(q.extra.originalNumber ?? q.extra.addOrder) !== p.number)
          throw new Error('문제의 묶음 또는 원래 번호가 해설 번호와 다릅니다. 짝을 다시 확인하세요.');
        blocks(p.explanation);
        q.explanation = structuredClone(p.explanation);
        if (p.answerPositions !== undefined) {
          if (
            !Array.isArray(p.answerPositions) ||
            p.answerPositions.some((n) => !Number.isInteger(n) || n < 1 || n > q.choices.length)
          )
            throw new Error('해설의 정답 번호가 선지 범위를 벗어납니다. 정답을 확인하세요.');
          q.answerChoiceIds = [...new Set((p.answerPositions as number[]).map((n) => q.choices[n - 1]!.id))];
        }
        if (referencesChoiceLabels([...q.stem, ...(q.passage ?? []), ...q.explanation]))
          q.shufflePolicy = 'lock-all';
        q.updatedAt = options.now();
        changed.push(q);
      }
      await storage.questions.upsertMany(changed);
      return changed;
    },
  };
}
