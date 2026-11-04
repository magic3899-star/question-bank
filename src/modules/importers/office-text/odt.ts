import JSZip from 'jszip';
import type { Element as XmlElement } from '@xmldom/xmldom';
import { descendants, isElement, parseXml } from './xml-text';

function paragraphText(node: XmlElement): string {
  let text = '';
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3) text += child.nodeValue ?? '';
    else if (isElement(child)) {
      if (child.localName === 's') text += ' '.repeat(Number(child.getAttribute('text:c') || 1));
      else if (child.localName === 'tab') text += '\t';
      else if (child.localName === 'line-break') text += '\n';
      else text += paragraphText(child);
    }
  }
  return text;
}

/** OpenDocument 텍스트(.odt): content.xml 의 문단(text:p)과 제목(text:h). */
export async function extractOdtLines(data: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(data);
  const content = zip.files['content.xml'];
  if (!content) throw new Error('OpenDocument(.odt) 문서의 본문을 찾지 못했습니다.');
  const root = parseXml(await content.async('string'));
  if (!root) throw new Error('OpenDocument(.odt) 문서의 본문을 해석하지 못했습니다.');
  const lines: string[] = [];
  const walk = (node: XmlElement) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (!isElement(child)) continue;
      if (child.localName === 'p' || child.localName === 'h') lines.push(...paragraphText(child).split('\n'));
      else walk(child);
    }
  };
  walk(descendants(root, 'body')[0] ?? root);
  return lines;
}
