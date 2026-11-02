import type { ImportOptions, Settings } from '../../../shared/index';
import styles from './ImportOptionsPanel.module.css';

export function ImportOptionsPanel({
  options,
  subjects,
  update,
  disabled,
}: {
  options: ImportOptions;
  subjects: Settings['subjects'];
  update: (value: ImportOptions) => void;
  disabled: boolean;
}) {
  const toggles = [
    { id: 'includeGrades', label: 'A 등급만', hint: 'A 등급으로 표시된 문제만 가져옵니다.' },
    {
      id: 'requireObjective',
      label: '학습목표 없는 문제 제외',
      hint: '출제 기준인 학습목표 코드가 있는 문제만 가져옵니다.',
    },
    {
      id: 'dedupeByPassage',
      label: '같은 지문은 첫 문제만',
      hint: '선지가 달라도 본문과 예문이 같으면 첫 문제만 남깁니다.',
    },
    {
      id: 'lockChoicesOnReference',
      label: '해설에 선지 번호가 있으면 선지 고정',
      hint: '본문·예문·해설의 번호 참조가 뒤바뀌지 않도록 고정합니다.',
    },
  ] as const;
  return (
    <fieldset className={styles.options} disabled={disabled}>
      <legend>가져오기 옵션</legend>
      <label className={styles.subject}>
        과목 (필수)
        <select
          required
          value={options.subject}
          onChange={(e) => update({ ...options, subject: e.target.value })}
        >
          <option value="">과목을 선택하세요</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {toggles.map((toggle) => (
        <label className={styles.option} key={toggle.id}>
          <input
            type="checkbox"
            checked={
              toggle.id === 'includeGrades' ? !!options.includeGrades?.length : options[toggle.id] !== false
            }
            onChange={(e) =>
              update({
                ...options,
                [toggle.id]:
                  toggle.id === 'includeGrades' ? (e.target.checked ? ['A'] : null) : e.target.checked,
              })
            }
          />
          <span>
            {toggle.label}
            <small>{toggle.hint}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
