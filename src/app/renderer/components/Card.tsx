import type { ReactNode } from 'react';
import styles from './Card.module.css';
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles['card']}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
