import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetData, Diagnostic, Question } from '../../../../contracts/index';
import type { EditorParseResult, QuestionDetail, SaveResult } from '../../../shared/index';
import { autoPolicy, newQuestion } from '../../lib/editor/index';
import { isEmptyBlocks } from '../../../../modules/content-model/index';
import { unwrap } from '../../lib/index';
import { useUnsaved } from '../../hooks/index';

export function useEditor(subject: string, query: URLSearchParams, edit: boolean) {
  const [question, setQuestion] = useState(() => newQuestion(subject));
  const [baseline, setBaseline] = useState(() => JSON.stringify(question));
  const [assets, setAssets] = useState<Record<string, AssetData>>({});
  const [loading, setLoading] = useState(edit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [checked, setChecked] = useState('');
  const [batch, setBatch] = useState<EditorParseResult>();
  const [position, setPosition] = useState(0);
  const [statuses, setStatuses] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<Extract<SaveResult, { saved: true }>>();
  const [receipt, setReceipt] = useState<Extract<SaveResult, { saved: true }>>();
  const [painted, setPainted] = useState<QuestionDetail>();
  const [overwrite, setOverwrite] = useState<EditorParseResult>();
  const [warning, setWarning] = useState(false);
  const [duplicates, setDuplicates] = useState<Question[]>();
  const advanceAfterSave = useRef(false);
  const setAdvanceAfterSave = (value: boolean) => {
    advanceAfterSave.current = value;
  };
  const version = JSON.stringify(question);
  const dirty = version !== baseline || !!batch?.questions.some((q, i) => !q.id && statuses[i] !== '건너뜀');
  useUnsaved(dirty);
  const detail = useMemo(() => ({ question, assets }), [question, assets]);
  const current = useRef(question);
  current.current = question;
  const loadQuestion = useCallback((q: Question) => {
    const next = autoPolicy(q);
    setQuestion(next);
    setBaseline(JSON.stringify(next));
    setError('');
    setChecked('');
  }, []);
  useEffect(() => {
    if (!edit) return;
    let active = true;
    void (async () => {
      try {
        let id = query.get('id');
        if (!id && query.has('capture'))
          id = (await unwrap(window.qb.bank.list({ offset: 0, limit: 1 }))).items[0]?.id ?? null;
        if (!id) throw new Error('편집할 문제가 없습니다. 문제은행에서 문제를 선택하세요.');
        const d = await unwrap(window.qb.bank.get(id));
        if (active) {
          loadQuestion(d.question);
          setAssets(d.assets);
        }
      } catch (cause) {
        if (active) setError((cause as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [edit, query, loadQuestion]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void unwrap(window.qb.bank.validate(question))
        .then((result) => {
          if (active) {
            setDiagnostics(result);
            setChecked(version);
          }
        })
        .catch((cause: Error) => {
          if (active) {
            setError(cause.message);
            setChecked('');
          }
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [question, version]);
  const change = (patch: Partial<Question>) => {
    setQuestion((q) => autoPolicy({ ...q, ...patch }));
    setSaved(undefined);
  };
  const acceptParse = (parsed: EditorParseResult) => {
    if (!parsed.questions.length) {
      setError('문제를 나누지 못했습니다. 문제 번호와 ① 형식의 선지를 확인하세요.');
      return;
    }
    setBatch(parsed);
    setPosition(0);
    setStatuses({});
    setAssets({});
    setSaved(undefined);
    const q = autoPolicy(parsed.questions[0]!);
    setQuestion(q);
    setBaseline('');
    setOverwrite(undefined);
  };
  const parseRevision = useRef(0);
  const parse = async (
    text: string,
    replaceCurrent = false,
    joinWrappedLinesWith: 'space' | 'none' = 'space',
  ) => {
    const revision = ++parseRevision.current;
    setBusy(true);
    setError('');
    try {
      const parsed = await unwrap(
        window.qb.editor.parseText({ text, subject: current.current.subject, joinWrappedLinesWith }),
      );
      if (revision !== parseRevision.current) return;
      const previous = current.current;
      if (edit && previous.id && parsed.questions.length === 1)
        parsed.questions[0] = {
          ...parsed.questions[0]!,
          id: previous.id,
          createdAt: previous.createdAt,
          updatedAt: previous.updatedAt,
          extra: { ...previous.extra, ...parsed.questions[0]!.extra },
        };
      const hasContent =
        !!previous.id ||
        !isEmptyBlocks([
          ...previous.stem,
          ...(previous.passage ?? []),
          ...previous.explanation,
          ...previous.choices.flatMap((choice) => choice.content),
        ]);
      if ((dirty || hasContent) && !replaceCurrent) setOverwrite(parsed);
      else acceptParse(parsed);
    } catch (cause) {
      if (revision === parseRevision.current) setError((cause as Error).message);
    } finally {
      if (revision === parseRevision.current) setBusy(false);
    }
  };
  const next = (status: string) => {
    if (!batch) return;
    setStatuses((s) => ({ ...s, [position]: status }));
    if (position + 1 < batch.questions.length) {
      setPosition(position + 1);
      loadQuestion(batch.questions[position + 1]!);
      setBaseline('');
    } else {
      loadQuestion(newQuestion(question.subject, question));
      setPosition(batch.questions.length);
    }
    setSaved(undefined);
  };
  const save = async (force = false, confirmed = false) => {
    if (checked !== version || diagnostics.some((d) => d.severity === 'error')) return;
    if (!confirmed && diagnostics.some((d) => d.severity === 'warn')) {
      setWarning(true);
      return;
    }
    setWarning(false);
    setBusy(true);
    setError('');
    try {
      const result = await unwrap(window.qb.bank.save({ question, assets: Object.values(assets), force }));
      if (!result.saved) {
        setDuplicates(result.duplicates);
        return;
      }
      setDuplicates(undefined);
      loadQuestion(result.question);
      setSaved(result);
      setReceipt(result);
      if (batch)
        setBatch((b) =>
          b ? { ...b, questions: b.questions.map((q, i) => (i === position ? result.question : q)) } : b,
        );
      setStatuses((s) => ({ ...s, [position]: '저장됨' }));
      if (advanceAfterSave.current) {
        setAdvanceAfterSave(false);
        if (batch && position + 1 < batch.questions.length) {
          setPosition(position + 1);
          loadQuestion(batch.questions[position + 1]!);
          setBaseline('');
        } else if (batch) {
          setPosition(batch.questions.length);
          loadQuestion(newQuestion(question.subject, question));
        }
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    const saved = receipt;
    if (!saved) return;
    try {
      if (saved.previous) await unwrap(window.qb.bank.restore([saved.previous]));
      else await unwrap(window.qb.bank.delete([saved.question.id]));
      if (batch)
        setBatch((b) =>
          b
            ? { ...b, questions: b.questions.map((q) => (q.id === saved.question.id ? { ...q, id: '' } : q)) }
            : b,
        );
      setSaved(undefined);
      setReceipt(undefined);
      if (question.id === saved.question.id) {
        loadQuestion(saved.previous ?? { ...saved.question, id: '', createdAt: '', updatedAt: '' });
        setBaseline('');
      }
    } catch (cause) {
      setError((cause as Error).message);
    }
  };
  return {
    question,
    change,
    assets,
    setAssets,
    loading,
    busy,
    error,
    setError,
    diagnostics,
    checked: checked === version,
    detail,
    painted,
    setPainted,
    dirty,
    unsavedCurrent: version !== baseline,
    batch,
    position,
    statuses,
    next,
    parse,
    overwrite,
    setOverwrite,
    acceptParse,
    save,
    warning,
    setWarning,
    duplicates,
    setDuplicates,
    saved,
    receipt,
    undo,
    setAdvanceAfterSave,
    loadQuestion,
    setBatch,
    applyBatch: (nextBatch: EditorParseResult, nextQuestion?: Question) => {
      setBatch(nextBatch);
      if (nextQuestion) {
        if (version === baseline) loadQuestion(nextQuestion);
        else change(nextQuestion);
      }
    },
    continueAdd: () => {
      loadQuestion(newQuestion(question.subject, question));
      setSaved(undefined);
      setBatch(undefined);
      setPosition(0);
      setStatuses({});
      setAssets({});
    },
  };
}
