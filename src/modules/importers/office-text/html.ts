const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1]!.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** HTML 에서 보이는 글자만 줄 단위로 뽑는다(스크립트·스타일·주석 제외). */
export function extractHtmlLines(html: string): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<(script|style|head|noscript)\b[\s\S]*?<\/\1\s*>/giu, '')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|table|section|article|blockquote|pre)\s*>/giu, '\n')
    .replace(/<\/(td|th)\s*>/giu, ' ')
    .replace(/<[^>]*>/gu, '');
  return decodeEntities(text).split('\n');
}
