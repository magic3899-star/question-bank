import { useCallback, useEffect, useRef, useState } from 'react';
import type { DependencyList } from 'react';
import type { Result } from '../../shared/index';
import { unwrap } from '../lib/index';

export function useApi<T>(request: () => Promise<Result<T>>, dependencies: DependencyList) {
  const requestRef = useRef(request);
  requestRef.current = request;
  const [revision, setRevision] = useState(0);
  const key = [...dependencies, revision];
  const [state, setState] = useState<{ value?: T; error: string; loading: boolean; key: DependencyList }>({
    error: '',
    loading: true,
    key,
  });
  const retry = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setState({ error: '', loading: true, key });
    const currentRequest = requestRef.current;
    void unwrap(Promise.resolve().then(currentRequest)).then(
      (value) => {
        if (active) setState({ value, error: '', loading: false, key });
      },
      (cause: Error) => {
        if (active) setState({ error: cause.message, loading: false, key });
      },
    );
    return () => {
      active = false;
    };
  }, [...dependencies, revision]);
  const current =
    key.length === state.key.length && key.every((value, index) => Object.is(value, state.key[index]));
  return {
    value: current ? state.value : undefined,
    error: current ? state.error : '',
    loading: !current || state.loading,
    retry,
  };
}
