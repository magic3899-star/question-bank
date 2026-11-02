import type { ReactNode } from 'react';
import { AlertTriangle, CircleHelp, CheckCircle2 } from 'lucide-react';
import styles from './Badge.module.css';
export function Badge({
  kind = 'grade',
  children,
}: {
  kind?: 'warning' | 'error' | 'confirmation' | 'grade';
  children: ReactNode;
}) {
  const Icon =
    kind === 'warning' || kind === 'error'
      ? AlertTriangle
      : kind === 'confirmation'
        ? CircleHelp
        : CheckCircle2;
  return (
    <span className={`${styles.badge} ${styles[kind] ?? ''}`}>
      <Icon aria-hidden="true" />
      {children}
    </span>
  );
}
