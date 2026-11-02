import { ClipboardList, History } from 'lucide-react';
import { Button, Card, EmptyState } from '../../components/index';
import { useApi } from '../../hooks/index';
import { navigate } from '../../lib/index';
import styles from './RecentExams.module.css';

export function RecentExams() {
  const recent = useApi(() => window.qb.history.list({ limit: 5 }), []);
  const items = recent.value?.items ?? [];
  return (
    <Card title="최근 시험">
      {!items.length ? (
        <EmptyState
          compact
          icon={<History />}
          title="아직 만든 시험이 없습니다"
          description="시험을 만들어 저장하면 여기에 표시됩니다."
        >
          <Button onClick={() => navigate('generate')}>
            <ClipboardList aria-hidden="true" />
            시험 만들기
          </Button>
        </EmptyState>
      ) : (
        <ul className={styles.recent}>
          {items.map((item) => (
            <li key={item.examId}>
              <button type="button" onClick={() => navigate('history')}>
                <strong>{item.title}</strong>
                <span>
                  {new Date(item.createdAt).toLocaleDateString('ko-KR')} · {item.questionCount}문제
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
