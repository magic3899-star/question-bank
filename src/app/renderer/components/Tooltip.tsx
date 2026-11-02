import type { ReactNode } from 'react';
import styles from './Tooltip.module.css';
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className={styles['tooltip']} title={label} aria-label={label}>
      {children}
    </span>
  );
}
