import type { ImportItem, ImportPatch } from '../../../shared/index';
import { parseObjectiveCode } from '../../../../modules/objective-code/index';
import { Input, Select } from '../../components/index';
import styles from './ImportItemEditor.module.css';

export function ImportItemEditor({
  item,
  update,
  disabled,
}: {
  item: ImportItem;
  update: (patch: Omit<ImportPatch, 'index'>) => void;
  disabled: boolean;
}) {
  const invalid = !!item.draft.objectiveCode?.trim() && !parseObjectiveCode(item.draft.objectiveCode);
  return (
    <fieldset className={styles.editor} disabled={disabled}>
      <legend>진단과 즉석 수정</legend>
      <Input
        label="학습목표"
        value={item.draft.objectiveCode ?? ''}
        placeholder="예: 법규 1-1-3"
        error={invalid ? '과목명과 숫자 구간으로 입력하세요. 예: 법규 1-1-3' : undefined}
        onChange={(e) => update({ objectiveCode: e.target.value })}
      />
      <Select label="등급" value={item.draft.grade ?? ''} onChange={(e) => update({ grade: e.target.value })}>
        <option value="">등급 없음</option>
        {[...new Set(['A', 'B', ...(item.draft.grade ? [item.draft.grade] : [])])].map((g) => (
          <option key={g}>{g}</option>
        ))}
      </Select>
      <label>
        <input
          type="checkbox"
          checked={item.draft.shufflePolicy === 'lock-all'}
          onChange={(e) => update({ shufflePolicy: e.target.checked ? 'lock-all' : 'free' })}
        />
        선지 순서 고정
      </label>
      <label>
        <input
          type="checkbox"
          checked={item.status !== 'excluded'}
          onChange={(e) => update({ include: e.target.checked })}
        />
        이 문제 포함
      </label>
      {item.diagnostics.length ? (
        <ul>
          {item.diagnostics.map((d, i) => (
            <li key={`${d.code}-${i}`}>
              <strong>{d.severity === 'error' ? '오류' : d.severity === 'warn' ? '경고' : '안내'}</strong> ·{' '}
              {d.message}
            </li>
          ))}
        </ul>
      ) : (
        <p>진단이 없습니다. 내용을 확인한 뒤 저장하세요.</p>
      )}
    </fieldset>
  );
}
