import { ArrowRight, BookOpen, ClipboardList } from 'lucide-react';
import { Badge, Button, EmptyState } from '../../components/index';
import { navigate } from '../../lib/index';
import type { useGenerate } from './useGenerate';
import styles from './StepRules.module.css';

export function StepRules({ model }: { model: ReturnType<typeof useGenerate> }) {
  const rules = model.rules ?? [];
  if (!rules.length)
    return (
      <EmptyState
        icon={<ClipboardList />}
        title="출제 규칙이 없습니다"
        description="출제 규칙을 먼저 만드세요."
      >
        <Button onClick={() => navigate('rules')}>출제 규칙으로 이동</Button>
      </EmptyState>
    );
  return (
    <div className={styles.step}>
      <div className={styles.heading}>
        <h2>어떤 시험을 만들까요?</h2>
        <p>과목별 출제 규칙을 고르세요. 규칙은 '출제 규칙' 화면에서 바꿀 수 있습니다.</p>
      </div>
      <div className={styles.cards}>
        {rules.map((rule) => (
          <button
            type="button"
            key={rule.id}
            className={`${styles.card} ${rule.id === model.ruleId ? styles.selected : ''}`}
            aria-pressed={rule.id === model.ruleId}
            onClick={() => model.setRuleId(rule.id)}
          >
            <span className={styles.cardTitle}>
              <BookOpen aria-hidden="true" />
              {rule.name}
              {rule.needsConfirmation && <Badge kind="confirmation">확인 필요</Badge>}
            </span>
            <span className={styles.cardMeta}>
              {rule.subjectName} · {rule.examCount}회 × {rule.questionsPerExam}문제
            </span>
          </button>
        ))}
      </div>
      {model.check && model.ruleId && (
        <ul className={styles.description}>
          {model.check.description.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <Button
          variant="primary"
          disabledReason={model.ruleId ? undefined : '출제 규칙을 먼저 고르세요.'}
          onClick={() => model.setStep(2)}
        >
          다음: 옵션
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
