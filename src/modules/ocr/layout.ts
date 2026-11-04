export interface OcrWord {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
/**
 * 인식기가 한 줄로 묶어 돌려준 결과. text 는 인식기가 띄어쓰기까지 판단한 문장이고,
 * words 는 위치 정보다(한국어 모델은 단어가 아니라 음절 단위로 쪼개 주는 일이 많아 위치만 믿는다).
 * 2단 조판이면 한 줄에 좌우 단의 글이 함께 들어 있다.
 */
export interface OcrLine {
  text: string;
  words: OcrWord[];
  /** 줄의 위·아래 y 좌표(글자 상자의 최소·최대). */
  top: number;
  bottom: number;
}

const GUTTER_SEARCH_FROM = 0.3;
const GUTTER_SEARCH_TO = 0.7;
const MIN_GUTTER_WIDTH = 0.025;
const MAX_CROSSING_SHARE = 0.03;
/** 글자 높이 대비 이 간격보다 벌어지면 띄어쓰기로 본다(같은 낱말 안의 음절 간격은 0.35 이하). */
const SPACE_GAP_RATIO = 0.45;

/**
 * 쪽 가운데에서 거의 모든 단어가 비켜 가는 세로 빈 띠(단 사이 여백)의 중앙 x 를 찾는다. 없으면 undefined.
 * 제목처럼 전체 폭에 걸친 몇몇 단어는 무시한다.
 */
export function findGutter(lines: readonly OcrLine[]): number | undefined {
  const words = lines.flatMap((line) => line.words).filter((word) => word.text.trim());
  if (words.length < 12) return undefined;
  const width = Math.max(...words.map((word) => word.x1));
  if (!(width > 0)) return undefined;
  const from = Math.floor(width * GUTTER_SEARCH_FROM);
  const to = Math.ceil(width * GUTTER_SEARCH_TO);
  const limit = Math.max(2, Math.floor(words.length * MAX_CROSSING_SHARE));
  let best: { start: number; end: number } | undefined;
  let start: number | undefined;
  for (let x = from; x <= to; x++) {
    const crossing = words.reduce((count, word) => count + (word.x0 < x && word.x1 > x ? 1 : 0), 0);
    if (crossing <= limit) start ??= x;
    if ((crossing > limit || x === to) && start !== undefined) {
      const end = crossing > limit ? x - 1 : x;
      if (!best || end - start > best.end - best.start) best = { start, end };
      start = undefined;
    }
  }
  if (!best || best.end - best.start < width * MIN_GUTTER_WIDTH) return undefined;
  const middle = (best.start + best.end) / 2;
  const left = words.filter((word) => (word.x0 + word.x1) / 2 < middle).length;
  // 한쪽에만 글이 몰려 있으면 단 구분이 아니라 들여쓰기·여백이다.
  return left >= 4 && words.length - left >= 4 ? middle : undefined;
}

const clean = (text: string) => text.replace(/\s+/gu, ' ').trim();

/** 위치 간격으로 띄어쓰기를 복원해 단어들을 한 줄 문장으로 잇는다. */
function joinByGap(words: OcrWord[]): string {
  let text = '';
  words.forEach((word, index) => {
    const piece = word.text.trim();
    if (!piece) return;
    const previous = words[index - 1];
    const height = Math.max(1, word.y1 - word.y0);
    if (text && previous && word.x0 - previous.x1 > height * SPACE_GAP_RATIO) text += ' ';
    text += piece;
  });
  return text;
}

/**
 * 줄 목록을 읽기 순서의 문자열 줄로 바꾼다. 2단이면 왼쪽 단을 위에서 아래로 다 읽은 뒤 오른쪽 단을 읽는다.
 */
export function orderOcrLines(lines: readonly OcrLine[]): string[] {
  const gutter = findGutter(lines);
  if (gutter === undefined) return lines.map((line) => clean(line.text)).filter(Boolean);
  const side = (word: OcrWord) => ((word.x0 + word.x1) / 2 < gutter ? 0 : 1);
  const out: string[] = [];
  let columns: string[][] = [[], []];
  const flush = () => {
    out.push(...columns[0]!, ...columns[1]!);
    columns = [[], []];
  };
  for (const line of lines) {
    // 단 사이 여백을 가로지르는 줄(제목·머리글)은 전체 폭 줄로 두고, 그 앞뒤에서 단을 따로 읽는다.
    if (crossesGutter(line, gutter)) {
      flush();
      const text = clean(line.text);
      if (text) out.push(text);
      continue;
    }
    for (const column of [0, 1]) {
      const text = joinByGap(line.words.filter((word) => side(word) === column));
      if (text) columns[column]!.push(text);
    }
  }
  flush();
  return out;
}

export const crossesGutter = (line: OcrLine, gutter: number): boolean =>
  line.words.some((word) => word.x0 < gutter && word.x1 > gutter);

/**
 * 좌·우 단을 따로 인식한 결과와 전체 폭 줄을 읽기 순서로 합친다.
 * 전체 폭 줄이 단을 나누는 경계가 되어, 경계마다 "왼쪽 단 → 오른쪽 단 → 전체 폭 줄" 순서가 된다.
 */
export function mergeColumns(
  fullWidth: readonly OcrLine[],
  left: readonly OcrLine[],
  right: readonly OcrLine[],
): string[] {
  const borders = [...fullWidth].sort((a, b) => a.top - b.top);
  const section = (line: OcrLine) => {
    const middle = (line.top + line.bottom) / 2;
    return borders.filter((border) => border.bottom <= middle).length;
  };
  const inSection = (lines: readonly OcrLine[], index: number) =>
    lines
      .filter((line) => section(line) === index)
      .sort((a, b) => a.top - b.top)
      .map((line) => clean(line.text))
      .filter(Boolean);
  const out: string[] = [];
  for (let index = 0; index <= borders.length; index++) {
    out.push(...inSection(left, index), ...inSection(right, index));
    const border = borders[index];
    if (border && clean(border.text)) out.push(clean(border.text));
  }
  return out;
}
