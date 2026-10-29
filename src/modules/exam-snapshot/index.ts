import type { AssetData, Diagnostic, ExamSnapshot, RuleSet, SelectedExam, SnapshotItem } from '../../contracts/index';
import { canonicalJson, collectAssetIds, sha256Hex } from '../content-model/index';

const labels = [...'①②③④⑤⑥⑦⑧⑨⑩'];

export interface BuildSnapshotInput {
  exam: SelectedExam;
  rules: RuleSet;
  examIndex: number;
  seed: string;
  title: string;
  examId: string;
  createdAt: string;
  assets: Readonly<Record<string, AssetData>>;
  blankPlacement?: 'slot' | 'end';
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function contentHash(items: SnapshotItem[], assets: Record<string, AssetData>): string {
  const metadata = Object.fromEntries(Object.entries(assets).map(([key, asset]) => [key, {
    id: asset.id, mime: asset.mime, sha256: asset.sha256,
  }]));
  return sha256Hex(canonicalJson({ items, assets: metadata }));
}

function assetIds(item: SnapshotItem): string[] {
  return collectAssetIds([...(item.passage ?? []), ...item.stem,
    ...item.choices.flatMap((choice) => choice.content), ...item.explanation]);
}

function assetDiagnostics(items: SnapshotItem[], assets: Readonly<Record<string, AssetData>>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const checked = new Set<string>();
  for (const item of items) {
    for (const id of assetIds(item)) {
      const ref = { questionId: item.sourceQuestionId };
      const asset = Object.hasOwn(assets, id) ? assets[id] : undefined;
      if (!asset) {
        diagnostics.push({ severity: 'error', code: 'ASSET_MISSING', ref,
          message: `문제 '${item.sourceQuestionId}'의 이미지 '${id}'가 없습니다. 이미지를 다시 가져오세요.` });
        continue;
      }
      if (checked.has(id)) continue;
      checked.add(id);
      let matches = false;
      try {
        const bytes = Uint8Array.from(atob(asset.dataBase64), (char) => char.charCodeAt(0));
        matches = sha256Hex(bytes) === asset.sha256;
      } catch {
        // 손상된 base64도 데이터 무결성 오류로 보고해 확정본 검수를 계속한다.
      }
      if (!matches) diagnostics.push({ severity: 'error', code: 'ASSET_HASH_MISMATCH', ref,
        message: `문제 '${item.sourceQuestionId}'의 이미지 '${id}' 데이터와 SHA-256이 다릅니다. 이미지를 다시 가져오세요.` });
    }
  }
  return diagnostics;
}

export function buildSnapshot(input: BuildSnapshotInput): { snapshot: ExamSnapshot; diagnostics: Diagnostic[] } {
  const { exam, rules } = input;
  const diagnostics: Diagnostic[] = [];
  const items: SnapshotItem[] = [];
  const addQuestion = (question: SelectedExam['questions'][number]): void => {
    if (question.choices.length > labels.length) diagnostics.push({ severity: 'error', code: 'LABEL_OVERFLOW',
      ref: { questionId: question.id }, message: `문제 '${question.id}'의 선지가 10개를 넘습니다. 선지를 10개 이하로 줄이세요.` });
    if (question.answerChoiceIds.some((id) => !question.choices.some((choice) => choice.id === id))) {
      diagnostics.push({ severity: 'error', code: 'ANSWER_CHOICE_MISSING', ref: { questionId: question.id },
        message: `문제 '${question.id}'의 정답 선지가 없습니다. 정답과 선지 ID를 확인하세요.` });
    }
    const choices = question.choices.map((choice, index) => ({
      label: labels[index] ?? `(${index + 1})`, content: structuredClone(choice.content), sourceChoiceId: choice.id,
    }));
    items.push({ number: 0, sourceQuestionId: question.id,
      ...(question.passage !== undefined ? { passage: structuredClone(question.passage) } : {}),
      stem: structuredClone(question.stem), choices,
      answerLabels: choices.filter((choice) => question.answerChoiceIds.includes(choice.sourceChoiceId)).map((choice) => choice.label),
      explanation: structuredClone(question.explanation),
      ...(question.objectiveCode !== undefined ? { objectiveCode: question.objectiveCode } : {}),
      ...(question.grade !== undefined ? { grade: question.grade } : {}),
    });
  };
  const addBlanks = (slotId?: string): void => {
    for (const blank of exam.blanks.filter((entry) => slotId === undefined || entry.slotId === slotId)) {
      for (let i = 0; i < blank.count; i++) items.push({ blank: true, number: 0, sourceQuestionId: '',
        stem: [], choices: [], answerLabels: [], explanation: [] });
    }
  };
  const slotIndices = new Map(rules.slots.map((slot, index) => [slot.id, index]));
  const order = exam.questions.map((question) => slotIndices.get(exam.slotOfQuestion[question.id]));
  const ordered = order.every((index, position) => index !== undefined
    && (position === 0 || order[position - 1]! <= index));
  const knownBlanks = exam.blanks.every((blank) => slotIndices.has(blank.slotId));
  if (input.blankPlacement !== 'end' && ordered && knownBlanks) {
    let position = 0;
    for (const slot of rules.slots) {
      while (position < exam.questions.length && exam.slotOfQuestion[exam.questions[position].id] === slot.id) {
        addQuestion(exam.questions[position++]);
      }
      addBlanks(slot.id);
    }
  } else {
    exam.questions.forEach(addQuestion);
    addBlanks();
  }
  items.forEach((item, index) => { item.number = rules.startNumber + index; });
  const assets: Record<string, AssetData> = Object.fromEntries([...new Set(items.flatMap(assetIds))]
    .filter((id) => Object.hasOwn(input.assets, id)).map((id) => [id, structuredClone(input.assets[id])]));
  diagnostics.push(...assetDiagnostics(items, assets));
  const snapshot: ExamSnapshot = { schemaVersion: 1, examId: input.examId, title: input.title,
    subject: rules.subject, createdAt: input.createdAt, seed: input.seed, ruleSetId: rules.id,
    ruleSetVersion: rules.schemaVersion, items, assets, contentHash: contentHash(items, assets) };
  return { snapshot: freeze(snapshot), diagnostics };
}

export function verifySnapshot(snapshot: ExamSnapshot): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const error = (code: string, message: string, item?: SnapshotItem): void => {
    diagnostics.push({ severity: 'error', code, message,
      ...(item ? { ref: { questionId: item.sourceQuestionId } } : {}) });
  };
  if (snapshot.contentHash !== contentHash(snapshot.items, snapshot.assets)) {
    error('CONTENT_HASH_MISMATCH', '확정본 내용과 해시가 다릅니다. 원본에서 시험지를 다시 생성하세요.');
  }
  snapshot.items.forEach((item, index) => {
    if (!Number.isSafeInteger(item.number) || index > 0 && item.number !== snapshot.items[index - 1].number + 1) {
      error('NUMBER_NOT_CONTIGUOUS', '문항 번호가 연속되지 않습니다. 시작 번호를 확인하고 시험지를 다시 생성하세요.', item);
    }
    if (item.choices.length > labels.length || item.choices.some((choice, i) => choice.label !== labels[i])) {
      error('LABEL_INVALID', '선지 라벨이 현재 위치와 다릅니다. 시험지를 다시 생성하세요.', item);
    }
    if (item.answerLabels.some((label) => !item.choices.some((choice) => choice.label === label))
      || new Set(item.answerLabels).size !== item.answerLabels.length
      || item.answerLabels.some((label, i) => i > 0 && labels.indexOf(label) <= labels.indexOf(item.answerLabels[i - 1]))) {
      error('ANSWER_LABEL_INVALID', '정답 라벨이 선지와 맞지 않거나 순서가 잘못되었습니다. 정답을 확인하고 시험지를 다시 생성하세요.', item);
    }
    if (item.blank && (item.sourceQuestionId !== '' || (item.passage?.length ?? 0) > 0 || item.stem.length > 0
      || item.choices.length > 0 || item.answerLabels.length > 0 || item.explanation.length > 0
      || item.objectiveCode !== undefined || item.grade !== undefined)) {
      error('BLANK_NOT_EMPTY', '빈 번호에 문제 내용이 들어 있습니다. 시험지를 다시 생성하세요.', item);
    }
  });
  diagnostics.push(...assetDiagnostics(snapshot.items, snapshot.assets));
  return diagnostics;
}
