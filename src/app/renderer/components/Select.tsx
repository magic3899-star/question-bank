import { useId } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import styles from './Select.module.css';

export function Select({
  label,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  const generated = useId();
  const id = props.id ?? generated;
  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}</span>
      <span className={styles.control}>
        <select
          {...props}
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : props['aria-describedby']}
        >
          {children}
        </select>
        <ChevronDown aria-hidden="true" />
      </span>
      {error && (
        <span className={styles.error} id={`${id}-error`}>
          <AlertTriangle aria-hidden="true" />
          {error}
        </span>
      )}
    </label>
  );
}
