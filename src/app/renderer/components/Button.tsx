import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';
export function Button({
  variant = 'secondary',
  disabledReason,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  disabledReason?: string;
}) {
  const button = (
    <button
      {...props}
      className={`${styles.button} ${styles[variant] ?? ''} ${props.className ?? ''}`}
      disabled={props.disabled || !!disabledReason}
      title={disabledReason ?? props.title}
    >
      {children}
    </button>
  );
  return disabledReason ? (
    <span
      tabIndex={0}
      className={styles['disabled-button']}
      aria-label={disabledReason}
      title={disabledReason}
    >
      {button}
    </span>
  ) : (
    button
  );
}
