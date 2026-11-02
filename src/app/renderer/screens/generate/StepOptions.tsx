import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button, Input } from '../../components/index';
import type { useGenerate } from './useGenerate';
import styles from './StepOptions.module.css';

export function StepOptions({ model }: { model: ReturnType<typeof useGenerate> }) {
  const { options, setOptions } = model;
  const shuffle = options.shuffle;
  const toggle = (key: 'shuffleQuestionOrder' | 'shuffleChoices' | 'balanceAnswerPositions') =>
    setOptions({ ...options, shuffle: { ...shuffle, [key]: !shuffle[key] } });
  return (
    <div className={styles.step}>
      <div className={styles.heading}>
        <h2>섞기와 출제 옵션</h2>
        <p>기본값 그대로 두면 문제와 선지를 모두 섞고, 정답 위치가 한쪽으로 쏠리지 않게 합니다.</p>
      </div>
      <div className={styles.form}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={shuffle.shuffleQuestionOrder}
            onChange={() => toggle('shuffleQuestionOrder')}
          />
          <span>
            <strong>문제 순서 섞기</strong>
            <small>회차마다 문제 순서를 무작위로 바꿉니다.</small>
          </span>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={shuffle.shuffleChoices} onChange={() => toggle('shuffleChoices')} />
          <span>
            <strong>선지 섞기</strong>
            <small>해설·본문이 선지 번호를 참조하는 문제와 고정 선지는 섞지 않습니다.</small>
          </span>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={shuffle.balanceAnswerPositions}
            disabled={!shuffle.shuffleChoices}
            onChange={() => toggle('balanceAnswerPositions')}
          />
          <span>
            <strong>정답 위치 고르게</strong>
            <small>①~⑤ 각 번호가 정답이 되는 비율을 최소 아래 값 이상으로 맞춥니다.</small>
          </span>
        </label>
        <div className={styles.row}>
          <Input
            label="정답 위치 최소 비율(%)"
            type="number"
            min={0}
            max={20}
            value={Math.round(shuffle.minAnswerPositionShare * 100)}
            disabled={!shuffle.balanceAnswerPositions || !shuffle.shuffleChoices}
            onChange={(event) =>
              setOptions({
                ...options,
                shuffle: {
                  ...shuffle,
                  minAnswerPositionShare: Math.min(20, Math.max(0, Number(event.target.value))) / 100,
                },
              })
            }
          />
          <Input
            label="최근 N회 출제 문제 제외 (0 = 제외 안 함)"
            type="number"
            min={0}
            max={100}
            value={options.excludeRecentExams}
            onChange={(event) =>
              setOptions({
                ...options,
                excludeRecentExams: Math.max(0, Math.floor(Number(event.target.value))),
              })
            }
          />
        </div>
        <div className={styles.row}>
          <Input
            label="다시 만들기 번호 (비우면 자동)"
            placeholder="예: 7F3A21C0"
            value={options.seed}
            maxLength={64}
            onChange={(event) => setOptions({ ...options, seed: event.target.value })}
          />
          <Input
            label="시험 제목 ({회차}는 회차 번호로 바뀝니다)"
            placeholder={`${model.rule?.name ?? '규칙 이름'} 모의고사 {회차}회`}
            value={options.titleTemplate}
            onChange={(event) => setOptions({ ...options, titleTemplate: event.target.value })}
          />
        </div>
        <p className={styles.hint}>
          같은 규칙·같은 문제은행에서 같은 '다시 만들기 번호'를 쓰면 똑같은 시험이 다시 만들어집니다.
        </p>
      </div>
      <div className={styles.actions}>
        <Button onClick={() => model.setStep(1)}>
          <ArrowLeft aria-hidden="true" />
          이전
        </Button>
        <Button variant="primary" onClick={() => model.setStep(3)}>
          다음: 사전 점검
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
