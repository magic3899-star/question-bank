import { normalizeToken } from './vocabulary';
import type { Vocabulary } from './vocabulary';
import type { ParseContext } from './types';

const endings = new Set(
  '은 는 이 가 을 를 의 에 로 와 과 도 만 며 고 서 면 나 다 요 한 인 된 하 되 해 할 함 임 음 에서 으로 에게 까지 부터 보다 라고 이며 이다 한다 하는 하고 하며 되는 있는 없는 하여 하기 되어'.split(
    ' ',
  ),
);

export function joinWrapped(
  prev: string,
  next: string,
  vocab: Vocabulary,
): { text: string; joined: boolean; estimated: boolean } {
  const left = prev.trimEnd();
  const right = next.trimStart();
  const result = (joined: boolean, estimated = false) => ({
    text: `${left}${left && right && !joined ? ' ' : ''}${right}`,
    joined,
    estimated,
  });
  if (!left || !right || /[.?!:]$/u.test(left)) return result(false);
  const a = normalizeToken(left.split(/\s+/u).at(-1)!);
  const b = normalizeToken(right.split(/\s+/u)[0]);
  if (!/[가-힣]$/u.test(a) || !/^[가-힣]/u.test(b)) return result(false);
  const joined = vocab.token.get(a + b) ?? 0;
  const separated = vocab.pair.get(`${a} ${b}`) ?? 0;
  if (joined !== separated) return result(joined > separated);
  if (joined > 0) return result(false);
  return result(endings.has(b) && !/[,.;?!:…」'"’”)]$/u.test(left), true);
}

export function appendWrapped(
  paragraphs: string[],
  text: string,
  vocab: Vocabulary,
  context: ParseContext,
  newParagraph = false,
): void {
  if (!text) return;
  if (!paragraphs.length || newParagraph) paragraphs.push(text);
  else {
    const result = joinWrapped(paragraphs.at(-1)!, text, vocab);
    paragraphs[paragraphs.length - 1] = result.text;
    if (result.estimated) context.estimated++;
  }
}
