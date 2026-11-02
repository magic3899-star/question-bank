import styles from './Skeleton.module.css';
export function Skeleton({ label = '문제 목록을 불러오고 있습니다' }: { label?: string }) {
  return (
    <div role="status" aria-label={label}>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <div className={styles['skeleton']} key={n} />
      ))}
    </div>
  );
}
