import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import type { ImportReview } from '../../../shared/index';
import { WORKBOOK_SUBJECT } from '../../../shared/index';
import type { ScreenProps } from '../../lib/index';
import { unwrap } from '../../lib/index';
import { Button, Dialog, ErrorState, Spinner } from '../../components/index';
import { useReadySignal } from '../../hooks/index';
import { ImportOptionsPanel } from './ImportOptionsPanel';
import { ImportReviewTable } from './ImportReviewTable';
import { ImportSavedToast } from './ImportSavedToast';
import { useImport } from './useImport';
import styles from './ImportScreen.module.css';

export function ImportScreen({ settings, query, refreshSettings }: ScreenProps) {
  const model = useImport();
  const [confirm, setConfirm] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const initialized = useRef(false);
  const capture = query.get('captureReview') === '1';
  useEffect(() => {
    if (model.saved?.result.newSubjects?.length)
      void refreshSettings?.().catch((cause: Error) => model.setError(cause.message));
  }, [model.saved, refreshSettings, model.setError]);
  useEffect(() => {
    if (initialized.current || !capture) return;
    initialized.current = true;
    try {
      const stored = sessionStorage.getItem('qb-capture-import-review');
      if (!stored)
        throw new Error('캡처용 가져오기 분석 결과가 없습니다. 파일과 과목 환경변수를 확인하세요.');
      model.acceptCapture(JSON.parse(stored) as ImportReview);
    } catch (cause) {
      model.setError((cause as Error).message);
    }
  }, [capture, model]);
  const review = model.review;
  useReadySignal(
    'import',
    model.busy || (capture && !model.error && (!review || (!!review.items.length && !previewReady))),
    model.error,
  );
  const readyCount = review ? review.counts.ok + review.counts.warn : 0;
  const pick = () => {
    void unwrap(window.qb.import.pickFiles())
      .then(model.analyze)
      .catch((cause: Error) => model.setError(cause.message));
  };
  return (
    <div className={styles.page}>
      {model.error && <ErrorState message={model.error} retry={() => model.setError('')} />}
      {model.busy ? (
        <div className={styles.loading} role="status">
          <Spinner />
          <h2>{review ? '문제를 저장하고 있습니다' : '문서를 분석하고 있습니다'}</h2>
          <p>문서 해석 → 검증 → 은행과 중복 검사</p>
          {model.progress && (
            <p>
              {model.progress.file}: {model.progress.label} {model.progress.done}/{model.progress.total}
              {model.progress.label === '글자 읽는 중' ? '파일' : '쪽'}
            </p>
          )}
          <ul>
            {model.files.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
        </div>
      ) : review ? (
        <>
          <div className={styles.files}>
            {review.files.map((file, i) => (
              <span key={i}>
                {file.name} · {file.questions}문제 · 가져오기 전 제외 {file.skipped}
              </span>
            ))}
          </div>
          {review.diagnostics.length > 0 && (
            <details className={styles.diagnostics}>
              <summary>문서 전체 진단 {review.diagnostics.length}건</summary>
              <ul>
                {review.diagnostics.map((d, i) => (
                  <li key={i}>{d.message}</li>
                ))}
              </ul>
            </details>
          )}
          <ImportReviewTable
            review={review}
            update={model.update}
            disabled={model.busy}
            capture={capture}
            onPreviewReady={() => setPreviewReady(true)}
          />
          <div className={styles.actions}>
            <span>↑↓ 행 이동 · Enter 펼치기 · Space 포함/제외</span>
            <Button
              onClick={() => {
                void model.discard();
              }}
            >
              취소
            </Button>
            <Button
              variant="primary"
              disabledReason={!readyCount ? '오류를 수정하거나 저장할 문제를 포함하세요.' : undefined}
              onClick={() => setConfirm(true)}
            >
              {readyCount}개 저장
            </Button>
          </div>
        </>
      ) : (
        <div className={styles.initial}>
          <div
            className={styles.drop}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!model.options.subject) {
                model.setError('가져올 과목을 먼저 선택하세요.');
                return;
              }
              try {
                void model.analyze(window.qb.import.pathsForFiles(Array.from(event.dataTransfer.files)));
              } catch {
                model.setError('파일 경로를 읽을 수 없습니다. 파일 선택 버튼으로 다시 선택하세요.');
              }
            }}
          >
            <Upload aria-hidden="true" />
            <h2>
              {model.options.subject === WORKBOOK_SUBJECT
                ? '문제집 PDF 와 정답집 PDF 를 한꺼번에 놓으세요'
                : '문서 파일을 여기에 놓으세요'}
            </h2>
            <p>Word(.docx) · PDF · 한글(.hwpx) · 텍스트(.txt) · 이미지 등 · 여러 파일 · 파일당 50MB 이하</p>
            <p>
              Word(.docx)가 가장 정확합니다. PDF·한글·텍스트는 글자만 읽어 밑줄·표·그림은 가져오지 않고,
              스캔본 PDF와 이미지는 글자 인식(OCR)으로 읽어 오류가 있을 수 있습니다.
            </p>
            <Button
              variant="primary"
              disabledReason={!model.options.subject ? '가져올 과목을 먼저 선택하세요.' : undefined}
              onClick={pick}
            >
              파일 선택
            </Button>
            <p>분석 후 원문 미리보기와 진단을 확인하고 저장할 수 있습니다.</p>
          </div>
          <ImportOptionsPanel
            options={model.options}
            subjects={settings.subjects}
            update={model.setOptions}
            disabled={model.busy}
          />
        </div>
      )}
      {confirm && review && (
        <Dialog title="문제를 가져올까요?" close={() => setConfirm(false)}>
          <p>
            {readyCount}개 저장 · 제외 {review.counts.excluded}개 · 오류로 저장 안 되는 문제{' '}
            {review.counts.error}개
          </p>
          <p>경고가 있는 문제도 저장됩니다. 저장 후 10초 동안 실행 취소할 수 있습니다.</p>
          <Button
            variant="primary"
            onClick={() => {
              setConfirm(false);
              void model.commit();
            }}
          >
            저장 확정
          </Button>
        </Dialog>
      )}
      {model.saved && (
        <>
          {model.saved.result.notSaved.length > 0 && (
            <details className={styles.diagnostics}>
              <summary>저장하지 않은 문제와 사유</summary>
              <ul>
                {model.saved.result.notSaved.map((item) => (
                  <li key={item.index}>
                    {item.index + 1}번째 문제: {item.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <ImportSavedToast
            key={model.saved.batchId}
            result={model.saved.result}
            batchId={model.saved.batchId}
            close={() => model.setSaved(undefined)}
            fail={model.setError}
          />
        </>
      )}
    </div>
  );
}
