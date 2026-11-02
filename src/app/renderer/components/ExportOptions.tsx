import type { ExamSnapshot, ExportPart } from '../../../contracts/index';
import type { ExportFormat } from '../../shared/index';
import styles from './ExportOptions.module.css';

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
    </div>
  );
}
