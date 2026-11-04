const SKIPPED_DESTINATIONS = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'info',
  'pict',
  'header',
  'footer',
  'footnote',
  'object',
  'themedata',
  'colorschememapping',
  'latentstyles',
  'datastore',
  'listtable',
  'listoverridetable',
  'rsidtbl',
  'generator',
]);

/** RTF 에서 글자만 뽑는다. 한글은 \'xx 쌍(CP949)이나 \uN(유니코드)로 들어 있다. */
export function extractRtfLines(data: Uint8Array): string[] {
  const raw = new TextDecoder('latin1').decode(data);
  if (!raw.trimStart().startsWith('{\\rtf')) throw new Error('RTF 문서가 아닙니다.');
  const out: string[] = [];
  let pending: number[] = [];
  const flushBytes = () => {
    if (!pending.length) return;
    out.push(new TextDecoder('euc-kr').decode(Uint8Array.from(pending)));
    pending = [];
  };
  // 그룹마다 건너뛸지와 유니코드 뒤 대체 글자 수(\ucN)를 따로 기억한다.
  const stack: { skip: boolean; uc: number }[] = [];
  let skip = false;
  let uc = 1;
  let ignoreChars = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === '{') {
      stack.push({ skip, uc });
      continue;
    }
    if (ch === '}') {
      flushBytes();
      ({ skip, uc } = stack.pop() ?? { skip: false, uc: 1 });
      continue;
    }
    if (ch === '\\') {
      const next = raw[i + 1] ?? '';
      if (next === "'") {
        const byte = parseInt(raw.slice(i + 2, i + 4), 16);
        i += 3;
        if (ignoreChars > 0) ignoreChars--;
        else if (!skip && !Number.isNaN(byte)) pending.push(byte);
        continue;
      }
      flushBytes();
      if (next === '\\' || next === '{' || next === '}') {
        if (!skip) out.push(next);
        i++;
        continue;
      }
      if (next === '*') {
        skip = true;
        i++;
        continue;
      }
      if (next === '~') {
        if (!skip) out.push(' ');
        i++;
        continue;
      }
      const word = /^\\([a-zA-Z]+)(-?\d+)? ?/u.exec(raw.slice(i, i + 40));
      if (!word) {
        i++;
        continue;
      }
      i += word[0].length - 1;
      const name = word[1]!;
      const value = word[2] === undefined ? undefined : Number(word[2]);
      if (SKIPPED_DESTINATIONS.has(name)) skip = true;
      else if (name === 'uc' && value !== undefined) uc = value;
      else if (name === 'u' && value !== undefined) {
        if (!skip) out.push(String.fromCodePoint(value < 0 ? value + 65536 : value));
        ignoreChars = uc;
      } else if (!skip && (name === 'par' || name === 'line' || name === 'sect' || name === 'page'))
        out.push('\n');
      else if (!skip && name === 'tab') out.push('\t');
      continue;
    }
    if (ch === '\r' || ch === '\n') continue;
    flushBytes();
    if (ignoreChars > 0) {
      ignoreChars--;
      continue;
    }
    if (!skip) out.push(ch);
  }
  flushBytes();
  return out.join('').split('\n');
}
