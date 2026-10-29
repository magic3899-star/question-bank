import { expect, it } from 'vitest';
import { htmlToPlainText } from './htmlText';

it('태그와 스타일을 제거한 뒤 엔티티를 한 번만 복원해 원본의 HTML 모양 텍스트도 보존한다', () => {
  const html = '<head><title>제목</title><style>.x {color: red}</style></head><p>&lt;script&gt;&amp;lt; &quot; &#39; &#XAC00;</p><p>가<br>나&emsp;다  라</p>';
  expect(htmlToPlainText(html)).toBe('<script>&lt; " \' 가\n가\n나\t다  라\n');
});
