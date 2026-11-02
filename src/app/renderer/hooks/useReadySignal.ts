import { useEffect } from 'react';
export function useReadySignal(route: string, loading: boolean, error = '', enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    delete document.body.dataset.ready;
    document.body.dataset.error = error;
    if (!loading) {
      document.body.dataset.ready = route;
    }
    return () => {
      delete document.body.dataset.ready;
    };
  }, [route, loading, error, enabled]);
}
