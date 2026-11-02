import { useEffect } from 'react';
import { navigate } from './router';

export function useShortcuts(route: string, undo?: () => void): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        if (route !== 'bank') navigate('bank');
        timer = setTimeout(() => document.getElementById('quick-search')?.focus(), 100);
      }
      if (key === 'n' || key === 'g') {
        event.preventDefault();
        navigate(key === 'n' ? 'add' : 'generate');
      }
      if (
        key === 'z' &&
        !event.shiftKey &&
        undo &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer);
    };
  }, [route, undo]);
}
