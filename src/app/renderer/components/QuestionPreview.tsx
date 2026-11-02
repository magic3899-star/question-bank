import { FileText } from 'lucide-react';
import type { QuestionDetail } from '../../shared/index';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { PreviewFrame } from './PreviewFrame';
import { PreviewPlaceholder } from './PreviewPlaceholder';
import styles from './QuestionPreview.module.css';

export function QuestionPreview({
  detail,
  loading,
  error,
  retry,
  onReady,
}: {
  detail?: QuestionDetail;
  loading: boolean;
  error: string;
  retry: () => void;
  onReady: (detail: QuestionDetail) => void;
}) {
  return (
    <section className={styles['detail-panel']} aria-label="문항 상세" aria-busy={loading}>
      <div className={styles['detail-heading']}>
        <div>
          <h2>문항 미리보기</h2>
          <p>출력과 같은 문항 렌더러</p>
        </div>
        {detail?.question.grade && <Badge>{detail.question.grade}등급</Badge>}
      </div>
      {loading ? (
        <PreviewPlaceholder />
      ) : error ? (
        <ErrorState message={error} retry={retry} />
      ) : detail ? (
        <PreviewFrame key={detail.question.id} detail={detail} onReady={onReady} />
      ) : (
        <EmptyState
          className={styles.empty}
          icon={<FileText />}
          title="문제를 선택하세요"
          description="본문과 정답·해설을 확인할 수 있습니다."
        />
      )}
      <div className={styles['detail-footer']}>
        <span>문항 편집은 다음 단계에서 제공됩니다.</span>
      </div>
    </section>
  );
}
