import { DOMParser } from '@xmldom/xmldom';
import type { Element, Node } from '@xmldom/xmldom';
export const ns = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  v: 'urn:schemas-microsoft-com:vml',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
};
export const is = (element: Element, namespace: string, name: string): boolean =>
  element.namespaceURI === namespace && element.localName === name;
export function children(node: Node): Element[] {
  const result: Element[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling)
    if (child.nodeType === 1) result.push(child as Element);
  return result;
}
export const attr = (element: Element, name: string): string => element.getAttributeNS(ns.w, name) ?? '';
export const first = (element: Element, namespace: string, name: string): Element | undefined =>
  element.getElementsByTagNameNS(namespace, name).item(0) ?? undefined;
export function parseXml(xml: string): Element {
  if (/<!DOCTYPE/i.test(xml)) throw new Error('문서 형식 선언은 지원하지 않습니다.');
  const doc = new DOMParser({
    onError: () => {
      throw new Error('XML 구조가 올바르지 않습니다.');
    },
  }).parseFromString(xml, 'application/xml');
  if (!doc.documentElement) throw new Error('XML 본문이 없습니다.');
  return doc.documentElement;
}
