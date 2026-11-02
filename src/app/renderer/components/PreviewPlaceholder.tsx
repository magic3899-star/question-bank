import { Skeleton } from './Skeleton';
import styles from './PreviewPlaceholder.module.css';

export function PreviewPlaceholder() {
  return (
    <div className={styles.placeholder}>
      <Skeleton label="문항 미리보기를 불러오고 있습니다" />
    </div>
  );
}
