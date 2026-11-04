import type { ExamSnapshot, ExportPart } from '../../../contracts/index';
import type { ExportFormat } from '../../shared/index';
import styles from './ExportOptions.module.css';
import { Input } from './Input';
import type { useExamHeader } from './useExamHeader';

const formatItems: { id: ExportFormat; label: string }[] = [
  { id: 'pdf', label: 'PDF' },
  { id: 'docx', label: 'Word (.docx)' },
  { id: 'xlsx', label: 'Excel (.xlsx)' },
];
const partItems: { id: ExportPart; label: string }[] = [
  { id: 'questions', label: '문제지' },
  { id: 'answers', label: '정답지' },
  { id: 'explanations', label: '해설지' },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** 저장 형식·문서·회차 선택. 시험 만들기와 출제 이력의 다시 저장에서 함께 쓴다. */
export function ExportOptions(props: {
  snapshots: ExamSnapshot[];
  formats: ExportFormat[];
  setFormats: (value: ExportFormat[]) => void;
  parts: ExportPart[];
  setParts: (value: ExportPart[]) => void;
  combine: boolean;
  setCombine: (value: boolean) => void;
  exams: number[];
  setExams: (value: number[]) => void;
  examHeader: ReturnType<typeof useExamHeader>;
}) {
  return (
    <div className={styles.exportGrid}>
      <fieldset>
        <legend>저장 형식</legend>
        {formatItems.map((item) => (
          <label key={item.id} className={styles.inline}>
            <input
              type="checkbox"
              checked={props.formats.includes(item.id)}
              onChange={() => props.setFormats(toggle(props.formats, item.id))}
            />
            {item.label}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>문서</legend>
        {partItems.map((item) => (
          <label key={item.id} className={styles.inline}>
            <input
              type="checkbox"
              checked={props.parts.includes(item.id)}
              onChange={() => props.setParts(toggle(props.parts, item.id))}
            />
            {item.label}
          </label>
        ))}
        <label className={styles.inline}>
          <input type="checkbox" checked={props.combine} onChange={() => props.setCombine(!props.combine)} />
          문제·정답·해설을 한 파일로 합치기
        </label>
      </fieldset>
      <fieldset>
        <legend>회차</legend>
        {props.snapshots.map((snapshot, index) => (
          <label key={snapshot.examId} className={styles.inline}>
            <input
              type="checkbox"
              checked={props.exams.includes(index)}
              onChange={() => props.setExams(toggle(props.exams, index).sort((a, b) => a - b))}
            />
            {snapshot.title}
          </label>
        ))}
      </fieldset>
      <fieldset className={styles.header}>
        <legend>시험지 머리</legend>
        <label className={styles.inline}>
          <input
            type="checkbox"
            checked={props.examHeader.form.enabled}
            onChange={(event) => props.examHeader.setField('enabled', event.target.checked)}
          />
          시험지 머리 정보 넣기
        </label>
        {props.examHeader.form.enabled && (
          <>
            <p className={styles.hint}>문제지에만 표시합니다. 교시·시간·배점은 비워 둘 수 있습니다.</p>
            <div className={styles.headerInputs}>
              <Input
                label="교시"
                placeholder="예: 1교시"
                maxLength={30}
                value={props.examHeader.form.period}
                onChange={(event) => props.examHeader.setField('period', event.target.value)}
                error={props.examHeader.errors.period}
              />
              <Input
                label="시험 시간(분)"
                type="number"
                min={1}
                max={600}
                step={1}
                value={props.examHeader.form.durationMinutes}
                onChange={(event) => props.examHeader.setField('durationMinutes', event.target.value)}
                error={props.examHeader.errors.durationMinutes}
              />
              <Input
                label="문항당 배점"
                type="number"
                min={0}
                max={100}
                step="any"
                value={props.examHeader.form.pointsPerQuestion}
                onChange={(event) => props.examHeader.setField('pointsPerQuestion', event.target.value)}
                error={props.examHeader.errors.pointsPerQuestion}
              />
            </div>
            <label className={styles.inline}>
              <input
                type="checkbox"
                checked={props.examHeader.form.candidateFields}
                onChange={(event) => props.examHeader.setField('candidateFields', event.target.checked)}
              />
              성명·수험번호 칸 넣기
            </label>
          </>
        )}
      </fieldset>
    </div>
  );
}
