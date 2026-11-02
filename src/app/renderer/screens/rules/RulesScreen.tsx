import { useEffect, useState } from 'react';
import { BookOpen, Copy, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { RuleSet } from '../../../../contracts/index';
import type { RuleCheck, RuleSummary } from '../../../shared/index';
import type { ScreenProps } from '../../lib/index';
import { Badge, Button, Dialog, ErrorState, SlotBars, Spinner } from '../../components/index';
import { useReadySignal } from '../../hooks/index';
import { setNavigationGuard, unwrap } from '../../lib/index';
import { RuleEditor } from './RuleEditor';
import styles from './RulesScreen.module.css';

export function RulesScreen({ settings, notify }: ScreenProps) {
  const [list, setList] = useState<RuleSummary[]>();
  const [selectedId, setSelectedId] = useState('');
  const [saved, setSaved] = useState<RuleSet>();
  const [draft, setDraft] = useState<RuleSet>();
  const [check, setCheck] = useState<RuleCheck>();
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingSelect, setPendingSelect] = useState<string>();
  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);
  useReadySignal('rules', !list || (!!selectedId && !draft), error);
  const reload = async (select?: string) => {
    const rules = await unwrap(window.qb.rules.list());
    setList(rules);
    setSelectedId(select ?? (selectedId || rules[0]?.id || ''));
  };
  useEffect(() => {
    void reload().catch((cause: Error) => setError(cause.message));
    // 처음 한 번만 목록을 읽는다.
  }, []);
  useEffect(() => {
    if (!selectedId) return;
    void unwrap(window.qb.rules.get(selectedId))
      .then((rules) => {
        setSaved(rules);
        setDraft(structuredClone(rules));
      })
      .catch((cause: Error) => setError(cause.message));
  }, [selectedId]);
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => {
      void unwrap(window.qb.rules.check(draft))
        .then(setCheck)
        .catch(() => setCheck(undefined));
    }, 300);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    setNavigationGuard(dirty);
    return () => setNavigationGuard(false);
  }, [dirty]);
  if (error) return <ErrorState message={error} retry={() => setError('')} />;
  if (!list) return <Spinner />;
  const errors = check?.diagnostics.filter((item) => item.severity === 'error') ?? [];
  const current = list.find((item) => item.id === selectedId);
  const act = (label: string, action: () => Promise<void>) =>
    void action()
      .then(() => notify(label))
      .catch((cause: Error) => notify(cause.message));
  return (
    <div className={styles.page}>
      <aside className={styles.list} aria-label="출제 규칙 목록">
        <ul>
          {list.map((rule) => (
            <li key={rule.id}>
              <button
                type="button"
                className={rule.id === selectedId ? styles.selected : ''}
                onClick={() => (dirty ? setPendingSelect(rule.id) : setSelectedId(rule.id))}
              >
                <span className={styles.name}>
                  <BookOpen aria-hidden="true" />
                  {rule.name}
                </span>
                <span className={styles.meta}>
                  {rule.subjectName} · {rule.examCount}회 × {rule.questionsPerExam}문제
                  {rule.isPreset ? ' · 기본 제공' : ''}
                </span>
                {rule.needsConfirmation && <Badge kind="confirmation">확인 필요</Badge>}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className={styles.editor} aria-label="규칙 편집">
        {!draft ? (
          <Spinner />
        ) : (
          <>
            <div className={styles.toolbar}>
              <h2>{draft.name}</h2>
              <Button
                variant="primary"
                disabledReason={
                  !dirty ? '바뀐 내용이 없습니다.' : errors.length ? '오류를 먼저 고치세요.' : undefined
                }
                onClick={() =>
                  act('출제 규칙을 저장했습니다.', async () => {
                    const next = await unwrap(window.qb.rules.save(draft));
                    setSaved(next);
                    setDraft(structuredClone(next));
                    await reload(next.id);
                  })
                }
              >
                <Save aria-hidden="true" />
                저장
              </Button>
              <Button
                onClick={() =>
                  act('복사본을 만들었습니다.', async () => {
                    const copy = await unwrap(window.qb.rules.duplicate(draft.id));
                    await reload(copy.id);
                  })
                }
              >
                <Copy aria-hidden="true" />
                복제
              </Button>
              {current?.isPreset && (
                <Button
                  onClick={() =>
                    act('기본값으로 되돌렸습니다.', async () => {
                      const preset = await unwrap(window.qb.rules.reset(draft.id));
                      setSaved(preset);
                      setDraft(structuredClone(preset));
                      await reload(preset.id);
                    })
                  }
                >
                  <RotateCcw aria-hidden="true" />
                  기본값
                </Button>
              )}
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden="true" />
                삭제
              </Button>
            </div>
            <div className={styles.columns}>
              <RuleEditor draft={draft} setDraft={setDraft} subjects={settings.subjects} saved={saved!} />
              <aside className={styles.check} aria-label="사전 점검">
                <h3>사전 점검</h3>
                {!check ? (
                  <Spinner label="점검 중입니다" />
                ) : (
                  <>
                    <p className={styles.meta}>후보 문제 {check.candidates}개</p>
                    <SlotBars slots={check.slots} examCount={draft.examCount} />
                    <ul className={styles.diagnostics}>
                      {check.diagnostics
                        .filter((item) => item.severity !== 'info' || item.code === 'UNCONFIRMED_RULE')
                        .map((item, index) => (
                          <li key={`${item.code}-${index}`}>
                            <Badge kind={item.severity === 'error' ? 'error' : 'warning'}>
                              {item.severity === 'error' ? '오류' : '알림'}
                            </Badge>
                            {item.message}
                          </li>
                        ))}
                    </ul>
                    <ul className={styles.description}>
                      {check.description.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </>
                )}
              </aside>
            </div>
          </>
        )}
      </section>
      {pendingSelect && (
        <Dialog title="저장하지 않은 변경" close={() => setPendingSelect(undefined)}>
          <p>지금 규칙의 바뀐 내용을 저장하지 않았습니다. 버리고 다른 규칙을 열까요?</p>
          <div className={styles.dialogActions}>
            <Button onClick={() => setPendingSelect(undefined)}>계속 편집</Button>
            <Button
              variant="danger"
              onClick={() => {
                setSelectedId(pendingSelect);
                setPendingSelect(undefined);
              }}
            >
              변경 버리기
            </Button>
          </div>
        </Dialog>
      )}
      {confirmDelete && draft && (
        <Dialog title="출제 규칙 삭제" close={() => setConfirmDelete(false)}>
          <p>'{draft.name}' 규칙을 지웁니다. 이미 만든 시험과 출제 이력은 그대로 남습니다.</p>
          <div className={styles.dialogActions}>
            <Button onClick={() => setConfirmDelete(false)}>취소</Button>
            <Button
              variant="danger"
              onClick={() =>
                act('출제 규칙을 지웠습니다.', async () => {
                  await unwrap(window.qb.rules.delete(draft.id));
                  setConfirmDelete(false);
                  setDraft(undefined);
                  setSaved(undefined);
                  setSelectedId('');
                  await reload('');
                })
              }
            >
              삭제
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
