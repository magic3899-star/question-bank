import { describe, expect, it } from 'vitest';
import { makeQuestion, para } from '../../../tests/fixtures/builders';
import { renderQuestionHtml } from './index';

describe('문항 상세 미리보기', () => {
  it('출력 공용 블록 렌더러로 문제·지문·선지·정답·해설·목표를 표시하고 HTML을 이스케이프한다', () => {
    const q = makeQuestion({
      stem: [para('<script>가짜</script>')],
      objectiveCode: '<목표>',
      explanation: [],
    });
    const html = renderQuestionHtml(q, {});
    expect(html).toContain('&lt;script&gt;가짜&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('가짜 지문 1');
    expect(html).toContain('정답: ①');
    expect(html).toContain('해설이 없습니다.');
    expect(html).toContain('학습목표: &lt;목표&gt;');
    expect(html).toContain("script-src 'none'");
    expect(q.choices[0].content).toEqual([para('가짜 선지 1')]);
  });
});
