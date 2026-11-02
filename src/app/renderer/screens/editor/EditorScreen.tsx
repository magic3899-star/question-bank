import { useState } from 'react';
import type { QuestionDetail } from '../../../shared/index';
import type { ScreenProps } from '../../lib/index';
import { navigate } from '../../lib/index';
import { useReadySignal } from '../../hooks/index';
import {
  BlockListEditor,
  Button,
  Dialog,
  ErrorState,
  PreviewFrame,
  RichTextField,
  Spinner,
  Toast,
} from '../../components/index';
import { usePasteJoin } from './usePasteJoin';
import { useEditor } from './useEditor';
import { EditorBasics } from './EditorBasics';
import { EditorChoices } from './EditorChoices';
import { EditorPastePanel } from './EditorPastePanel';
import { DuplicatePreview } from './DuplicatePreview';
import styles from './EditorScreen.module.css';

export function EditorScreen({ route, settings, query }: ScreenProps) {
  const join = usePasteJoin(settings.pasteJoin);
  const editor = useEditor(settings.subjects[0]?.id ?? '', query, route.id === 'edit');
  const { question: q } = editor;
  const [closedToast, setClosedToast] = useState<unknown>();
  const [pastePrimary, setPastePrimary] = useState(false);
  const capture = query.has('capturePaste');
  useReadySignal(
    route.id,
    editor.loading ||
      editor.busy ||
      join.loading ||
      editor.painted !== editor.detail ||
      (!editor.error && (!editor.checked || (capture && !editor.batch))),
    editor.error,
  );
  if (editor.loading) return <Spinner />;
  const blocked = !editor.checked
    ? '검사 중입니다.'
    : editor.diagnostics.find((d) => d.severity === 'error')?.message;
  const addAsset = (asset: QuestionDetail['assets'][string]) =>
    editor.setAssets((prev) => ({ ...prev, [asset.id]: asset }));
  return (
    <div className={styles.editor}>
      <div className={styles.form} inert={editor.busy}>
        {join.error && <p role="alert">{join.error}</p>}
        {editor.error && <ErrorState message={editor.error} retry={() => editor.setError('')} />}
        <EditorPastePanel
          edit={route.id === 'edit'}
          join={join.value}
          joinLoading={join.loading}
          changeJoin={join.change}
          onPrimaryChange={setPastePrimary}
          {...editor}
          error={editor.setError}
          capture={capture}
          update={editor.applyBatch}
        />
        <EditorBasics question={q} settings={settings} change={editor.change} />
        <RichTextField
          id="editor-stem"
          label="문제 줄"
          value={q.stem}
          onChange={(stem) => editor.change({ stem })}
        />
        <BlockListEditor
          label="예문 (선택)"
          value={q.passage ?? []}
          onChange={(passage) => editor.change({ passage })}
          onAsset={addAsset}
        />
        <EditorChoices question={q} change={editor.change} />
        <BlockListEditor
          id="editor-explanation"
          label="해설"
          value={q.explanation}
          onChange={(explanation) => editor.change({ explanation })}
          onAsset={addAsset}
        />
        <div className={styles.actions}>
          <Button
            variant={pastePrimary ? 'secondary' : 'primary'}
            disabledReason={blocked}
            disabled={editor.busy || !!blocked}
            onClick={() => {
              editor.setAdvanceAfterSave(false);
              void editor.save();
            }}
          >
            저장
          </Button>
          {editor.batch && editor.position < editor.batch.questions.length && (
            <>
              <Button
                disabledReason={blocked}
                disabled={editor.busy || !!blocked}
                onClick={() => {
                  editor.setAdvanceAfterSave(true);
                  void editor.save();
                }}
              >
                저장하고 다음
              </Button>
              <Button disabled={editor.busy} onClick={() => editor.next('건너뜀')}>
                건너뛰기
              </Button>
            </>
          )}
          {editor.saved && (
            <>
              {(!editor.batch ||
                editor.batch.questions.every(
                  (question, index) => question.id || editor.statuses[index] === '건너뜀',
                )) && <Button onClick={editor.continueAdd}>계속 추가</Button>}
              <Button
                onClick={() =>
                  navigate(
                    `bank?${editor.batch ? `batch=${encodeURIComponent(editor.batch.batchId)}` : `subject=${encodeURIComponent(q.subject)}`}`,
                  )
                }
              >
                문제은행에서 보기
              </Button>
            </>
          )}
        </div>
      </div>
      <aside className={styles.preview} aria-label="실시간 미리보기와 검사 결과">
        <h2>실시간 미리보기</h2>
        <div className={styles.paper}>
          <PreviewFrame detail={editor.detail} onReady={editor.setPainted} />
        </div>
        <section aria-label="검사 결과" aria-live="polite">
          <h3>검사 결과 {editor.checked ? '' : '· 검사 중…'}</h3>
          {!editor.diagnostics.length && editor.checked && <p>오류가 없습니다.</p>}
          <ul>
            {editor.diagnostics.map((d, i) => (
              <li key={i} className={styles[d.severity]}>
                <button
                  onClick={() => {
                    const id = d.code.includes('OBJECTIVE')
                      ? 'editor-objective'
                      : d.code.includes('STEM')
                        ? 'editor-stem'
                        : d.code.includes('EXPLANATION')
                          ? 'editor-explanation'
                          : 'editor-choices';
                    if (id) document.getElementById(id)?.focus();
                  }}
                >
                  {d.severity === 'error' ? '오류' : d.severity === 'warn' ? '경고' : '정보'} · {d.message}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </aside>
      {editor.overwrite && (
        <Dialog title="입력 내용을 바꿀까요?" close={() => editor.setOverwrite(undefined)}>
          <p>현재 입력 내용을 해석한 문제로 덮어씁니다.</p>
          <Button onClick={() => editor.acceptParse(editor.overwrite!)}>덮어쓰기</Button>
        </Dialog>
      )}
      {editor.warning && (
        <Dialog title="경고를 확인하세요" close={() => editor.setWarning(false)}>
          <ul>
            {editor.diagnostics
              .filter((d) => d.severity === 'warn')
              .map((d, i) => (
                <li key={i}>{d.message}</li>
              ))}
          </ul>
          <Button onClick={() => void editor.save(false, true)}>경고를 확인하고 저장</Button>
        </Dialog>
      )}
      {editor.duplicates && (
        <Dialog title="같은 지문의 문제가 이미 있습니다" close={() => editor.setDuplicates(undefined)}>
          <p>같은 지문의 문제가 이미 있습니다 — 출제에서는 첫 문제만 쓰입니다.</p>
          <DuplicatePreview id={editor.duplicates[0]!.id} />
          <Button onClick={() => void editor.save(true, true)}>그래도 저장</Button>
          <Button onClick={() => editor.setDuplicates(undefined)}>취소</Button>
        </Dialog>
      )}
      {editor.receipt && closedToast !== editor.receipt && (
        <Toast
          message="문제를 저장했습니다."
          undo={() => void editor.undo()}
          close={() => setClosedToast(editor.receipt)}
        />
      )}
    </div>
  );
}
