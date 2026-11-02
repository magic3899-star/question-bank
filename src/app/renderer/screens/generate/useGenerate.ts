import { useCallback, useEffect, useRef, useState } from 'react';
import type { RuleSet } from '../../../../contracts/index';
import type {
  ExamSession,
  ExportProgress,
  ExportRequest,
  ExportResult,
  RuleCheck,
  RuleSummary,
  ShuffleSettings,
} from '../../../shared/index';
import { setNavigationGuard, unwrap } from '../../lib/index';

export type Step = 1 | 2 | 3 | 4 | 5;

export interface GenerateOptions {
  shuffle: ShuffleSettings;
  excludeRecentExams: number;
  seed: string;
  titleTemplate: string;
}

export const defaultOptions: GenerateOptions = {
  shuffle: {
    shuffleQuestionOrder: true,
    shuffleChoices: true,
    balanceAnswerPositions: true,
    minAnswerPositionShare: 0.1,
  },
  excludeRecentExams: 0,
  seed: '',
  titleTemplate: '',
};

export function useGenerate(initial: { ruleId?: string; seed?: string }) {
  const [step, setStep] = useState<Step>(1);
  const [rules, setRules] = useState<RuleSummary[]>();
  const [ruleId, setRuleId] = useState(initial.ruleId ?? '');
  const [rule, setRule] = useState<RuleSet>();
  const [check, setCheck] = useState<RuleCheck>();
  const [options, setOptions] = useState<GenerateOptions>({ ...defaultOptions, seed: initial.seed ?? '' });
  const [session, setSession] = useState<ExamSession>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<ExportProgress>();
  const [saved, setSaved] = useState<ExportResult>();
  const sessionRef = useRef<string | undefined>(undefined);

  const run = useCallback(async <T>(label: string, action: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label);
    setError('');
    try {
      return await action();
    } catch (cause) {
      setError((cause as Error).message);
      return undefined;
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => {
    void run('규칙 목록', async () => setRules(await unwrap(window.qb.rules.list())));
  }, [run]);

  useEffect(() => {
    if (!ruleId) return;
    void run('사전 점검', async () => {
      const loaded = await unwrap(window.qb.rules.get(ruleId));
      setRule(loaded);
      setCheck(await unwrap(window.qb.rules.check(loaded)));
    });
  }, [ruleId, run]);

  useEffect(() => window.qb.exam.onExportProgress(setProgress), []);

  // 만든 시험이 있으면 다른 화면으로 갈 때 확인하고, 떠나면 main 의 세션을 정리한다.
  useEffect(() => {
    sessionRef.current = session?.sessionId;
    setNavigationGuard(!!session && !saved);
  }, [session, saved]);
  useEffect(
    () => () => {
      setNavigationGuard(false);
      if (sessionRef.current) void window.qb.exam.discard(sessionRef.current);
    },
    [],
  );

  const generate = () =>
    run('시험을 만드는 중', async () => {
      if (session) await window.qb.exam.discard(session.sessionId);
      const created = await unwrap(
        window.qb.exam.generate({
          ruleSetId: ruleId,
          seed: options.seed.trim() || undefined,
          shuffle: options.shuffle,
          excludeRecentExams: options.excludeRecentExams || undefined,
          titleTemplate: options.titleTemplate.trim() || undefined,
        }),
      );
      setSession(created);
      setSaved(undefined);
      setStep(4);
    });
  const replace = (examIndex: number, number: number) =>
    run(`${number}번 문제를 바꾸는 중`, async () => {
      if (!session) return;
      setSession(await unwrap(window.qb.exam.replace({ sessionId: session.sessionId, examIndex, number })));
    });
  const regenerate = (examIndex: number) =>
    run(`${examIndex + 1}회를 다시 뽑는 중`, async () => {
      if (!session) return;
      setSession(await unwrap(window.qb.exam.regenerate({ sessionId: session.sessionId, examIndex })));
    });
  const save = (request: Omit<ExportRequest, 'source'>) =>
    run('파일을 저장하는 중', async () => {
      if (!session) return;
      setProgress(undefined);
      const result = await unwrap(
        window.qb.exam.export({ ...request, source: { sessionId: session.sessionId } }),
      );
      if (result) {
        setSaved(result);
        setSession(await unwrap(window.qb.exam.get(session.sessionId)));
      }
    });
  return {
    step,
    setStep,
    rules,
    ruleId,
    setRuleId,
    rule,
    check,
    options,
    setOptions,
    session,
    busy,
    error,
    setError,
    progress,
    saved,
    generate,
    replace,
    regenerate,
    save,
  };
}
