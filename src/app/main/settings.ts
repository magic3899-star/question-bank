import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { Settings } from '../shared/index';

export const defaultSettings: Settings = {
  theme: 'system',
  subjects: [
    { id: 'law', name: '법규' },
    { id: 'anatomy', name: '해부' },
  ],
  defaultSaveDir: '',
};
export function validateSettings(input: unknown): Partial<Settings> {
  const fail = (): never => {
    throw new Error('설정 값이 올바르지 않습니다. 테마·과목·저장 폴더와 창 크기를 확인하세요.');
  };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail();
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !['theme', 'subjects', 'defaultSaveDir', 'window'].includes(key)))
    return fail();
  if (
    value.theme !== undefined &&
    (typeof value.theme !== 'string' || !['system', 'light', 'dark'].includes(value.theme))
  )
    return fail();
  if (
    value.defaultSaveDir !== undefined &&
    (typeof value.defaultSaveDir !== 'string' || value.defaultSaveDir.length > 4096)
  )
    return fail();
  if (value.subjects !== undefined) {
    if (!Array.isArray(value.subjects) || value.subjects.length > 100) return fail();
    const ids = new Set<string>();
    for (const item of value.subjects as unknown[]) {
      if (!item || typeof item !== 'object') return fail();
      const subject = item as Record<string, unknown>;
      if (
        typeof subject.id !== 'string' ||
        !subject.id.trim() ||
        typeof subject.name !== 'string' ||
        !subject.name.trim() ||
        subject.id.length > 100 ||
        subject.name.length > 100 ||
        ids.has(subject.id)
      )
        return fail();
      ids.add(subject.id);
    }
  }
  if (value.window !== undefined) {
    if (!value.window || typeof value.window !== 'object') return fail();
    const win = value.window as Record<string, unknown>;
    if (
      typeof win.width !== 'number' ||
      !Number.isInteger(win.width) ||
      win.width < 1100 ||
      win.width > 10000 ||
      typeof win.height !== 'number' ||
      !Number.isInteger(win.height) ||
      win.height < 700 ||
      win.height > 10000 ||
      ['x', 'y'].some(
        (key) => win[key] !== undefined && (typeof win[key] !== 'number' || !Number.isSafeInteger(win[key])),
      )
    )
      return fail();
  }
  return value as Partial<Settings>;
}
export function createSettingsService(file: string, now: () => string) {
  let current = structuredClone(defaultSettings);
  if (existsSync(file)) {
    try {
      current = { ...current, ...validateSettings(JSON.parse(readFileSync(file, 'utf8')) as unknown) };
    } catch {
      renameSync(file, `${file}.corrupt-${now().replace(/[^0-9A-Za-z-]/gu, '-')}`);
    }
  }
  return {
    get: (): Settings => structuredClone(current),
    update(input: unknown): Settings {
      const next = { ...current, ...validateSettings(input) };
      const temporary = `${file}.tmp`;
      try {
        writeFileSync(temporary, JSON.stringify(next, null, 2), 'utf8');
        renameSync(temporary, file);
      } catch (cause) {
        throw new Error('설정을 저장하지 못했습니다. 데이터 폴더의 쓰기 권한을 확인하세요.', { cause });
      }
      current = next;
      return structuredClone(current);
    },
  };
}
