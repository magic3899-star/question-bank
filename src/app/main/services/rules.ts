import { randomUUID } from 'node:crypto';
import type { Question, RuleSet } from '../../../contracts/index';
import { standardConstraints } from '../../../modules/constraints/index';
import {
  matchesObjectivePrefix,
  parseObjectiveCode,
  segmentKey,
} from '../../../modules/objective-code/index';
import { createRng } from '../../../modules/rng/index';
import {
  describeRuleSet,
  presetRuleSets,
  slotsTotalCount,
  subjectRuleSet,
  validateRuleSet,
} from '../../../modules/rules/index';
import { createSelector } from '../../../modules/selector/index';
import type { Storage } from '../../../modules/storage/index';
import { findSubjectById } from '../../../modules/subject-catalog/index';
import type { RuleCheck, RuleSummary, Settings, SlotCheck } from '../../shared/index';
import { requireText } from './bank';

const knownKinds = standardConstraints.map((constraint) => constraint.id);
const presetIds = new Set(presetRuleSets().map((rules) => rules.id));

export function slotMatches(question: Question, rules: RuleSet, slotId: string): boolean {
  const slot = rules.slots.find((item) => item.id === slotId);
  if (!slot) return false;
  const filter = slot.filter;
  switch (filter.kind) {
    case 'all':
      return true;
    case 'objectivePrefix':
      return filter.prefixes.some((prefix) => matchesObjectivePrefix(question.objectiveCode ?? '', prefix));
    case 'tag':
      return filter.tags.some((tag) => question.tags.includes(tag));
    case 'sourceTag':
      return filter.values.some((value) => question.sourceTag === value);
  }
}

/** 화면에서 온 규칙 값을 계약 형태로 다듬고 기본 검사를 한다. */
export function parseRuleSet(value: unknown): RuleSet {
  if (!value || typeof value !== 'object') throw new Error('출제 규칙 값이 올바르지 않습니다.');
  const rules = structuredClone(value) as RuleSet;
  requireText(rules.id, '규칙 ID');
  requireText(rules.name, '규칙 이름');
  requireText(rules.subject, '과목');
  if (!Array.isArray(rules.slots) || !Array.isArray(rules.constraints))
    throw new Error('출제 규칙의 슬롯과 제약 목록을 확인하세요.');
  rules.schemaVersion = rules.schemaVersion ?? 1;
  return rules;
}

export function createRulesService(storage: Storage, settings: () => Settings) {
  const selector = createSelector(standardConstraints);
  const subjectName = (subject: string) =>
    settings().subjects.find((item) => item.id === subject)?.name ?? subject;
  const ensurePresets = async () => {
    if ((await storage.ruleSets.list()).length) return;
    for (const preset of presetRuleSets()) await storage.ruleSets.save(preset);
  };
  const candidates = async (subject: string) =>
    (await storage.questions.query({ subject })).filter(
      (question) => parseObjectiveCode(question.objectiveCode ?? '') !== null,
    );
  return {
    ensurePresets,
    async ensureSubjectRules(ids: string[]): Promise<void> {
      const existing = await storage.ruleSets.list();
      const subjects = new Set(existing.map((rules) => rules.subject));
      const presets = presetRuleSets();
      for (const id of ids) {
        const subject = findSubjectById(id);
        if (!subject || subjects.has(id)) continue;
        const rules = presets.find((preset) => preset.subject === id) ?? subjectRuleSet(subject);
        if (existing.some((item) => item.id === rules.id))
          throw new Error(
            `기본 규칙 ID(${rules.id})가 다른 과목에서 사용 중입니다. 규칙 ID를 고친 뒤 다시 저장하세요.`,
          );
        await storage.ruleSets.save(rules);
        subjects.add(id);
      }
    },
    async list(): Promise<RuleSummary[]> {
      await ensurePresets();
      return (await storage.ruleSets.list()).map((rules) => ({
        id: rules.id,
        name: rules.name,
        subject: rules.subject,
        subjectName: subjectName(rules.subject),
        examCount: rules.examCount,
        questionsPerExam: slotsTotalCount(rules),
        needsConfirmation: rules.constraints.some((spec) => spec.needsConfirmation),
        isPreset: presetIds.has(rules.id),
      }));
    },
    async get(value: unknown): Promise<RuleSet> {
      await ensurePresets();
      const id = requireText(value, '규칙 ID');
      const rules = await storage.ruleSets.get(id);
      if (!rules) throw new Error('출제 규칙을 찾을 수 없습니다. 목록을 새로 고친 뒤 다시 선택하세요.');
      return rules;
    },
    async save(value: unknown): Promise<RuleSet> {
      const rules = parseRuleSet(value);
      const errors = validateRuleSet(rules, knownKinds).filter((item) => item.severity === 'error');
      if (errors.length) throw new Error(errors.map((item) => item.message).join(' '));
      await storage.ruleSets.save(rules);
      return rules;
    },
    async duplicate(value: unknown): Promise<RuleSet> {
      const source = await this.get(value);
      const copy: RuleSet = { ...structuredClone(source), id: randomUUID(), name: `${source.name} (복사본)` };
      await storage.ruleSets.save(copy);
      return copy;
    },
    async delete(value: unknown): Promise<void> {
      const id = requireText(value, '규칙 ID');
      await storage.ruleSets.delete(id);
    },
    async resetPreset(value: unknown): Promise<RuleSet> {
      const id = requireText(value, '규칙 ID');
      const preset = presetRuleSets().find((rules) => rules.id === id);
      if (!preset) throw new Error('기본 제공 규칙만 기본값으로 되돌릴 수 있습니다.');
      await storage.ruleSets.save(preset);
      return preset;
    },
    async check(value: unknown): Promise<RuleCheck> {
      const rules = parseRuleSet(value);
      const pool = await candidates(rules.subject);
      const noOverlap = rules.constraints.some((spec) => spec.kind === 'no-overlap-across-exams');
      const distinct = rules.constraints.find(
        (spec) => spec.kind === 'distinct-by-segment' && spec.params.scope === 'slot',
      );
      const depth = typeof distinct?.params.depth === 'number' ? distinct.params.depth : 2;
      const mode = typeof distinct?.params.mode === 'string' ? distinct.params.mode : 'strict-unless-single';
      const slots: SlotCheck[] = rules.slots.map((slot) => {
        const own = pool.filter((question) => slotMatches(question, rules, slot.id));
        const required = slot.count * (noOverlap ? Math.max(1, rules.examCount) : 1);
        const segments = distinct
          ? new Set(own.map((question) => segmentKey(question.objectiveCode!, depth) ?? '')).size
          : undefined;
        const strict =
          distinct && mode !== 'prefer' && !(mode === 'strict-unless-single' && (segments ?? 0) <= 1);
        const byDistinct = strict && segments !== undefined ? Math.max(0, slot.count - segments) : 0;
        const byShortage = Math.max(0, Math.ceil((required - own.length) / Math.max(1, rules.examCount)));
        return {
          slotId: slot.id,
          label: slot.label,
          perExam: slot.count,
          required,
          available: own.length,
          distinctSegments: segments,
          expectedBlanksPerExam: Math.min(slot.count, Math.max(byDistinct, byShortage)),
        };
      });
      const diagnostics = validateRuleSet(rules, knownKinds);
      if (!diagnostics.some((item) => item.severity === 'error'))
        diagnostics.push(...selector.precheck(rules, pool, { rng: createRng('rule-check'), history: [] }));
      return { slots, diagnostics, description: describeRuleSet(rules), candidates: pool.length };
    },
  };
}
