import { useEffect } from 'react';
import type { Theme } from '../../shared/index';

export function useTheme(theme: Theme | undefined, hash: string): void {
  useEffect(() => {
    if (!theme) return;
    const capture = document.documentElement.dataset.captureTheme;
    if (capture) document.documentElement.dataset.theme = capture;
    else if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme, hash]);
}
