import { WORKBOOK_SUBJECT } from '../../../shared/index';
import { visibleImportToggles } from './import-options';
import type { ImportOptions, Settings } from '../../../shared/index';
import { Select } from '../../components/index';
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
  const toggles = visibleImportToggles(options.subject);
  return (
    <fieldset className={styles.options} disabled={disabled}>
      <legend>가져오기 옵션</legend>
      <Select
        label="과목 (필수)"
        required
        value={options.subject}
        onChange={(e) => update({ ...options, subject: e.target.value })}
      >
        <option value={WORKBOOK_SUBJECT}>문제집 + 정답집 (과목 자동)</option>
        <option value="">과목을 선택하세요</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      {options.subject === WORKBOOK_SUBJECT && (
        <p className={styles.hint}>
          문제집 PDF 와 정답집 PDF 를 함께 고르세요. 과목은 PART 제목으로, 정답·해설·학습목표는 정답집에서
          읽습니다.
        </p>
      )}
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
