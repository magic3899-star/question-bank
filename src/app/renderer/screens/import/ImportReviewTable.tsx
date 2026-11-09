import { filterReviewItems, reviewPage, REVIEW_PAGE_SIZE } from './review-page';
import { ImportReviewPagination } from './ImportReviewPagination';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ImportPatch, ImportReview } from '../../../shared/index';
import { Badge, EmptyState, Tabs } from '../../components/index';
import { FileText } from 'lucide-react';
import { ImportExpanded } from './ImportExpanded';
import { statusLabels } from './review';
import styles from './ImportReviewTable.module.css';

const filters = [
  { id: 'all', label: '전체' },
  { id: 'ok', label: '정상' },
  { id: 'warn', label: '경고' },
  { id: 'error', label: '오류' },
  { id: 'excluded', label: '제외' },
  { id: 'duplicate', label: '은행과 중복' },
  { id: 'skipped', label: '가져오기 전 제외' },
];
export function ImportReviewTable({
  review,
  update,
  disabled,
  capture,
  onPreviewReady,
}: {
  review: ImportReview;
  update: (index: number, patch: Omit<ImportPatch, 'index'>) => void;
  disabled: boolean;
  capture: boolean;
  onPreviewReady: () => void;
}) {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState<number | undefined>(() =>
    capture
      ? (
          review.items.find((i) => i.status === 'warn' || i.diagnostics.some((d) => d.severity === 'warn')) ??
          review.items[0]
        )?.index
      : undefined,
  );
  const [selected, setSelected] = useState(0);
  const expandedRow = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (capture) expandedRow.current?.scrollIntoView({ block: 'start' });
  }, [capture, expanded]);
  const [requestedPage, setPage] = useState(() =>
    Math.floor(
      Math.max(
        0,
        review.items.findIndex((item) => item.index === expanded),
      ) / REVIEW_PAGE_SIZE,
    ),
  );
  const filtered = useMemo(() => filterReviewItems(review.items, filter), [review.items, filter]);
  const result = reviewPage(filtered, requestedPage);
  const skippedPage = reviewPage(review.skipped, requestedPage);
  const items = result.items;
  const changePage = (page: number) => {
    setPage(page);
    setSelected(0);
    setExpanded(undefined);
  };
  const pagination = (
    <ImportReviewPagination
      {...(filter === 'skipped' ? skippedPage : result)}
      disabled={disabled}
      change={changePage}
    />
  );
  return (
    <section className={styles.review} aria-label="가져오기 검수">
      <p className={styles.summary}>
        문제 {review.items.length}개 · 정상 {review.counts.ok} · 경고 {review.counts.warn} · 오류{' '}
        {review.counts.error} · 제외 {review.counts.excluded} · 가져오기 전 제외 {review.skipped.length}
      </p>
      <Tabs
        label="검수 필터"
        items={filters}
        value={filter}
        onChange={(value) => {
          setFilter(value);
          setSelected(0);
          setPage(0);
          setExpanded(undefined);
        }}
      />
      {pagination}
      <div className={styles.scroll}>
        {filter === 'skipped' ? (
          review.skipped.length ? (
            <ul>
              {skippedPage.items.map((d, i) => (
                <li key={i}>{d.message}</li>
              ))}
            </ul>
          ) : (
            <p>가져오기 전에 제외된 문제가 없습니다.</p>
          )
        ) : !items.length ? (
          <EmptyState
            compact
            icon={<FileText />}
            title="해당 문제가 없습니다"
            description="다른 필터를 선택하거나 원본 문서와 가져오기 옵션을 확인하세요."
          />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>원문 위치</th>
                <th>학습목표</th>
                <th>등급</th>
                <th>문제 앞부분</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, position) => (
                <Fragment key={item.index}>
                  <tr
                    ref={expanded === item.index ? expandedRow : undefined}
                    tabIndex={position === Math.min(selected, items.length - 1) ? 0 : -1}
                    aria-expanded={expanded === item.index}
                    className={expanded === item.index ? styles.selected : undefined}
                    onFocus={() => setSelected(position)}
                    onClick={() => setExpanded(expanded === item.index ? undefined : item.index)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        const next = Math.max(
                          0,
                          Math.min(items.length - 1, position + (event.key === 'ArrowDown' ? 1 : -1)),
                        );
                        setSelected(next);
                        event.currentTarget
                          .closest('tbody')
                          ?.querySelectorAll<HTMLElement>('tr[tabindex]')
                          [next]?.focus();
                      } else if (event.key === 'Enter') {
                        event.preventDefault();
                        setExpanded(expanded === item.index ? undefined : item.index);
                      } else if (event.key === ' ' && !disabled) {
                        event.preventDefault();
                        update(item.index, { include: item.status === 'excluded' });
                      }
                    }}
                  >
                    <td>
                      <button
                        aria-label={`${item.sourceLocation} ${expanded === item.index ? '접기' : '펼치기'}`}
                        aria-expanded={expanded === item.index}
                      >
                        {item.sourceLocation}
                      </button>
                    </td>
                    <td>{item.draft.objectiveCode || '없음'}</td>
                    <td>{item.draft.grade || '—'}</td>
                    <td>
                      {item.summary.stemPreview}
                      <small>
                        {item.summary.hasImage ? '이미지 · ' : ''}
                        {item.summary.hasPassage ? '지문 있음' : ''}
                      </small>
                    </td>
                    <td>
                      <Badge
                        kind={
                          item.status === 'error'
                            ? 'error'
                            : item.status === 'warn'
                              ? 'warning'
                              : item.status === 'excluded'
                                ? 'confirmation'
                                : 'grade'
                        }
                      >
                        {statusLabels[item.status]}
                      </Badge>
                    </td>
                  </tr>
                  {expanded === item.index && (
                    <tr>
                      <td colSpan={5}>
                        <ImportExpanded
                          item={item}
                          assets={review.assets}
                          disabled={disabled}
                          update={(patch) => update(item.index, patch)}
                          onReady={onPreviewReady}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {pagination}
    </section>
  );
}
