import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';
export function EmptyState({
  icon,
  title,
  description,
  children,
  compact = false,
  className = '',
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div data-empty className={`${styles.empty} ${compact ? styles.compact : ''} ${className}`}>
      <div className={styles['empty-icon']} aria-hidden="true">
        {icon}
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children && <div className={styles['actions']}>{children}</div>}
    </div>
  );
}
