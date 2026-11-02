import { useMemo, useState } from 'react';
import { ArrowRight, RefreshCw, Shuffle } from 'lucide-react';
import type { ExportPart } from '../../../../contracts/index';
import { Button, DiagnosticSummary, ExamPaper, Tabs } from '../../components/index';
import type { useGenerate } from './useGenerate';
import styles from './StepResult.module.css';

const partItems: { id: ExportPart; label: string }[] = [
  { id: 'questions', label: '문제지' },
  { id: 'answers', label: '정답지' },
  { id: 'explanations', label: '해설지' },
];

export function StepResult({ model }: { model: ReturnType<typeof useGenerate> }) {
  const session = model.session!;
  const [examIndex, setExamIndex] = useState(0);
  const [part, setPart] = useState<ExportPart>('questions');
  const snapshot = session.snapshots[Math.min(examIndex, session.snapshots.length - 1)]!;
  const distribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of snapshot.items)
      if (!item.blank && item.answerLabels.length === 1)
        counts.set(item.answerLabels[0]!, (counts.get(item.answerLabels[0]!) ?? 0) + 1);
    return ['①', '②', '③', '④', '⑤'].map((label) => `${label} ${counts.get(label) ?? 0}`).join(' · ');
  }, [snapshot]);
  const notices = session.diagnostics.filter(
    (item) => item.severity !== 'info' || item.code === 'NO_REPLACEMENT',
  );
  return (
    <div className={styles.result}>
      <div className={styles.resultBar}>
        <Tabs
          label="회차"
          value={String(examIndex)}
          items={session.snapshots.map((item, index) => ({ id: String(index), label: `${index + 1}회` }))}
          onChange={(value) => setExamIndex(Number(value))}
        />
        <Tabs label="문서" value={part} items={partItems} onChange={setPart} />
        <span className={styles.seed}>다시 만들기 번호 {session.seed}</span>
        <Button onClick={() => void model.regenerate(examIndex)}>
          <RefreshCw aria-hidden="true" />이 회차 다시 뽑기
        </Button>
        <Button variant="primary" onClick={() => model.setStep(5)}>
          다음: 저장
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
      <DiagnosticSummary diagnostics={notices} />
      <div className={styles.resultBody}>
        <ExamPaper snapshot={snapshot} part={part} />
        <aside className={styles.items} aria-label={`${snapshot.title} 문항 목록`}>
          <div className={styles.itemsHead}>
            <strong>{snapshot.title}</strong>
            <span>정답 분포 {distribution}</span>
          </div>
          <ol>
            {snapshot.items.map((item) => (
              <li key={item.number} className={item.blank ? styles.blank : ''}>
                <span className={styles.number}>{item.number}</span>
                <span className={styles.itemText}>
                  {item.blank ? (
                    '비워 둔 번호'
                  ) : (
                    <>
                      <small>{item.objectiveCode}</small>
                      {plain(item.stem)}
                    </>
                  )}
                </span>
                {!item.blank && (
                  <button
                    type="button"
                    className={styles.replace}
                    aria-label={`${item.number}번 다른 문제로 바꾸기`}
                    title="다른 문제로 바꾸기"
                    onClick={() => void model.replace(examIndex, item.number)}
                  >
                    <Shuffle aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

function plain(blocks: { type: string; runs?: { text: string }[] }[]): string {
  const text = blocks
    .flatMap((block) => (block.type === 'paragraph' ? (block.runs ?? []).map((run) => run.text) : []))
    .join('')
    .replace(/\s+/gu, ' ')
    .trim();
  return Array.from(text).slice(0, 60).join('');
}
