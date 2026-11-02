import { useState } from 'react';
import { useApi } from '../../hooks/index';
import { unwrap } from '../../lib/index';

export function usePasteJoin(initial: 'space' | 'none' = 'space') {
  const settings = useApi(() => window.qb.settings.get(), []);
  const [selected, setSelected] = useState<'space' | 'none'>();
  return {
    value: selected ?? settings.value?.pasteJoin ?? initial,
    loading: settings.loading,
    error: settings.error,
    change: async (value: 'space' | 'none') => {
      setSelected(value);
      await unwrap(window.qb.settings.update({ pasteJoin: value }));
    },
  };
}
