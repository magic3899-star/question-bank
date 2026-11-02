export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, '')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/giu, '')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(?:p|div|td|th|tr|table|article|section|h[1-6])>/giu, '\n')
    .replace(/<[^>]*>/gu, '')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|emsp|nbsp);/giu, (_, entity: string): string => {
      entity = entity.toLowerCase();
      const named: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        emsp: '\t',
        nbsp: ' ',
      };
      if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
      if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
      return named[entity.toLowerCase()];
    });
}

export function htmlParagraphTexts(html: string): string[] {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gu)].map((match) => htmlToPlainText(match[1]));
}
