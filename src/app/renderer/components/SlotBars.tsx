import type { SlotCheck } from '../../shared/index';
import styles from './SlotBars.module.css';

/** 슬롯별 필요 수 대비 후보 수 막대. 빈 번호가 예상되면 경고 색으로 표시한다. */
export function SlotBars({ slots, examCount }: { slots: SlotCheck[]; examCount: number }) {
  return (
    <ul className={styles.bars}>
      {slots.map((slot) => {
        const ratio = slot.required ? Math.min(1, slot.available / slot.required) : 1;
        const short = slot.expectedBlanksPerExam > 0;
        return (
          <li key={slot.slotId}>
            <div className={styles.head}>
              <strong>{slot.label}</strong>
              <span>
                회차당 {slot.perExam}문제 · 필요 {slot.required} · 후보 {slot.available}
                {slot.distinctSegments !== undefined && ` · 중단원 ${slot.distinctSegments}개`}
              </span>
            </div>
            <div
              className={styles.track}
              role="meter"
              aria-label={`${slot.label} 후보 충족률`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(ratio * 100)}
            >
              <span className={short ? styles.short : styles.ok} style={{ width: `${ratio * 100}%` }} />
            </div>
            {short && (
              <p className={styles.note}>
                회차마다 빈 번호 {slot.expectedBlanksPerExam}개가 예상됩니다
                {examCount > 1 ? ` (전체 ${slot.expectedBlanksPerExam * examCount}개)` : ''}.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
