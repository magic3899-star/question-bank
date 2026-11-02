import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve('src/app/renderer/styles/tokens.css'), 'utf8');
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start, `토큰 선택자 ${selector}를 복원하세요.`).toBeGreaterThanOrEqual(0);
  const declarations = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...declarations.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/giu)].map(([, name, color]) => [name!, color!]),
  );
}
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}
const pairs: [string, string, number][] = [
  ['text', 'surface', 4.5],
  ['text', 'bg', 4.5],
  ['text-muted', 'surface', 4.5],
  ['accent-fg', 'accent', 4.5],
  ['accent', 'surface', 3],
  ['warn', 'surface', 4.5],
  ['danger', 'surface', 4.5],
  ['success', 'surface', 4.5],
];
describe.each([
  ['라이트', ':root {'],
  ['수동 다크', ":root[data-theme='dark']"],
  ['시스템 다크', ":root:not([data-theme='light'])"],
])('%s 테마 WCAG 대비', (_label, selector) => {
  const theme = tokens(selector);
  it.each(pairs)('%s / %s는 %s:1 이상이다', (foreground, background, minimum) => {
    expect(theme[foreground], `${foreground} 토큰을 추가하세요.`).toMatch(/^#[\da-f]{6}$/iu);
    expect(theme[background], `${background} 토큰을 추가하세요.`).toMatch(/^#[\da-f]{6}$/iu);
    expect(
      contrast(theme[foreground]!, theme[background]!),
      `${foreground}/${background} 색 대비를 높이세요.`,
    ).toBeGreaterThanOrEqual(minimum);
  });
});
it('대비 계산은 흰색/검정 21:1과 같은 색 1:1을 구분한다', () => {
  expect(contrast('#ffffff', '#000000')).toBe(21);
  expect(contrast('#ffffff', '#ffffff')).toBe(1);
});
