import { useEffect, useState } from 'react';
import type { BankStats, ObjectiveNode, QuestionDetail } from '../../../shared/index';
import { useApi } from '../../hooks/index';
import { unwrap } from '../../lib/index';

export function useBankData(query: URLSearchParams) {
  const [subject, setSubject] = useState(query.get('subject') ?? '');
  const [objective, setObjective] = useState('');
  const [withoutObjective, setWithoutObjectiveValue] = useState(query.get('withoutObjective') === '1');
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState<{ list: unknown; id: string }>();
  useEffect(() => {
    const timer = setTimeout(() => {
      setText(search.trim());
      setOffset(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);
  const overview = useApi<{ stats: BankStats; tree: Record<string, ObjectiveNode[]> }>(async () => {
    const stats = await unwrap(window.qb.bank.stats());
    const trees = await Promise.all(
      stats.bySubject.map(
        async (s) => [s.subject, await unwrap(window.qb.bank.objectiveTree(s.subject))] as const,
      ),
    );
    return { ok: true, value: { stats, tree: Object.fromEntries(trees) } };
  }, []);
  const list = useApi(
    () =>
      window.qb.bank.list({
        subject: subject || undefined,
        objectivePrefix: objective || undefined,
        text: text || undefined,
        withoutObjective,
        offset,
        limit: 50,
      }),
    [subject, objective, text, withoutObjective, offset],
  );
  const selected = selection?.list === list.value ? (selection?.id ?? '') : (list.value?.items[0]?.id ?? '');
  const detail = useApi<QuestionDetail | undefined>(
    async () => (selected ? window.qb.bank.get(selected) : { ok: true, value: undefined }),
    [selected],
  );
  const filter = (nextSubject: string, code = '') => {
    setSubject(nextSubject);
    setObjective(code);
    setOffset(0);
  };
  const setWithoutObjective = (value: boolean) => {
    setWithoutObjectiveValue(value);
    setOffset(0);
  };
  const retry = () => {
    overview.retry();
    list.retry();
    detail.retry();
  };
  return {
    stats: overview.value?.stats,
    tree: overview.value?.tree ?? {},
    subject,
    objective,
    withoutObjective,
    search,
    setSearch,
    offset,
    setOffset,
    items: list.value?.items ?? [],
    total: list.value?.total ?? 0,
    selected,
    select: (id: string) => setSelection({ list: list.value, id }),
    loading: list.loading,
    overviewLoading: overview.loading,
    error: list.error || overview.error,
    detail: detail.value,
    detailLoading: !!selected && detail.loading,
    detailError: detail.error,
    retry,
    retryDetail: detail.retry,
    filter,
    setWithoutObjective,
  };
}
