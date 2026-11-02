import { useState } from 'react';
import type { ObjectiveNode } from '../../../shared/index';
import { Button, Dialog, ErrorState, Spinner } from '../../components/index';
import { useApi } from '../../hooks/index';
import styles from './ObjectivePicker.module.css';

/** 은행의 학습목표 트리에서 대단원·중단원을 골라 슬롯 대상으로 쓴다. */
export function ObjectivePicker({
  subject,
  selected,
  close,
  apply,
}: {
  subject: string;
  selected: string[];
  close: () => void;
  apply: (prefixes: string[]) => void;
}) {
  const tree = useApi(() => window.qb.bank.objectiveTree(subject), [subject]);
  const [picked, setPicked] = useState<string[]>(selected);
  const toggle = (code: string) =>
    setPicked((list) => (list.includes(code) ? list.filter((item) => item !== code) : [...list, code]));
  const row = (node: ObjectiveNode, depth: number) => (
    <li key={node.code}>
      <label className={styles.pickRow} style={{ paddingLeft: depth * 20 }}>
        <input type="checkbox" checked={picked.includes(node.code)} onChange={() => toggle(node.code)} />
        <span>{node.code}</span>
        <small>{node.count}문제</small>
      </label>
      {depth === 0 && node.children.length > 0 && <ul>{node.children.map((child) => row(child, 1))}</ul>}
    </li>
  );
  return (
    <Dialog title="대상 학습목표 고르기" close={close}>
      <p className={styles.meta}>
        대단원을 고르면 그 아래 모든 문제가 대상입니다. 중단원만 고를 수도 있습니다.
      </p>
      {tree.error ? (
        <ErrorState message={tree.error} retry={tree.retry} />
      ) : !tree.value ? (
        <Spinner />
      ) : (
        <ul className={styles.pickList}>{tree.value.map((node) => row(node, 0))}</ul>
      )}
      <div className={styles.dialogActions}>
        <Button onClick={close}>취소</Button>
        <Button variant="primary" onClick={() => apply(picked)}>
          {picked.length}개 적용
        </Button>
      </div>
    </Dialog>
  );
}
