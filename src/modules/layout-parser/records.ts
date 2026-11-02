import type { Block, Diagnostic, DraftQuestion, InlineRun } from '../../contracts/index';
import { blocksToPlainText } from '../content-model/index';
import type { LayoutProfile } from './profile';
import type { Entry, LocatedDiagnostic } from './types';
function stripPrefix(block: Block, length: number): Block {
  if (block.type !== 'paragraph') return block;
  let remaining = length;
  let trimming = true;
  const runs: InlineRun[] = [];
  for (const run of block.runs) {
    const removed = Math.min(remaining, run.text.length);
    remaining -= removed;
    let text = run.text.slice(removed);
    if (trimming) text = text.trimStart();
    if (text) {
      runs.push({ ...run, text });
      trimming = false;
    }
  }
  return { type: 'paragraph', runs };
}

export function records(
  entries: Entry[],
  profile: LayoutProfile,
  fileName: string,
  subject: string,
  reader: {
    diagnostics: LocatedDiagnostic[];
    report(code: string, severity: Diagnostic['severity'], message: string, position: number): void;
  },
): DraftQuestion[] {
  const source = new RegExp(profile.sourceTagPattern, 'u');
  const stem = new RegExp(profile.stemStartPattern, 'u');
  const answer = new RegExp(profile.answerLabelPattern, 'u');
  const explanation = new RegExp(profile.explanationLabelPattern, 'u');
  const objective = new RegExp(profile.objectiveLinePattern, 'u');
  const fixed = profile.fixedChoicePatterns.map((pattern) => new RegExp(pattern, 'u'));
  const marker = (text: string): string | undefined =>
    profile.choiceMarkers.find((value) => text.trimStart().startsWith(value));
  const escapedMarkers = profile.choiceMarkers.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const answerMarkers = new RegExp(escapedMarkers.sort((a, b) => b.length - a.length).join('|'), 'gu');
  const questions: DraftQuestion[] = [];
  const owners = new Map<number, { draftIndex?: number }>();
  let current: DraftQuestion['question'] | undefined;
  let mode: 'passage' | 'choices' | 'answer' | 'explanation' = 'passage';
  let beforeFirstBoundary = true;
  let discarded: Entry[] = [];
  const restored = new Map<number, { position: number; labels: string[] }>();
  const flushDiscarded = (): void => {
    if (!discarded.length) return;
    const paragraphs = [...new Map(discarded.map((entry) => [entry.position, entry])).values()];
    const preview = paragraphs
      .slice(0, 3)
      .map((entry) => entry.text.slice(0, 40))
      .join(' / ');
    const remainder = paragraphs.length > 3 ? ` 외 ${paragraphs.length - 3}개 문단` : '';
    reader.report(
      beforeFirstBoundary ? 'PREAMBLE_IGNORED' : 'UNPARSED_BLOCKS',
      beforeFirstBoundary ? 'info' : 'warn',
      beforeFirstBoundary
        ? `문서 앞부분의 내용 "${preview}"${remainder}을 건너뛰었습니다. 필요한 내용이면 문제 본문으로 옮기세요.`
        : `문제에 속하지 않은 내용 "${preview}"${remainder}이 있습니다. 문제 번호와 선지 시작 양식을 확인하세요.`,
      paragraphs[0].position,
    );
    discarded = [];
  };
  const isStart = (index: number): RegExpExecArray | null => {
    if (current && mode === 'passage') return null;
    const entry = entries[index];
    const match = entry.boundary ? stem.exec(entry.text) : null;
    if (!match || !match[1]) return null;
    let count = 0;
    for (let next = index + 1; next < entries.length; next++) {
      const candidate = entries[next];
      if (!candidate.boundary || !candidate.text.trim()) continue;
      if (++count > (profile.stemLookaheadBlocks ?? 6)) break;
      if (
        answer.test(candidate.text) ||
        explanation.test(candidate.text) ||
        source.test(candidate.text) ||
        objective.test(candidate.text)
      )
        break;
      if (current && stem.test(candidate.text)) break;
      if (candidate.autoNumber || marker(candidate.text) === profile.choiceMarkers[0]) {
        if (current && (mode === 'explanation' || mode === 'answer')) {
          // 해설의 단일 번호 목록은 새 라벨이나 복수 선지가 있는 다음 문제와 구별한다.
          const seen = new Set([profile.choiceMarkers[0]]);
          for (let end = next + 1; end < entries.length; end++) {
            const boundary = entries[end];
            if (!boundary.boundary) continue;
            if (answer.test(boundary.text) || explanation.test(boundary.text)) return match;
            if (stem.test(boundary.text) || source.test(boundary.text) || objective.test(boundary.text))
              break;
            const nextMarker = boundary.autoNumber ? `auto-${end}` : marker(boundary.text);
            if (nextMarker) seen.add(nextMarker);
          }
          return seen.size >= 2 ? match : null;
        }
        return match;
      }
    }
    return null;
  };
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry.text.trim() && entry.block.type === 'paragraph') continue;
    if (entry.boundary && source.test(entry.text)) {
      flushDiscarded();
      beforeFirstBoundary = false;
      current = undefined;
      owners.set(entry.position, {});
      continue;
    }
    const start = isStart(index);
    if (start) {
      flushDiscarded();
      beforeFirstBoundary = false;
      current = {
        schemaVersion: 1,
        subject,
        type: 'mcq',
        stem: [stripPrefix(entry.block, start[0].length)],
        choices: [],
        answerChoiceIds: [],
        explanation: [],
        shufflePolicy: 'free',
        tags: [],
        extra: { originalNumber: start[1], objectiveText: undefined, sourceFile: fileName },
      };
      questions.push({ question: current, sourceLocation: `${fileName} · ${entry.position}번째 문단 부근` });
      owners.set(entry.position, { draftIndex: questions.length - 1 });
      mode = 'passage';
      continue;
    }
    owners.set(entry.position, { draftIndex: current ? questions.length - 1 : undefined });
    if (!current) {
      discarded.push(entry);
      continue;
    }
    flushDiscarded();
    const target = entry.boundary ? objective.exec(entry.text.replace(/\u3000/g, ' ')) : null;
    if (target?.groups) {
      const { subject: objectiveSubject, code, text, grade } = target.groups;
      if (objectiveSubject && code)
        current.objectiveCode = `${objectiveSubject} ${code.replace(/\s*-\s*/g, '-').trim()}`;
      current.grade = grade?.trim();
      current.extra.objectiveText = text?.trim();
      current = undefined;
      continue;
    }
    if (mode === 'explanation') {
      current.explanation.push(entry.block);
      continue;
    }
    const answerMatch = entry.boundary ? answer.exec(entry.text) : null;
    if (answerMatch) {
      const value = entry.text.slice(answerMatch[0].length).trim();
      const numbers: number[] = [];
      for (const match of value.matchAll(answerMarkers)) {
        numbers.push(profile.choiceMarkers.indexOf(match[0]) + 1);
      }
      if (!numbers.length && /^\d+(?:[\s,，]+\d+)*$/.test(value)) {
        numbers.push(...value.match(/\d+/g)!.map(Number));
        reader.report(
          'ANSWER_FORMAT',
          'warn',
          `정답 "${value}"이 숫자 형식입니다. 원문자 선지 표시로 바꾸고 대응을 확인하세요.`,
          entry.position,
        );
      }
      current.answerChoiceIds = [...new Set(numbers.map((number) => `c${number}`))];
      mode = 'answer';
      continue;
    }
    const explanationMatch = entry.boundary ? explanation.exec(entry.text) : null;
    if (explanationMatch) {
      mode = 'explanation';
      const block = stripPrefix(entry.block, explanationMatch[0].length);
      if (blocksToPlainText([block]).trim()) current.explanation.push(block);
      continue;
    }
    if (mode === 'answer') {
      current.explanation.push(entry.block);
      continue;
    }
    const choiceMarker = entry.boundary ? marker(entry.text) : undefined;
    if (choiceMarker || entry.autoNumber) {
      const offset = choiceMarker
        ? entry.text.length - entry.text.trimStart().length + choiceMarker.length
        : 0;
      current.choices.push({
        id: `c${current.choices.length + 1}`,
        content: [stripPrefix(entry.block, offset)],
      });
      mode = 'choices';
      if (entry.autoNumber) {
        const draftIndex = questions.length - 1;
        const group = restored.get(draftIndex) ?? { position: entry.position, labels: [] };
        group.labels.push(`${entry.autoNumber.label}(${entry.autoNumber.value})`);
        restored.set(draftIndex, group);
      }
    } else if (mode === 'choices') current.choices.at(-1)!.content.push(entry.block);
    else (current.passage ??= []).push(entry.block);
  }
  flushDiscarded();
  for (const [draftIndex, group] of restored) {
    reader.report(
      'AUTO_NUMBERING_RESTORED',
      'info',
      `${draftIndex + 1}번째 문제의 자동 원문자 선지 ${group.labels.length}개(${group.labels.join(', ')})를 문제 안의 순서로 복원했습니다. 미리보기에서 선지 순서를 확인하세요.`,
      group.position,
    );
  }
  for (const draft of questions)
    for (const choice of draft.question.choices) {
      if (fixed.some((pattern) => pattern.test(blocksToPlainText(choice.content))))
        choice.fixedPosition = true;
    }
  for (const event of reader.diagnostics) {
    // 상자나 셀 내부 진단도 이를 소유한 바깥 문단의 문제로 연결한다.
    let owner = owners.get(event.position);
    if (!owner) {
      for (let position = event.position - 1; position >= 1; position--) {
        owner = owners.get(position);
        if (owner) break;
      }
    }
    event.diagnostic.ref = owner ?? {};
  }
  return questions;
}
