import { useState } from 'react';
import type { QuestionDetail } from '../../../shared/index';
import { useApi } from '../../hooks/index';
import { ErrorState, PreviewFrame, Spinner } from '../../components/index';
import styles from './DuplicatePreview.module.css';

export function DuplicatePreview({ id }: { id: string }) {
  const detail = useApi(() => window.qb.bank.get(id), [id]);
  const [ready, setReady] = useState<QuestionDetail>();
  return (
    <div className={styles.preview} aria-busy={!ready}>
      {detail.loading ? (
        <Spinner />
      ) : detail.error ? (
        <ErrorState message={detail.error} retry={detail.retry} />
      ) : (
        detail.value && <PreviewFrame detail={detail.value} onReady={setReady} />
      )}
    </div>
  );
}
