import { BookOpen, Library } from 'lucide-react';
import type { BankStats, ObjectiveNode } from '../../../shared/index';
import { TreeNodes } from './TreeNodes';
interface ObjectiveTreeProps {
  stats?: BankStats;
  subject: string;
  objective: string;
  withoutObjective: boolean;
  tree: Record<string, ObjectiveNode[]>;
  filter: (subject: string, code?: string) => void;
  setWithoutObjective: (value: boolean) => void;
}
import styles from './ObjectiveTree.module.css';
export function ObjectiveTree({
  stats,
  subject,
  objective,
  withoutObjective,
  tree,
  filter,
  setWithoutObjective,
}: ObjectiveTreeProps) {
  return (
    <aside className={styles['filter-panel']} aria-label="학습목표 필터">
      <h2>학습목표</h2>
      <button
        className={`${styles['filter-all']} ${!subject && !withoutObjective ? styles.selected : ''}`}
        onClick={() => {
          filter('');
          setWithoutObjective(false);
        }}
      >
        <Library />
        전체 문제<span>{stats?.total ?? '—'}</span>
      </button>
      <label className={styles['check-filter']}>
        <input
          type="checkbox"
          checked={withoutObjective}
          onChange={(event) => {
            setWithoutObjective(event.target.checked);
          }}
        />
        <span>학습목표 없음</span>
      </label>
      {stats?.bySubject.map((s) => (
        <section className={styles['subject-tree']} key={s.subject}>
          <button
            className={subject === s.subject && !objective ? styles.selected : ''}
            onClick={() => filter(s.subject)}
          >
            <BookOpen />
            <strong>{s.name}</strong>
            <span className={styles['tree-count']}>{s.count}</span>
          </button>
          <TreeNodes
            nodes={tree[s.subject] ?? []}
            selected={objective}
            select={(code) => filter(s.subject, code)}
          />
        </section>
      ))}
    </aside>
  );
}
