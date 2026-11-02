import { LoaderCircle } from 'lucide-react';
import styles from './Spinner.module.css';
export function Spinner({ label = '데이터를 불러오고 있습니다' }: { label?: string }) {
  return (
    <div className={styles['loading']} role="status">
      <LoaderCircle className={styles['spin']} aria-hidden="true" />
      {label}
    </div>
  );
}
