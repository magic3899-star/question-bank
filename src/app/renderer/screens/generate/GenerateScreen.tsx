import { Check } from 'lucide-react';
import type { ScreenProps } from '../../lib/index';
import { ErrorState, Spinner } from '../../components/index';
import { useReadySignal } from '../../hooks/index';
import { useGenerate } from './useGenerate';
import type { Step } from './useGenerate';
import { StepRules } from './StepRules';
import { StepOptions } from './StepOptions';
import { StepCheck } from './StepCheck';
import { StepResult } from './StepResult';
import { StepSave } from './StepSave';
import styles from './GenerateScreen.module.css';

const steps: { id: Step; label: string }[] = [
  { id: 1, label: '규칙 선택' },
  { id: 2, label: '옵션' },
  { id: 3, label: '사전 점검' },
  { id: 4, label: '결과 확인' },
  { id: 5, label: '저장' },
];

export function GenerateScreen({ query, notify }: ScreenProps) {
  const model = useGenerate({ ruleId: query.get('rule') ?? undefined, seed: query.get('seed') ?? undefined });
  useReadySignal('generate', !model.rules && !model.error, model.error);
  const reachable = (step: Step) =>
    step === 1 || (step <= 3 && !!model.ruleId) || (step >= 4 && !!model.session);
  return (
    <div className={styles.page}>
      <ol className={styles.steps} aria-label="시험 만들기 단계">
        {steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              className={step.id === model.step ? styles.current : step.id < model.step ? styles.done : ''}
              aria-current={step.id === model.step ? 'step' : undefined}
              disabled={!reachable(step.id) || !!model.busy}
              onClick={() => model.setStep(step.id)}
            >
              <span className={styles.badge}>
                {step.id < model.step ? <Check aria-hidden="true" /> : step.id}
              </span>
              {step.label}
            </button>
          </li>
        ))}
      </ol>
      {model.error && (
        <div className={styles.error} role="alert">
          <ErrorState message={model.error} retry={() => model.setError('')} />
        </div>
      )}
      <div className={styles.body} aria-busy={!!model.busy}>
        {!model.rules ? (
          <Spinner />
        ) : model.step === 1 ? (
          <StepRules model={model} />
        ) : model.step === 2 ? (
          <StepOptions model={model} />
        ) : model.step === 3 ? (
          <StepCheck model={model} />
        ) : model.step === 4 ? (
          <StepResult model={model} />
        ) : (
          <StepSave model={model} notify={notify} />
        )}
      </div>
      {model.busy && (
        <div className={styles.busy} role="status">
          <Spinner label={model.busy} />
        </div>
      )}
    </div>
  );
}
