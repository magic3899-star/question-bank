import {
  AlertTriangle,
  CircleCheck,
  ArrowRight,
  BookOpen,
  ChevronRight,
  History,
  Library,
  Plus,
  Upload,
} from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, Spinner } from '../../components/index';
import { useApi, useReadySignal } from '../../hooks/index';
import { navigate } from '../../lib/index';
import styles from './HomeScreen.module.css';
export function HomeScreen() {
  const { value: stats, error, retry } = useApi(() => window.qb.bank.stats(), []);
  useReadySignal('home', !stats && !error, error);
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!stats) return <Spinner />;
  return (
    <div className={styles['home-page']}>
      <div className={styles['section-heading']}>
        <div>
          <h2>문제은행 현황</h2>
          <p>저장된 문제를 확인하고 작업을 시작하세요.</p>
        </div>
        <span className={styles['muted']}>
          전체 <strong>{stats.total.toLocaleString('ko-KR')}</strong>문제
        </span>
      </div>
      {stats.total === 0 ? (
        <Card title="첫 문제를 등록해 보세요">
          <EmptyState
            icon={<BookOpen />}
            title="아직 저장된 문제가 없습니다"
            description="문제를 가져오거나 직접 추가해 보세요"
          >
            <Button onClick={() => navigate('import')}>
              <Upload />
              문제 가져오기
            </Button>
            <Button onClick={() => navigate('add')}>
              <Plus />
              직접 추가
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <div className={styles['subject-cards']}>
          {stats.bySubject.map((subject) => (
            <button
              className={styles['subject-card']}
              key={subject.subject}
              onClick={() => navigate(`bank?subject=${encodeURIComponent(subject.subject)}`)}
            >
              <div>
                <BookOpen />
                <span>{subject.name}</span>
                <ChevronRight />
              </div>
              <strong className={styles['count']}>
                {subject.count.toLocaleString('ko-KR')}
                <small>문제</small>
              </strong>
              <p>학습목표별 문제 살펴보기</p>
            </button>
          ))}
        </div>
      )}
      <div className={styles['home-columns']}>
        <Card title="주의 필요">
          <div className={`${styles['notice']} ${stats.warnings.withoutObjective ? '' : styles.healthy}`}>
            {stats.warnings.withoutObjective ? (
              <AlertTriangle aria-hidden="true" />
            ) : (
              <CircleCheck aria-hidden="true" />
            )}
            <div>
              <strong>
                {stats.warnings.withoutObjective
                  ? `학습목표 없는 문제 ${stats.warnings.withoutObjective}개`
                  : '모든 문제에 학습목표가 있습니다'}
              </strong>
              {!!stats.warnings.withoutObjective && <p>출제하려면 학습목표를 지정해야 합니다.</p>}
            </div>
          </div>
          {!!stats.warnings.withoutObjective && (
            <Button onClick={() => navigate('bank?withoutObjective=1')}>
              문제 확인
              <ArrowRight />
            </Button>
          )}
        </Card>
        <Card title="최근 시험">
          <EmptyState
            compact
            icon={<History />}
            title="아직 만든 시험이 없습니다"
            description="시험 만들기는 다음 단계에서 제공됩니다."
          />
        </Card>
      </div>
      <div className={styles['help-strip']}>
        <Library />
        <span>문제은행에서 문항과 정답·해설을 확인할 수 있습니다.</span>
        <Button onClick={() => navigate('bank')}>문제은행 열기</Button>
      </div>
    </div>
  );
}
