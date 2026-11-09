import { describe, expect, it, vi } from 'vitest';
import { openStorage } from '../../../modules/storage/index';
import { subjectCatalog } from '../../../modules/subject-catalog/index';
import { presetRuleSets } from '../../../modules/rules/index';
import { defaultSettings } from '../settings';
import { createRulesService } from './rules';
import { createEnsureSubjects } from './import-subjects';

describe('가져오기 과목·규칙 등록', () => {
  it('과목으로 기존 규칙을 찾고, 삭제된 규칙만 복원하며 법규·해부 프리셋을 보존한다', async () => {
    const storage = openStorage(':memory:');
    try {
      const rules = createRulesService(storage, () => defaultSettings);
      const custom = { ...presetRuleSets()[0], id: 'user-anatomy', name: '사용자 규칙' };
      await storage.ruleSets.save(custom);
      await rules.ensureSubjectRules(['law', 'anatomy', 'morphology', 'morphology', 'unknown']);
      expect(await storage.ruleSets.list()).toHaveLength(3);
      expect(await storage.ruleSets.get('user-anatomy')).toEqual(custom);
      expect(await storage.ruleSets.get('anatomy')).toBeUndefined();
      expect(await storage.ruleSets.get('law')).toEqual(presetRuleSets()[1]);
      await storage.ruleSets.delete('user-anatomy');
      await rules.ensureSubjectRules(['anatomy']);
      expect(await storage.ruleSets.get('anatomy')).toEqual(presetRuleSets()[0]);
      await rules.ensureSubjectRules(subjectCatalog.map((subject) => subject.id));
      for (const subject of subjectCatalog) {
        const check = await rules.check(await storage.ruleSets.get(subject.id));
        expect(
          check.diagnostics.some(
            (diagnostic) => diagnostic.code === 'RULESET_INVALID' || diagnostic.code === 'UNKNOWN_CONSTRAINT',
          ),
        ).toBe(false);
      }
    } finally {
      storage.close();
    }
  });
  it('다른 과목에서 사용 중인 기본 ID를 덮어쓰지 않는다', async () => {
    const storage = openStorage(':memory:');
    try {
      const occupied = { ...presetRuleSets()[0], id: 'morphology' };
      await storage.ruleSets.save(occupied);
      const rules = createRulesService(storage, () => defaultSettings);
      await expect(rules.ensureSubjectRules(['morphology'])).rejects.toThrow('다른 과목에서 사용 중');
      expect(await storage.ruleSets.get('morphology')).toEqual(occupied);
    } finally {
      storage.close();
    }
  });
  it('새 과목만 설정 끝에 추가하고 등록을 반복해도 중복되지 않는다', async () => {
    let current = structuredClone(defaultSettings);
    const settings = {
      get: () => structuredClone(current),
      update: vi.fn((partial: Partial<typeof current>) => (current = { ...current, ...partial })),
    };
    const rules = { ensureSubjectRules: vi.fn(async () => {}) };
    const ensure = createEnsureSubjects(settings, rules);
    expect(await ensure(['law', 'morphology', 'unknown', 'morphology'])).toEqual(['치아형태학']);
    expect(current.subjects.map((subject) => subject.id)).toEqual(['law', 'anatomy', 'morphology']);
    expect(await ensure(['law', 'morphology'])).toEqual([]);
    expect(settings.update).toHaveBeenCalledTimes(1);
    expect(rules.ensureSubjectRules).toHaveBeenCalledTimes(2);
  });
});
