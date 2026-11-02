import type { Diagnostic } from '../../../contracts/index';
import { Badge } from './Badge';
import styles from './DiagnosticSummary.module.css';

const label = { error: '오류', warn: '경고', info: '정보' } as const;
const kind = { error: 'error', warn: 'warning', info: 'confirmation' } as const;

/** 같은 종류의 진단(예: 회차마다 반복되는 빈 번호 경고)을 한 줄로 묶고, 자세한 내용은 펼쳐 본다. */
export function DiagnosticSummary({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (!diagnostics.length) return null;
  const groups = new Map<string, Diagnostic[]>();
  for (const item of diagnostics) {
    const key = `${item.severity}:${item.code}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <ul className={styles.summary}>
      {[...groups.values()].map((items) => {
        const first = items[0]!;
        return (
          <li key={`${first.severity}:${first.code}`}>
            <Badge kind={kind[first.severity]}>{label[first.severity]}</Badge>
            {items.length === 1 ? (
              <span>{first.message}</span>
            ) : (
              <details>
                <summary>
                  {first.message.split('. ')[0]}
                  {` 외 ${items.length - 1}건`}
                </summary>
                <ul>
                  {items.map((item, index) => (
                    <li key={index}>{item.message}</li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
