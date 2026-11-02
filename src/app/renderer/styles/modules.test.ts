import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve('src/app/renderer');
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}
const rendererFiles = files(root);
const tokenSource = readFileSync(join(root, 'styles/tokens.css'), 'utf8');
const defined = new Set([...tokenSource.matchAll(/(--[\w-]+)\s*:/gu)].map((match) => match[1]));

describe('CSS Module 분리와 토큰 참조', () => {
  it.each(rendererFiles.filter((file) => file.endsWith('.css')))(
    '%s의 스타일 변수와 전역 범위를 확인한다',
    (file) => {
      const css = readFileSync(file, 'utf8');
      for (const match of css.matchAll(/var\(([^),]+)/gu)) {
        expect(defined.has(match[1]!.trim()), `${file}: ${match[1]} 토큰을 정의하거나 이름을 고치세요.`).toBe(
          true,
        );
      }
      if (!file.endsWith('tokens.css') && !file.endsWith('base.css')) {
        expect(file).toMatch(/\.module\.css$/u);
        expect(css).not.toContain(':global');
        expect(css).not.toMatch(/#[\da-f]{3,8}\b/iu);
      }
    },
  );
  it.each(rendererFiles.filter((file) => file.endsWith('.tsx')))(
    '%s의 정적 클래스는 옆 CSS Module에 존재한다',
    (file) => {
      const source = readFileSync(file, 'utf8');
      if (!source.includes('import styles from')) return;
      const css = readFileSync(file.replace(/\.tsx$/u, '.module.css'), 'utf8');
      for (const match of source.matchAll(/styles(?:\.([\w-]+)|\['([\w-]+)'\])/gu)) {
        const name = match[1] ?? match[2];
        expect(css, `${file}: ${name} 클래스를 CSS Module에 추가하세요.`).toMatch(
          new RegExp(`\\.${name}(?![\\w-])`, 'u'),
        );
      }
    },
  );
});
