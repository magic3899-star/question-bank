import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button, DiagnosticSummary, SlotBars, Spinner } from '../../components/index';
import type { useGenerate } from './useGenerate';
import styles from './StepCheck.module.css';

export function StepCheck({ model }: { model: ReturnType<typeof useGenerate> }) {
  const check = model.check;
  if (!check || !model.rule) return <Spinner label="사전 점검 중입니다" />;
  const errors = check.diagnostics.filter((item) => item.severity === 'error');
  const notices = check.diagnostics.filter((item) => item.severity !== 'error');
  const blanks = check.slots.reduce((sum, slot) => sum + slot.expectedBlanksPerExam, 0);
  return (
    <div className={styles.step}>
      <div className={styles.heading}>
        <h2>문제은행 사전 점검</h2>
        <p>
          {model.rule.name} · 후보 문제 {check.candidates}개 · {model.rule.examCount}회
        </p>
      </div>
      <SlotBars slots={check.slots} examCount={model.rule.examCount} />
      {blanks > 0 && (
        <p className={styles.warn}>
          회차마다 빈 번호 {blanks}개가 예상됩니다. 그래도 만들 수 있으며, 빈 번호는 시험지에 비워 둔 번호로
          표시됩니다.
        </p>
      )}
      <DiagnosticSummary diagnostics={[...errors, ...notices]} />
      <div className={styles.actions}>
        <Button onClick={() => model.setStep(2)}>
          <ArrowLeft aria-hidden="true" />
          이전
        </Button>
        <Button
          variant="primary"
          disabledReason={errors.length ? '오류를 먼저 해결하세요.' : undefined}
          onClick={() => void model.generate()}
        >
          <Sparkles aria-hidden="true" />
          시험 만들기
        </Button>
      </div>
    </div>
  );
}
