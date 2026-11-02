import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { ExamSnapshot, ExportPart } from '../../../contracts/index';
import { renderExamHtml } from '../../../modules/render-html/index';
import styles from './ExamPaper.module.css';

const zoomSteps = [0.6, 0.75, 0.9, 1, 1.15];

/** 출력(PDF)과 같은 렌더러로 만든 A4 시험지 미리보기. */
export function ExamPaper({ snapshot, part }: { snapshot: ExamSnapshot; part: ExportPart }) {
  const [zoom, setZoom] = useState(2);
  const html = useMemo(
    () =>
      renderExamHtml([snapshot], { parts: [part], combineParts: false, templateId: 'standard' })[0]?.html ??
      '',
    [snapshot, part],
  );
  return (
    <div className={styles.paper}>
      <div className={styles.zoom} role="group" aria-label="미리보기 크기">
        <button
          type="button"
          aria-label="작게 보기"
          disabled={zoom === 0}
          onClick={() => setZoom((value) => Math.max(0, value - 1))}
        >
          <Minus aria-hidden="true" />
        </button>
        <span>{Math.round(zoomSteps[zoom]! * 100)}%</span>
        <button
          type="button"
          aria-label="크게 보기"
          disabled={zoom === zoomSteps.length - 1}
          onClick={() => setZoom((value) => Math.min(zoomSteps.length - 1, value + 1))}
        >
          <Plus aria-hidden="true" />
        </button>
      </div>
      <iframe
        title={`${snapshot.title} 미리보기`}
        sandbox=""
        srcDoc={html}
        className={styles.frame}
        style={{ zoom: zoomSteps[zoom] }}
      />
    </div>
  );
}
