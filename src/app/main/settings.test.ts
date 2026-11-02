import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSettingsService, defaultSettings, validateSettings } from './settings';

describe('앱 설정 보존', () => {
  let directory: string;
  const now = () => '2026-11-02T00:00:00.000Z';
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'qb-settings-'));
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));
  it('기본값·부분 갱신·다시 읽기·외부 변조 방지를 지원한다', () => {
    const file = join(directory, 'settings.json');
    const service = createSettingsService(file, now);
    expect(service.get()).toEqual(defaultSettings);
    service.update({ theme: 'dark', window: { width: 1100, height: 700, x: -100, y: 0 } });
    const value = service.get();
    value.subjects[0].name = '변조';
    expect(createSettingsService(file, now).get().subjects[0].name).toBe('의료관계법규');
    expect(createSettingsService(file, now).get().theme).toBe('dark');
  });
  it('이전 설정은 공백 모드를 기본으로 쓰고 줄 잇기 선택을 재실행 후에도 보존한다', () => {
    const file = join(directory, 'settings.json');
    writeFileSync(file, JSON.stringify({ theme: 'dark' }));
    const service = createSettingsService(file, now);
    expect(service.get().pasteJoin).toBe('space');
    service.update({ pasteJoin: 'none' });
    expect(createSettingsService(file, now).get().pasteJoin).toBe('none');
    expect(validateSettings({ pasteJoin: 'space' })).toEqual({ pasteJoin: 'space' });
  });
  it.each(['{broken', '{"theme":"wrong"}'])('손상 설정 원본을 보존하고 기본값을 사용한다', (text) => {
    const file = join(directory, 'settings.json');
    writeFileSync(file, text);
    expect(createSettingsService(file, now).get()).toEqual(defaultSettings);
    const backup = readdirSync(directory).find((name) => name.includes('.corrupt-'))!;
    expect(readFileSync(join(directory, backup), 'utf8')).toBe(text);
  });
  it.each([
    null,
    { theme: 'no' },
    { pasteJoin: 'auto' },
    { pasteJoin: null },
    { pasteJoin: 1 },
    { subjects: [{ id: 'a', name: '' }] },
    {
      subjects: [
        { id: 'a', name: '가' },
        { id: 'a', name: '나' },
      ],
    },
    { window: { width: 100, height: 700 } },
    { defaultSaveDir: 3 },
    { unknown: true },
  ])('잘못된 값을 거부한다: %j', (input) => expect(() => validateSettings(input)).toThrow('설정 값'));
  it('쓰기 실패는 기존 메모리 설정을 변경하지 않는다', () => {
    const service = createSettingsService(join(directory, 'missing', 'settings.json'), now);
    expect(() => service.update({ theme: 'dark' })).toThrow('쓰기 권한');
    expect(service.get().theme).toBe('light');
  });
});
