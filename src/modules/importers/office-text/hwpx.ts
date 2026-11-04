import JSZip from 'jszip';
import type { Element as XmlElement } from '@xmldom/xmldom';
import { descendants, isElement, parseXml } from './xml-text';

/** 한 글자 묶음(hp:t) 안의 글자·탭·줄바꿈을 순서대로 이어 붙인다. */
function runText(run: XmlElement): string {
  let text = '';
  for (let child = run.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3) text += child.nodeValue ?? '';
    else if (isElement(child)) {
      if (child.localName === 'tab') text += '\t';
      else if (child.localName === 'lineBreak') text += '\n';
      else text += runText(child);
    }
  }
  return text;
}

function nearestParagraph(node: XmlElement): XmlElement | undefined {
  for (let parent = node.parentNode; parent; parent = parent.parentNode)
    if (isElement(parent) && parent.localName === 'p') return parent;
  return undefined;
}

/**
 * 한글(.hwpx)은 ZIP 안의 Contents/section*.xml 에 문단(hp:p)과 글자(hp:t)가 들어 있다.
 * 표 안의 문단은 바깥 문단과 섞이지 않게 문단마다 따로 줄을 만든다.
 */
export async function extractHwpxLines(data: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(data);
  const sectionNumber = (name: string) => Number(/(\d+)\.xml$/u.exec(name)![1]);
  const sections = Object.keys(zip.files)
    .filter((name) => /^Contents\/section\d+\.xml$/iu.test(name))
    .sort((a, b) => sectionNumber(a) - sectionNumber(b));
  if (!sections.length) throw new Error('한글(.hwpx) 문서의 본문을 찾지 못했습니다.');
  const lines: string[] = [];
  for (const name of sections) {
    const root = parseXml(await zip.files[name]!.async('string'));
    if (!root) throw new Error('한글(.hwpx) 문서의 본문을 해석하지 못했습니다.');
    const byParagraph = new Map<XmlElement, string>();
    for (const run of descendants(root, 't')) {
      const paragraph = nearestParagraph(run);
      if (paragraph) byParagraph.set(paragraph, (byParagraph.get(paragraph) ?? '') + runText(run));
    }
    for (const text of byParagraph.values()) lines.push(...text.split('\n'));
  }
  return lines;
}
