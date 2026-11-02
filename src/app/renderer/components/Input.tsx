import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { AlertTriangle } from 'lucide-react';
import styles from './Input.module.css';
export function Input({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <label className={styles['field']} htmlFor={props.id ?? id}>
      <span>{label}</span>
      <input
        {...props}
        id={props.id ?? id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <span className={styles['danger']} id={`${id}-error`}>
          <AlertTriangle />
          {error}
        </span>
      )}
    </label>
  );
}
