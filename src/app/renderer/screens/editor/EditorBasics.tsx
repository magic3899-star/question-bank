import { useState } from 'react';
import type { Question } from '../../../../contracts/index';
import { parseObjectiveCode } from '../../../../modules/objective-code/index';
import type { Settings } from '../../../shared/index';
import { useApi } from '../../hooks/index';
import { Button, Dialog, TreeNodes, ErrorState, Spinner } from '../../components/index';

export function EditorBasics({
  question: q,
  settings,
  change,
}: {
  question: Question;
  settings: Settings;
  change: (patch: Partial<Question>) => void;
}) {
  const [open, setOpen] = useState(false);
  const codes = useApi(() => window.qb.bank.objectiveCodes(q.subject), [q.subject]);
  const tree = useApi(() => window.qb.bank.objectiveTree(q.subject), [q.subject]);
  return (
    <section>
      <h3>기본 정보</h3>
      <label>
        과목
        <select value={q.subject} onChange={(e) => change({ subject: e.target.value, objectiveCode: '' })}>
          {!settings.subjects.some((s) => s.id === q.subject) && (
            <option value={q.subject}>{q.subject}</option>
          )}
          {settings.subjects.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        학습목표 코드
        <input
          id="editor-objective"
          list="editor-objectives"
          value={q.objectiveCode ?? ''}
          onChange={(e) => change({ objectiveCode: e.target.value })}
        />
      </label>
      <datalist id="editor-objectives">
        {codes.value?.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>
      <Button onClick={() => setOpen(true)}>목록에서 고르기</Button>
      {!q.objectiveCode?.trim() ? (
        <p>학습목표가 없으면 출제 대상에서 빠집니다.</p>
      ) : (
        !parseObjectiveCode(q.objectiveCode) && (
          <p role="alert">과목명과 숫자 구간으로 입력하세요. 예: 법규 1-1-3</p>
        )
      )}
      {codes.error && <ErrorState message={codes.error} retry={codes.retry} />}
      <label>
        등급
        <select value={q.grade ?? ''} onChange={(e) => change({ grade: e.target.value || undefined })}>
          <option value="">없음</option>
          <option>A</option>
          <option>B</option>
        </select>
      </label>
      {open && (
        <Dialog title="학습목표 목록" close={() => setOpen(false)}>
          {tree.loading ? (
            <Spinner />
          ) : tree.error ? (
            <ErrorState message={tree.error} retry={tree.retry} />
          ) : !tree.value?.length ? (
            <p>이 과목에 등록된 학습목표가 없습니다. 코드를 직접 입력하세요.</p>
          ) : (
            <TreeNodes
              nodes={tree.value}
              selected={q.objectiveCode ?? ''}
              select={(code) => {
                change({ objectiveCode: code });
                setOpen(false);
              }}
            />
          )}
        </Dialog>
      )}
    </section>
  );
}
