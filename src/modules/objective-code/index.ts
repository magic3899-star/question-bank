export interface ObjectiveCode { subject: string; segments: number[] }

function parse(code: string, prefix: boolean): ObjectiveCode | null {
  if (typeof code !== 'string') return null;
  const text = code.trim().replace(/\s+/gu, ' ').replace(/\s*-\s*/gu, '-');
  const match = /^([\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*)(?: (\d+(?:\s*-\s*\d+)*)(-?)?)?$/u.exec(text);
  if (!match || (!prefix && (!match[2] || match[3]))) return null;
  const segments = match[2]?.split(/\s*-\s*/u).map(Number) ?? [];
  if (segments.some((value) => !Number.isSafeInteger(value) || value < 0)) return null;
  return { subject: match[1], segments };
}

export function parseObjectiveCode(code: string): ObjectiveCode | null { return parse(code, false); }

export function matchesObjectivePrefix(code: string, prefix: string): boolean {
  const target = parseObjectiveCode(code);
  const start = parse(prefix, true);
  return !!target && !!start && target.subject === start.subject
    && start.segments.length <= target.segments.length
    && start.segments.every((value, index) => value === target.segments[index]);
}

export function segmentKey(code: string, depth: number): string | null {
  const parsed = parseObjectiveCode(code);
  if (!parsed || !Number.isSafeInteger(depth) || depth < 1) return null;
  return `${parsed.subject} ${parsed.segments.slice(0, depth).join('-')}`;
}

export function compareObjectiveCodes(a: string, b: string): number {
  const left = parseObjectiveCode(a);
  const right = parseObjectiveCode(b);
  if (!left || !right) return left ? -1 : right ? 1 : a < b ? -1 : a > b ? 1 : 0;
  if (left.subject !== right.subject) return left.subject < right.subject ? -1 : 1;
  for (let index = 0; index < Math.min(left.segments.length, right.segments.length); index++) {
    if (left.segments[index] !== right.segments[index]) return left.segments[index] < right.segments[index] ? -1 : 1;
  }
  return left.segments.length - right.segments.length;
}
