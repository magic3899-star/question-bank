import type { Element } from '@xmldom/xmldom';
import { attr, children, first, is, ns } from './xml';
export interface NumberingLevel {
  numFmt: string;
  start: number;
  lvlText: string;
}
export function readNumbering(root: Element): Map<string, Map<string, NumberingLevel>> {
  const abstracts = new Map<string, Map<string, NumberingLevel>>();
  const levelProperties = (element: Element): Partial<NumberingLevel> => {
    const result: Partial<NumberingLevel> = {};
    for (const child of children(element)) {
      if (is(child, ns.w, 'numFmt')) result.numFmt = attr(child, 'val');
      if (is(child, ns.w, 'lvlText')) result.lvlText = attr(child, 'val');
      if (is(child, ns.w, 'start')) {
        const value = Number(attr(child, 'val'));
        if (Number.isSafeInteger(value) && value >= 0) result.start = value;
      }
    }
    return result;
  };
  for (const abstract of children(root).filter((element) => is(element, ns.w, 'abstractNum'))) {
    const levels = new Map<string, NumberingLevel>();
    for (const level of children(abstract).filter((element) => is(element, ns.w, 'lvl'))) {
      levels.set(attr(level, 'ilvl'), { numFmt: '', start: 1, lvlText: '', ...levelProperties(level) });
    }
    abstracts.set(attr(abstract, 'abstractNumId'), levels);
  }
  const numbering = new Map<string, Map<string, NumberingLevel>>();
  for (const num of children(root).filter((element) => is(element, ns.w, 'num'))) {
    const abstractId = first(num, ns.w, 'abstractNumId');
    const levels = new Map(abstracts.get(abstractId ? attr(abstractId, 'val') : '') ?? []);
    for (const override of children(num).filter((element) => is(element, ns.w, 'lvlOverride'))) {
      const ilvl = attr(override, 'ilvl');
      const level = first(override, ns.w, 'lvl');
      const properties = {
        numFmt: '',
        start: 1,
        lvlText: '',
        ...levels.get(ilvl),
        ...(level ? levelProperties(level) : {}),
      };
      const start = first(override, ns.w, 'startOverride');
      const value = start ? Number(attr(start, 'val')) : NaN;
      if (Number.isSafeInteger(value) && value >= 0) properties.start = value;
      levels.set(ilvl, properties);
    }
    numbering.set(attr(num, 'numId'), levels);
  }
  return numbering;
}

export function circledNumber(value: number): string {
  if (value === 0) return '⓪';
  if (value >= 1 && value <= 20) return String.fromCodePoint(0x2460 + value - 1);
  if (value >= 21 && value <= 35) return String.fromCodePoint(0x3251 + value - 21);
  if (value >= 36 && value <= 50) return String.fromCodePoint(0x32b1 + value - 36);
  return `(${value})`;
}
