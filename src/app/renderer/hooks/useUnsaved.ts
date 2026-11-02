import { useEffect } from 'react';
import { setNavigationGuard } from '../lib/index';

export function useUnsaved(dirty: boolean) {
  useEffect(() => {
    setNavigationGuard(dirty);
    void window.qb.editor.setDirty(dirty);
    return () => {
      setNavigationGuard(false);
      void window.qb.editor.setDirty(false);
    };
  }, [dirty]);
}
