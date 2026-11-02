import { describe, expect, it } from 'vitest';
import { presetRuleSets } from '../../../../modules/rules/index';
import { fromConstraintForm, parsePrefixes, toConstraintForm } from './ruleForm';

describe('규칙 화면 변환', () => {
  it('법규 프리셋을 화면 설정으로 바꾸고 그대로 되돌린다', () => {
    const law = presetRuleSets().find((rules) => rules.id === 'law')!;
    const form = toConstraintForm(law);
    expect(form).toMatchObject({
      noOverlap: true,
      noDuplicate: true,
      distinctMiddle: true,
      middleMode: 'strict-unless-single',
      distinctObjective: true,
    });
    const back = fromConstraintForm(form, true, law);
    const kinds = (list: typeof back) =>
      list.map((spec) => `${spec.kind}:${JSON.stringify(spec.params)}`).sort();
    expect(kinds(back)).toEqual(kinds(law.constraints));
  });

  it('체크를 끄면 제약이 빠지고, 최근 N회는 숫자가 있을 때만 들어간다', () => {
    const law = presetRuleSets().find((rules) => rules.id === 'law')!;
    const form = { ...toConstraintForm(law), distinctMiddle: false, excludeRecent: 2 };
    const specs = fromConstraintForm(form, true, law);
    expect(specs.some((spec) => spec.kind === 'distinct-by-segment' && spec.params.depth === 2)).toBe(false);
    expect(specs.find((spec) => spec.kind === 'exclude-recent')!.params.lastNExams).toBe(2);
  });

  it('확인을 마치면 needsConfirmation 표시를 지운다', () => {
    const law = presetRuleSets().find((rules) => rules.id === 'law')!;
    const flagged = {
      ...law,
      constraints: law.constraints.map((spec) => ({ ...spec, needsConfirmation: true, note: '확인' })),
    };
    expect(
      fromConstraintForm(toConstraintForm(flagged), false, flagged).some((s) => s.needsConfirmation),
    ).toBe(false);
    expect(
      fromConstraintForm(toConstraintForm(flagged), true, flagged).every((s) => s.needsConfirmation),
    ).toBe(true);
  });

  it('학습목표 접두는 쉼표·줄바꿈으로 나누고 중복을 없앤다', () => {
    expect(parsePrefixes('법규 1, 법규  2\n법규 1，')).toEqual(['법규 1', '법규 2']);
  });
});
