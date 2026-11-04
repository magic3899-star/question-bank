import { DOMParser } from '@xmldom/xmldom';
import type { Element as XmlElement, Node as XmlNode } from '@xmldom/xmldom';

export function parseXml(xml: string): XmlElement | undefined {
  let failed = false;
  const document = new DOMParser({
    onError: (level) => {
      if (level !== 'warning') failed = true;
    },
  }).parseFromString(xml, 'text/xml');
  return failed || !document.documentElement ? undefined : document.documentElement;
}

export const isElement = (node: XmlNode): node is XmlElement => node.nodeType === 1;

export function descendants(root: XmlElement, localName: string): XmlElement[] {
  const found: XmlElement[] = [];
  const walk = (node: XmlElement) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (!isElement(child)) continue;
      if (child.localName === localName) found.push(child);
      walk(child);
    }
  };
  walk(root);
  return found;
}
