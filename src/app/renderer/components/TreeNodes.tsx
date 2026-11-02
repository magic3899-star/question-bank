import { ChevronRight } from 'lucide-react';
import type { ObjectiveNode } from '../../shared/index';
import styles from './TreeNodes.module.css';
export function TreeNodes({
  nodes,
  selected,
  select,
}: {
  nodes: ObjectiveNode[];
  selected: string;
  select: (code: string) => void;
}) {
  return (
    <ul className={styles['tree-nodes']}>
      {nodes.map((node) => (
        <li key={node.code}>
          {node.children.length ? (
            <details>
              <summary>
                <ChevronRight />
                <span>{node.code}</span>
                <span className={styles['tree-count']}>{node.count}</span>
              </summary>
              <button
                className={`${styles['tree-filter']} ${selected === node.code ? styles.selected : ''}`}
                onClick={() => select(node.code)}
              >
                이 단원 전체 보기
              </button>
              <TreeNodes nodes={node.children} selected={selected} select={select} />
            </details>
          ) : (
            <button
              className={selected === node.code ? styles.selected : ''}
              onClick={() => select(node.code)}
            >
              <span>{node.code}</span>
              <span className={styles['tree-count']}>{node.count}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
