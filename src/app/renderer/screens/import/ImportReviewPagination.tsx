import { Button } from '../../components/index';
import styles from './ImportReviewPagination.module.css';

export function ImportReviewPagination({
  page,
  pages,
  total,
  disabled,
  change,
}: {
  page: number;
  pages: number;
  total: number;
  disabled: boolean;
  change: (page: number) => void;
}) {
  return (
    <nav className={styles.pagination} aria-label="검수 목록 페이지">
      <Button disabled={disabled || page === 0} onClick={() => change(page - 1)}>
        이전
      </Button>
      <span aria-live="polite">
        {page + 1} / {pages} 쪽 · 전체 {total}개
      </span>
      <Button disabled={disabled || page + 1 === pages} onClick={() => change(page + 1)}>
        다음
      </Button>
    </nav>
  );
}
