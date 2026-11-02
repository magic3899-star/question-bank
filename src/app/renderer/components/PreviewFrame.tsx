import { useEffect, useMemo, useRef, useState } from 'react';
import type { QuestionDetail } from '../../shared/index';
import { renderQuestionHtml } from '../../../modules/render-html/index';
import { PreviewPlaceholder } from './PreviewPlaceholder';
import { afterTwoFrames } from '../lib/index';
import styles from './PreviewFrame.module.css';

export function PreviewFrame({
  detail,
  onReady,
}: {
  detail: QuestionDetail;
  onReady: (detail: QuestionDetail) => void;
}) {
  const html = useMemo(() => renderQuestionHtml(detail.question, detail.assets), [detail]);
  const [paintedHtml, setPaintedHtml] = useState<string>();
  const painted = paintedHtml === html;
  const cancelRef = useRef<() => void>(() => {});
  useEffect(() => () => cancelRef.current(), [html]);
  useEffect(() => {
    if (painted) onReady(detail);
  }, [painted, detail, onReady]);
  return (
    <div className={styles.frame} aria-busy={!painted}>
      {!painted && (
        <div className={styles.placeholder}>
          <PreviewPlaceholder />
        </div>
      )}
      <iframe
        title="문항·정답·해설 미리보기"
        sandbox=""
        srcDoc={html}
        className={painted ? styles.paper : styles.pending}
        onLoad={() => {
          cancelRef.current();
          cancelRef.current = afterTwoFrames(
            () => {
              setPaintedHtml(html);
            },
            requestAnimationFrame,
            cancelAnimationFrame,
          );
        }}
      />
    </div>
  );
}
