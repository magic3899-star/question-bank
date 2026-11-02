import type { Block, InlineRun } from '../../../../contracts/index';

export type EditorNode = { text: string } | { tag: string; children: EditorNode[] };
const marks = {
  u: 'underline',
  b: 'bold',
  strong: 'bold',
  i: 'italic',
  em: 'italic',
  sup: 'superscript',
  sub: 'subscript',
} as const;
const keys = ['underline', 'bold', 'italic', 'superscript', 'subscript'] as const;
export function normalizeRuns(input: InlineRun[]): InlineRun[] {
  const result: InlineRun[] = [];
  for (const item of input) {
    if (!item.text) continue;
    const run: InlineRun = { text: item.text };
    for (const key of keys) if (item[key]) run[key] = true;
    const last = result.at(-1);
    if (last && keys.every((key) => last[key] === run[key])) last.text += run.text;
    else result.push(run);
  }
  return result;
}
export function treeToRuns(nodes: EditorNode[], inherited: Omit<InlineRun, 'text'> = {}): InlineRun[] {
  const runs: InlineRun[] = [];
  let previousBlock = false;
  for (const node of nodes) {
    const tag = 'tag' in node ? node.tag.toLowerCase() : '';
    const isBlock = tag === 'p' || tag === 'div';
    if (runs.length && (isBlock || previousBlock) && !runs.at(-1)!.text.endsWith('\n'))
      runs.push({ ...inherited, text: '\n' });
    if ('text' in node) runs.push({ ...inherited, text: node.text });
    else if (tag === 'br') runs.push({ ...inherited, text: '\n' });
    else {
      const mark = marks[tag as keyof typeof marks];
      runs.push(...treeToRuns(node.children, mark ? { ...inherited, [mark]: true } : inherited));
    }
    previousBlock = isBlock;
  }
  return normalizeRuns(runs);
}
export function editorToBlocks(nodes: EditorNode[]): Block[] {
  const result: Block[] = [];
  let inline: EditorNode[] = [];
  const flush = () => {
    if (inline.length) {
      result.push({ type: 'paragraph', runs: treeToRuns(inline) });
      inline = [];
    }
  };
  for (const node of nodes) {
    if ('tag' in node && ['p', 'div'].includes(node.tag.toLowerCase())) {
      flush();
      const placeholder =
        node.children.length === 1 &&
        'tag' in node.children[0]! &&
        node.children[0].tag.toLowerCase() === 'br';
      result.push({ type: 'paragraph', runs: placeholder ? [] : treeToRuns(node.children) });
    } else inline.push(node);
  }
  flush();
  return result;
}
export function replaceParagraphs(original: Block[], paragraphs: Block[]): Block[] {
  let index = 0;
  const result = original.flatMap((block): Block[] =>
    block.type === 'paragraph' ? (paragraphs[index] ? [paragraphs[index++]!] : []) : [block],
  );
  return [...result, ...paragraphs.slice(index)];
}
export function blocksToEditor(blocks: Block[]): EditorNode[] {
  return blocks.flatMap((block): EditorNode[] => {
    if (block.type !== 'paragraph') return [];
    return [
      {
        tag: 'p',
        children: normalizeRuns(block.runs).map((run) => {
          let node: EditorNode = { text: run.text };
          for (const [tag, key] of [
            ['u', 'underline'],
            ['b', 'bold'],
            ['i', 'italic'],
            ['sup', 'superscript'],
            ['sub', 'subscript'],
          ] as const)
            if (run[key]) node = { tag, children: [node] };
          return node;
        }),
      },
    ];
  });
}
export function editorHtml(nodes: EditorNode[]): string {
  const escape = (text: string) =>
    text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
  return nodes
    .map((node) => {
      if ('text' in node) return escape(node.text);
      const tag = node.tag.toLowerCase();
      if (tag === 'br') return '<br>';
      const content = editorHtml(node.children);
      return ['p', 'div', ...Object.keys(marks)].includes(tag)
        ? `<${tag}>${content || '<br>'}</${tag}>`
        : content;
    })
    .join('');
}
