import type { InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';
import { Input } from './Input';
import styles from './SearchInput.module.css';
export function SearchInput({
  label = '문제 검색',
  placeholder = '문제 내용·학습목표 검색 (Ctrl+K)',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <div className={styles['search']}>
      <Search aria-hidden="true" />
      <Input {...props} type="search" label={label} placeholder={placeholder} />
    </div>
  );
}
