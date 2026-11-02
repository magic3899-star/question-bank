import type { Dispatch, SetStateAction } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, FileText, Image as ImageIcon, Library } from 'lucide-react';
import type { BankStats, QuestionSummary } from '../../../shared/index';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  SearchInput,
  Skeleton,
  Tooltip,
} from '../../components/index';
interface QuestionListProps {
  stats?: BankStats;
  subject: string;
  objective: string;
  withoutObjective: boolean;
  search: string;
  setSearch: (value: string) => void;
  total: number;
  filter: (subject: string, code?: string) => void;
  setWithoutObjective: (value: boolean) => void;
  loading: boolean;
  error: string;
  retry: () => void;
  items: QuestionSummary[];
  selected: string;
  select: (id: string) => void;
  offset: number;
  setOffset: Dispatch<SetStateAction<number>>;
}
import styles from './QuestionList.module.css';
export function QuestionList({
  stats,
  subject,
  objective,
  withoutObjective,
  search,
  setSearch,
  total,
  filter,
  setWithoutObjective,
  loading,
  error,
  retry,
  items,
  selected,
  select,
  offset,
  setOffset,
}: QuestionListProps) {
  return (
    <section className={styles['question-list-panel']} aria-label="문제 목록">
      <div className={styles['list-toolbar']}>
        <SearchInput id="quick-search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className={styles['list-summary']}>
          <strong>{total.toLocaleString('ko-KR')}문제</strong>
          <span>보기 전용</span>
        </div>
        {(subject || objective || withoutObjective) && (
          <div className={styles['active-filter']}>
            <span>
              {objective || stats?.bySubject.find((s) => s.subject === subject)?.name || '전체 과목'}
              {withoutObjective ? ' · 학습목표 없음' : ''}
            </span>
            <Button
              onClick={() => {
                filter('');
                setWithoutObjective(false);
              }}
            >
              필터 해제
            </Button>
          </div>
        )}
      </div>
      <div className={styles['question-list']} aria-busy={loading}>
        {loading ? (
          <Skeleton />
        ) : error ? (
          <ErrorState message={error} retry={retry} />
        ) : !items.length ? (
          <EmptyState
            icon={<Library />}
            title="검색 결과가 없습니다"
            description="검색어나 학습목표 필터를 바꿔 보세요."
          />
        ) : (
          items.map((item) => (
            <button
              className={`${styles['question-row']} ${selected === item.id ? styles.selected : ''}`}
              key={item.id}
              aria-pressed={selected === item.id}
              onClick={() => {
                select(item.id);
              }}
            >
              <div className={styles['row-meta']}>
                <span>{item.objectiveCode || '학습목표 없음'}</span>
                {item.grade && <Badge>{item.grade}등급</Badge>}
                {item.warnings > 0 && (
                  <Tooltip label={`주의 ${item.warnings}건`}>
                    <span className={styles['warning-inline']}>
                      <AlertTriangle />
                      {item.warnings}
                    </span>
                  </Tooltip>
                )}
              </div>
              <p>{item.stemPreview}</p>
              <span className={styles['row-icons']}>
                {item.hasPassage && (
                  <span>
                    <FileText />
                    지문
                  </span>
                )}
                {item.hasImage && (
                  <span>
                    <ImageIcon />
                    이미지
                  </span>
                )}
                <span>선지 {item.choiceCount}개</span>
              </span>
            </button>
          ))
        )}
      </div>
      <div className={styles['pagination']}>
        <Button
          aria-label="이전 페이지"
          disabled={offset === 0 || loading}
          onClick={() => setOffset((n) => Math.max(0, n - 50))}
        >
          <ArrowLeft />
        </Button>
        <span>
          {total ? Math.floor(offset / 50) + 1 : 0} / {Math.ceil(total / 50)}
        </span>
        <Button
          aria-label="다음 페이지"
          disabled={offset + 50 >= total || loading}
          onClick={() => setOffset((n) => n + 50)}
        >
          <ArrowRight />
        </Button>
      </div>
    </section>
  );
}
