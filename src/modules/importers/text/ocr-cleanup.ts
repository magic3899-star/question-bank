const CIRCLED = ['①', '②', '③', '④', '⑤'];

/** 글자 인식기가 읽고 반환하는 함수. 줄 목록(읽기 순서)을 돌려준다. */
export type OcrRecognize = (image: Uint8Array) => Promise<string[]>;

export interface ImportProgress {
  label: string;
  done: number;
  total: number;
}

/** 오래 걸리는 가져오기(OCR)가 진행 상황을 알릴 때 쓴다. options 에 함수가 있으면 호출한다. */
export function reportProgress(options: Record<string, unknown> | undefined, progress: ImportProgress): void {
  const callback = options?.onProgress;
  if (typeof callback === 'function') (callback as (value: ImportProgress) => void)(progress);
}

const circledToken = /^[①-⑤]$/u;
// 인식기가 ①~⑤ 를 "<@", "(3)", "@&", "©" 처럼 읽는 경우의 머리 글자: 한글·영문자 없이 기호·숫자만 있는 짧은 토큰.
const junkToken = /^[\p{P}\p{S}]{1,3}[0-9A-Za-z]?[\p{P}\p{S}]{0,2}$|^[0-9OoQ]$|^[0-9]\)$/u;

// 글머리표·주석 기호는 선지 머리가 아니다(연속된 "※ 주" 줄이 ①② 로 바뀌면 안 된다).
const bulletTokens = new Set([
  '※',
  '-',
  '–',
  '—',
  '•',
  '·',
  '*',
  '▶',
  '▷',
  '○',
  '●',
  '◎',
  '■',
  '□',
  '☞',
  '→',
  '.',
  ',',
]);

function isMarkerToken(token: string, nextToken: string | undefined): boolean {
  if (circledToken.test(token)) return true;
  if (bulletTokens.has(token)) return false;
  if (token.length > 4) return false;
  if (/^[0-9OoQ]$/u.test(token)) return nextToken !== undefined && /^[가-힣]/u.test(nextToken);
  return junkToken.test(token);
}

/** "<@ 가짜 하나 <) 가짜 둘" 처럼 한 줄에 선지가 둘 이상이면 선지마다 줄을 나눈다. */
function splitInlineChoices(line: string): string[] {
  const tokens = line.split(' ');
  if (!isMarkerToken(tokens[0]!, tokens[1])) return [line];
  const parts: string[][] = [[tokens[0]!]];
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    // 같은 줄 안의 다음 선지 머리는 기호가 들어간 토큰만 인정한다(숫자 한 글자는 본문일 수 있다).
    if (isMarkerToken(token, tokens[i + 1]) && /[(<[{@©®①-⑤)\]>}]/u.test(token) && parts.at(-1)!.length > 1)
      parts.push([token]);
    else parts.at(-1)!.push(token);
  }
  return parts.map((part) => part.join(' '));
}

/**
 * OCR 결과 줄을 해석 규칙이 알아보는 모양으로 다듬는다.
 * - 공백을 정리한다.
 * - 연달아 나온 선지 줄(2~5개)의 머리 기호는 인식 결과를 믿지 않고 순서대로 ①~⑤ 로 다시 붙인다.
 * 인식 오류가 남을 수 있으므로 가져오기 검수에서 원본과 대조해야 한다.
 */
export function cleanupOcrLines(lines: readonly string[]): string[] {
  const normalized = lines.map((line) => line.replace(/[ \t\u00a0\u3000]+/gu, ' ').trim()).filter(Boolean);
  const expanded = normalized.flatMap(splitInlineChoices);
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 2 && run.length <= 5)
      run.forEach((line, index) =>
        out.push(`${CIRCLED[index]} ${line.split(' ').slice(1).join(' ')}`.trim()),
      );
    else out.push(...run);
    run = [];
  };
  for (const line of expanded) {
    const tokens = line.split(' ');
    if (tokens.length > 1 && isMarkerToken(tokens[0]!, tokens[1])) {
      run.push(line);
      if (run.length === 5) flush();
    } else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out;
}
